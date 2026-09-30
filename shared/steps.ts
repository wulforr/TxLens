import type { DecodedLog } from '~~/server/decode/logs'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { amountPart, type NarrativePart } from './format'
import { humanize } from './names'
import type { AddressInfo } from './types'
import type { WireFlowEdge } from './wire'

export type Role = 'sender' | 'named' | 'wallet' | 'contract' | 'unknown' | 'zero'

export interface Participant {
  address: string
  label: string
  role: Role
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Give every address a label a person can hold in their head. The sender is
 * "Sender"; a known name is used in words; anything else gets a stable alias by
 * kind and first appearance ("Contract A", "Wallet B"), so the same address
 * reads the same everywhere on the page instead of as matching hex fragments.
 */
export function labelParticipants(
  addresses: string[],
  sender: string,
  names: Record<string, AddressInfo>,
  tokens: Record<string, TokenMeta>,
): Record<string, Participant> {
  const tokenSymbols = new Map(
    Object.values(tokens).map((t) => [t.address.toLowerCase(), t.symbol]),
  )
  const counters: Record<string, number> = {}
  const out: Record<string, Participant> = {}

  for (const raw of addresses) {
    const address = raw.toLowerCase()
    if (out[address]) continue
    if (address === ZERO_ADDRESS) {
      out[address] = { address, label: 'the zero address', role: 'zero' }
    } else if (address === sender.toLowerCase()) {
      out[address] = { address, label: 'Sender', role: 'sender' }
    } else if (names[address]?.name) {
      out[address] = { address, label: humanize(names[address].name as string), role: 'named' }
    } else if (tokenSymbols.get(address)) {
      out[address] = {
        address,
        label: `${tokenSymbols.get(address)} token contract`,
        role: 'named',
      }
    } else {
      const kind = names[address]?.isContract
      const prefix = kind === true ? 'Contract' : kind === false ? 'Wallet' : 'Address'
      const n = counters[prefix] ?? 0
      counters[prefix] = n + 1
      out[address] = {
        address,
        label: `${prefix} ${n < LETTERS.length ? LETTERS[n] : n + 1}`,
        role: kind === true ? 'contract' : kind === false ? 'wallet' : 'unknown',
      }
    }
  }
  return out
}

export interface Step {
  from: string
  to: string
  kind: 'transfer' | 'mint' | 'burn'
  amount: NarrativePart
  usd: number | null
}

/** One plain-language step per value movement, in the order it happened. */
export function toSteps(
  flow: WireFlowEdge[],
  tokens: Record<string, TokenMeta>,
  prices: Record<string, number>,
  nativeSymbol: string,
): Step[] {
  const tokenMap = new Map(Object.entries(tokens))
  return flow
    .filter((edge) => edge.from !== edge.to && BigInt(edge.amount) > 0n)
    .sort((a, b) => a.order - b.order)
    .map((edge) => {
      const amount = BigInt(edge.amount)
      const decimals =
        edge.asset.kind === 'native'
          ? 18
          : edge.asset.kind === 'erc20'
            ? tokens[edge.assetKey]?.decimals
            : null
      const price = prices[edge.assetKey]
      return {
        from: edge.from,
        to: edge.to,
        kind: edge.from === ZERO_ADDRESS ? 'mint' : edge.to === ZERO_ADDRESS ? 'burn' : 'transfer',
        amount: amountPart(amount, edge.asset, tokenMap, nativeSymbol),
        usd:
          price !== undefined && typeof decimals === 'number'
            ? (Number(amount) / 10 ** decimals) * price
            : null,
      }
    })
}

export function usdText(value: number): string {
  if (value < 0.01) return '< $0.01'
  if (value >= 1000) return `≈ $${Math.round(value).toLocaleString('en-US')}`
  return `≈ $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface EventGroup {
  key: string
  eventName: string | null
  address: string
  items: DecodedLog[]
}

/**
 * Collapse repeats of one event from one contract. A batch mint emits the same
 * event a hundred times; "100× MintClaimed" is information, a hundred rows is not.
 */
export function groupEvents(logs: DecodedLog[]): EventGroup[] {
  const groups = new Map<string, EventGroup>()
  for (const log of logs) {
    const key = `${log.address}|${log.eventName ?? log.topic0}`
    const group = groups.get(key)
    if (group) group.items.push(log)
    else groups.set(key, { key, eventName: log.eventName, address: log.address, items: [log] })
  }
  return [...groups.values()]
}
