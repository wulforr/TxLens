import type { Abi, Address } from 'viem'
import { RAW_LABELS } from './labelpack.data'

export interface LabelEntry {
  chainId: number
  address: Address
  name: string
  abi: Abi | null
}

export const LABELS: readonly LabelEntry[] = RAW_LABELS.map((entry) => ({
  ...entry,
  address: entry.address.toLowerCase() as Address,
}))

const INDEX = new Map<string, LabelEntry>(
  LABELS.map((entry) => [`${entry.chainId}:${entry.address}`, entry]),
)

export function lookupLabel(chainId: number, address: string): LabelEntry | undefined {
  return INDEX.get(`${chainId}:${address.toLowerCase()}`)
}
