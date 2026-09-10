import type { Hex } from 'viem'
import type { HttpClient } from '~~/server/utils/http'
import { normaliseAddress } from '~~/shared/address'
import type { ChainConfig } from '~~/shared/chains'
import type {
  CallActivity,
  CallKind,
  Coverage,
  FlatCall,
  RawLog,
  RawTransaction,
  SectionStatus,
} from '~~/shared/types'

interface BlockscoutAddress {
  hash: string
}

interface BlockscoutRevertParameter {
  name?: string
  type?: string
  value?: unknown
}

/**
 * Blockscout does not return a revert string. It returns either nothing, a
 * decoded error call, or the undecodable raw payload. Verified against
 * eth.blockscout.com on 2026-09-10.
 */
type BlockscoutRevertReason =
  | string
  | { raw: string }
  | { method_call: string; method_id?: string; parameters?: BlockscoutRevertParameter[] }
  | null

interface BlockscoutTransaction {
  hash: string
  block_number: number
  timestamp: string
  from: BlockscoutAddress
  to: BlockscoutAddress | null
  value: string
  raw_input: string
  status: string
  revert_reason: BlockscoutRevertReason
  gas_used: string
  gas_price: string
}

interface BlockscoutLogItem {
  address: BlockscoutAddress
  /** Padded out to four entries with nulls. */
  topics: (string | null)[]
  data: string
  index: number
}

interface BlockscoutInternalItem {
  type: string
  from: BlockscoutAddress
  to: BlockscoutAddress | null
  value: string
  error: string | null
}

const CALL_KINDS: Record<string, CallKind> = {
  call: 'CALL',
  delegatecall: 'DELEGATECALL',
  staticcall: 'STATICCALL',
  callcode: 'CALLCODE',
  create: 'CREATE',
  create2: 'CREATE2',
  selfdestruct: 'SELFDESTRUCT',
}

/** Selector of the builtin `Error(string)`, whose only argument is the reason. */
const ERROR_STRING_SELECTOR = '08c379a0'

function toBigInt(value: string | null | undefined): bigint {
  if (!value) return 0n
  return BigInt(value)
}

function toCallKind(value: string): CallKind {
  return CALL_KINDS[value.toLowerCase()] ?? 'CALL'
}

function toRevertReason(reason: BlockscoutRevertReason): string | null {
  if (reason === null || reason === undefined) return null
  if (typeof reason === 'string') return reason || null

  if ('method_call' in reason) {
    const parameters = reason.parameters ?? []
    if (reason.method_id === ERROR_STRING_SELECTOR && parameters.length > 0) {
      return String(parameters[0]?.value ?? '') || null
    }
    // A custom error: keep the name, drop the parameter types, keep the values.
    const name = reason.method_call.split('(')[0] ?? reason.method_call
    return `${name}(${parameters.map((parameter) => String(parameter.value ?? '')).join(', ')})`
  }

  if ('raw' in reason) return reason.raw || null
  return null
}

/** 20 pages at 50 items is 1000 records — beyond that the diagram is unreadable anyway. */
export const MAX_PAGES = 20

interface PagedResponse<T> {
  items: T[]
  next_page_params: Record<string, unknown> | null
}

export interface PagedResult<T> {
  items: T[]
  /** A partial read: the page cap was hit, or a later page failed. */
  truncated: boolean
  /** The very first page failed, so we have nothing — distinct from "no data". */
  failed: boolean
}

/**
 * Follow Blockscout's `next_page_params` until exhausted or capped.
 *
 * Blockscout pages at 50 items. Reading only the first page silently drops
 * data on exactly the large transactions this project exists to explain, so
 * the caller is told whether what it got is complete, partial, or nothing.
 */
export async function fetchPagedItems<T>(http: HttpClient, url: string): Promise<PagedResult<T>> {
  const items: T[] = []
  let query = ''

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await http.getJson<PagedResponse<T>>(`${url}${query}`)

    if (!result.ok) {
      // A first-page failure means "we have nothing"; a later one means
      // "we have part of it". Collapsing the two lets a transient upstream
      // error masquerade as an empty result.
      return { items, truncated: page > 0, failed: page === 0 }
    }

    items.push(...result.data.items)

    const next = result.data.next_page_params
    if (!next) return { items, truncated: false, failed: false }

    const params = Object.entries(next)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)])
    query = `?${new URLSearchParams(params).toString()}`
  }

  return { items, truncated: true, failed: false }
}

function statusOf(result: { truncated: boolean; failed: boolean }): SectionStatus {
  if (result.failed) return 'unavailable'
  return result.truncated ? 'truncated' : 'complete'
}

export async function fetchFromBlockscout(
  http: HttpClient,
  chain: ChainConfig,
  hash: Hex,
): Promise<RawTransaction | null> {
  const base = `${chain.blockscoutBase}/api/v2/transactions/${hash}`

  const core = await http.getJson<BlockscoutTransaction>(base)
  if (!core.ok) return null

  const [logsResult, internalResult] = await Promise.all([
    fetchPagedItems<BlockscoutLogItem>(http, `${base}/logs`),
    fetchPagedItems<BlockscoutInternalItem>(http, `${base}/internal-transactions`),
  ])

  const logs: RawLog[] = logsResult.items.map((item) => ({
    address: normaliseAddress(item.address.hash),
    topics: item.topics.filter((topic): topic is string => topic !== null) as Hex[],
    data: item.data as Hex,
    logIndex: item.index,
  }))

  const calls: FlatCall[] = internalResult.items.map((item) => ({
    kind: toCallKind(item.type),
    from: normaliseAddress(item.from.hash),
    to: item.to ? normaliseAddress(item.to.hash) : null,
    value: toBigInt(item.value),
    error: item.error,
  }))

  // Blockscout returns internal transactions as a flat list with no parent
  // information, so this can never be a tree. Only a real callTracer can be.
  const activity: CallActivity = calls.length > 0 ? { kind: 'flat', calls } : { kind: 'none' }

  const coverage: Coverage = {
    logs: statusOf(logsResult),
    calls: statusOf(internalResult),
  }

  return {
    chainId: chain.id,
    hash,
    blockNumber: BigInt(core.data.block_number),
    timestamp: Math.floor(Date.parse(core.data.timestamp) / 1000),
    from: normaliseAddress(core.data.from.hash),
    to: core.data.to ? normaliseAddress(core.data.to.hash) : null,
    value: toBigInt(core.data.value),
    input: (core.data.raw_input ?? '0x') as Hex,
    status: core.data.status === 'ok' ? 'success' : 'reverted',
    revertReason: toRevertReason(core.data.revert_reason),
    gasUsed: toBigInt(core.data.gas_used),
    effectiveGasPrice: toBigInt(core.data.gas_price),
    logs,
    activity,
    coverage,
    provenance: calls.length > 0 ? 'internalTransactions' : 'logsOnly',
    sourceName: 'blockscout',
  }
}
