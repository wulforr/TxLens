import type { DecodedLog } from '~~/server/decode/logs'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { amountPart, type NarrativePart } from './format'
import { humanize, type ServiceKind } from './names'
import type { AddressInfo } from './types'
import type { WireFlowEdge } from './wire'

export type Role = 'sender' | 'named' | 'wallet' | 'contract' | 'unknown' | 'zero'

export interface Participant {
  address: string
  label: string
  role: Role
  /** From the data source: a program (true), an ordinary account (false), or unknown. */
  isContract?: boolean | null
  /** Position in PARTY_TONES, by first appearance; absent for the sender and the zero address. */
  tone?: number
  kind?: ServiceKind | null
  flagged?: boolean
  /** The sender's own public name, since its label is always "Sender". */
  knownAs?: string | null
}

/**
 * Dot colours, handed out in order of appearance. Hues are spread round the
 * wheel and neighbours alternate light and dark, so adjacent participants never
 * look alike. Pure reds and greens (failed/succeeded) and the sender's brass are
 * left out. Colour is never the only cue: every dot sits beside a label.
 */
export const PARTY_TONES = [
  { hue: 210, light: 64 },
  { hue: 330, light: 70 },
  { hue: 170, light: 48 },
  { hue: 75, light: 60 },
  { hue: 270, light: 78 },
  { hue: 195, light: 82 },
] as const

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
  /** The contract the sender called. When it has no name, its role is the best label we have. */
  called?: string | null,
): Record<string, Participant> {
  const tokenSymbols = new Map(
    Object.values(tokens).map((t) => [t.address.toLowerCase(), t.symbol]),
  )
  const counters: Record<string, number> = {}
  const out: Record<string, Participant> = {}
  let tone = 0

  for (const raw of addresses) {
    const address = raw.toLowerCase()
    if (out[address]) continue
    const isContract = names[address]?.isContract ?? (tokenSymbols.has(address) ? true : null)
    if (address === ZERO_ADDRESS) {
      out[address] = { address, label: 'the zero address', role: 'zero' }
    } else if (address === sender.toLowerCase()) {
      out[address] = { address, label: 'Sender', role: 'sender' }
    } else if (names[address]?.name) {
      out[address] = {
        address,
        label: humanize(names[address].name as string),
        role: 'named',
        isContract,
      }
    } else if (called && address === called.toLowerCase() && names[address]?.isContract !== false) {
      out[address] = { address, label: 'Called contract', role: 'contract', isContract: true }
    } else if (tokenSymbols.get(address)) {
      out[address] = {
        address,
        label: `${tokenSymbols.get(address)} token contract`,
        role: 'named',
        isContract,
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
        isContract,
      }
    }
    const person = out[address]
    person.kind = names[address]?.kind ?? null
    person.flagged = Boolean(names[address]?.flagged)
    if (person.role === 'sender') person.knownAs = names[address]?.name ?? null
    if (person.role !== 'sender' && person.role !== 'zero') person.tone = tone++
  }
  return out
}

export interface Step {
  from: string
  to: string
  kind: 'transfer' | 'mint' | 'burn'
  amount: NarrativePart
  usd: number | null
  /** Contracts the value passed straight through on the way ("via Contract A"). */
  via: string[]
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
        via: edge.via ?? [],
      }
    })
}

/** USD for an amount part, when its asset is priced and its decimals known. */
export function partUsd(
  part: NarrativePart,
  tokens: Record<string, TokenMeta>,
  prices: Record<string, number>,
): number | null {
  if (part.kind !== 'amount' || part.raw) return null
  const price = prices[part.assetKey]
  const decimals = part.assetKey === 'native' ? 18 : tokens[part.assetKey]?.decimals
  if (price === undefined || typeof decimals !== 'number') return null
  return (Number(part.units) / 10 ** decimals) * price
}

export function usdText(value: number): string {
  if (value < 0.01) return '< $0.01'
  // Big money reads as words: "$1.13 billion" lands, "$1,132,901,592" doesn't.
  if (value >= 1e9) return `≈ $${(value / 1e9).toFixed(2).replace(/\.?0+$/, '')} billion`
  if (value >= 1e6) return `≈ $${(value / 1e6).toFixed(2).replace(/\.?0+$/, '')} million`
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
