import type { Address } from 'viem'

export type AssetRef =
  | { kind: 'native' }
  | { kind: 'erc20'; address: Address }
  | { kind: 'nft'; address: Address; tokenId: string }

/** Stable string identity for an asset, used as a map key everywhere. */
export function assetKey(asset: AssetRef): string {
  switch (asset.kind) {
    case 'native':
      return 'native'
    case 'erc20':
      return `erc20:${asset.address}`
    case 'nft':
      return `nft:${asset.address}:${asset.tokenId}`
  }
}

export const NATIVE: AssetRef = { kind: 'native' }

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

export function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS
}
