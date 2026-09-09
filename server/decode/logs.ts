import { type Abi, type AbiEvent, type Address, decodeEventLog, type Hex } from 'viem'
import { ERC20_ABI, ERC721_ABI, ERC1155_ABI, WETH_ABI } from '~~/server/abi/labelpack.data'
import type { AbiResolver } from '~~/server/abi/resolve'
import type { RawLog } from '~~/shared/types'
import type { DecodedArg } from './calls'

export interface DecodedLog {
  confidence: 'decoded' | 'raw'
  address: Address
  contractName: string | null
  eventName: string | null
  signature: string | null
  args: DecodedArg[]
  topic0: Hex | null
  logIndex: number
}

/**
 * Tried when a contract's own ABI is unavailable or does not contain the event.
 * Standard event topics are identical across every implementation, so an
 * unverified token's transfers still decode.
 */
const STANDARD_ABIS: Abi[] = [ERC20_ABI, ERC721_ABI, ERC1155_ABI, WETH_ABI]

function stringifyValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(', ')}]`
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * viem returns EIP-55 checksummed addresses. Everything else in this codebase
 * stores addresses lowercased, and a payload mixing both forms invites a
 * comparison bug downstream. Nested tuples are not walked — only whole
 * address and address[] arguments.
 */
function formatArgValue(type: string, value: unknown): string {
  const text = stringifyValue(value)
  return type.startsWith('address') ? text.toLowerCase() : text
}

function attempt(
  abi: Abi,
  log: RawLog,
): Pick<DecodedLog, 'eventName' | 'signature' | 'args'> | null {
  try {
    const { eventName, args } = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    })
    const entry = abi.find(
      (item): item is AbiEvent => item.type === 'event' && item.name === eventName,
    )
    const inputs = entry?.inputs ?? []
    const values = args as Record<string, unknown> | readonly unknown[] | undefined

    const mapped: DecodedArg[] = inputs.map((input, index) => {
      const name = input.name || `arg${index}`
      const raw = Array.isArray(values)
        ? values[index]
        : (values as Record<string, unknown> | undefined)?.[name]
      return { name, type: input.type, value: formatArgValue(input.type, raw) }
    })

    return {
      eventName,
      signature: `${eventName}(${inputs.map((i) => i.type).join(',')})`,
      args: mapped,
    }
  } catch {
    return null
  }
}

export async function decodeLogs(logs: RawLog[], resolver: AbiResolver): Promise<DecodedLog[]> {
  return Promise.all(
    logs.map(async (log): Promise<DecodedLog> => {
      const resolution = await resolver.forAddress(log.address)
      const contractName = resolution.kind === 'full' ? resolution.name : null

      const base: DecodedLog = {
        confidence: 'raw',
        address: log.address,
        contractName,
        eventName: null,
        signature: null,
        args: [],
        topic0: (log.topics[0] as Hex | undefined) ?? null,
        logIndex: log.logIndex,
      }

      if (log.topics.length === 0) return base

      const candidates: Abi[] =
        resolution.kind === 'full' ? [resolution.abi, ...STANDARD_ABIS] : STANDARD_ABIS

      for (const abi of candidates) {
        const decoded = attempt(abi, log)
        if (decoded) return { ...base, confidence: 'decoded', ...decoded }
      }

      return base
    }),
  )
}
