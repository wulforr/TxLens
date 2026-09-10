import type { AssetRef } from '~~/server/flow/assets'
import { assetKey } from '~~/server/flow/assets'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { truncateAddress } from './address'

export const RAW_UNITS_MARKER = 'raw units, decimals unknown'

/**
 * Render an amount only when the decimals are actually known.
 *
 * A wrong number stated confidently is worse than an honest raw value: the
 * reader has no way to tell that 2336944687482834621909 was meant to be
 * 2,336.94 rather than a number in the sextillions.
 */
export function formatAmount(
  amount: bigint,
  asset: AssetRef,
  tokens: Map<string, TokenMeta>,
  nativeSymbol = 'ETH',
): string {
  if (asset.kind === 'native') return `${formatUnits(amount, 18)} ${nativeSymbol}`

  if (asset.kind === 'nft') {
    const meta = tokens.get(assetKey(asset))
    const name = meta?.symbol ?? truncateAddress(asset.address)
    return amount === 1n ? `${name} #${asset.tokenId}` : `${amount} × ${name} #${asset.tokenId}`
  }

  const meta = tokens.get(assetKey(asset))
  const symbol = meta?.symbol ?? truncateAddress(asset.address)
  if (meta?.decimals === null || meta?.decimals === undefined) {
    return `${amount} ${symbol} (${RAW_UNITS_MARKER})`
  }
  return `${formatUnits(amount, meta.decimals)} ${symbol}`
}

/** Fixed-point division with thousands separators and no trailing zero noise. */
export function formatUnits(amount: bigint, decimals: number): string {
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = absolute / base
  const fraction = absolute % base

  const wholeText = whole.toLocaleString('en-US')
  if (fraction === 0n) return `${negative ? '-' : ''}${wholeText}`

  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  // Six places is enough to be useful and short enough to read at a glance.
  const trimmed = fractionText.slice(0, 6)
  return `${negative ? '-' : ''}${wholeText}.${trimmed}`
}
