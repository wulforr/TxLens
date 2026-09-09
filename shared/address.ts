import type { Address } from 'viem'

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export function normaliseAddress(value: string): Address {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(`invalid address: ${value}`)
  }
  return value.toLowerCase() as Address
}

export function truncateAddress(value: string, lead = 8, tail = 6): string {
  if (value.length <= lead + tail + 1) return value
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}
