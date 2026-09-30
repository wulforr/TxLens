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

/**
 * Fixed-point division with thousands separators, rounded, no trailing zeros.
 * Precision follows size: two decimals once an amount reaches the thousands
 * ("8,877,507.35 DAI", not "8,877,507.348306"), six below that so small token
 * amounts like 0.011893 WBTC keep their meaning.
 */
const SCALES: [string, bigint][] = [
  ['quadrillion', 10n ** 15n],
  ['trillion', 10n ** 12n],
  ['billion', 10n ** 9n],
]

export function formatUnits(amount: bigint, decimals: number): string {
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const sign = negative ? '-' : ''

  // Past a billion, digits stop meaning anything to a reader: "50.69 trillion"
  // lands, "50,693,552,078,053.78" doesn't.
  for (const [word, size] of SCALES) {
    if (absolute / base >= size) {
      const hundredths = (absolute * 100n + (size * base) / 2n) / (size * base)
      const text =
        `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}`.replace(
          /\.?0+$/,
          '',
        )
      return `${sign}${text} ${word}`
    }
  }

  const digits = Math.min(decimals, absolute / base >= 1000n ? 2 : 6)
  const scale = 10n ** BigInt(digits)
  const rounded = (absolute * scale + base / 2n) / base
  const whole = (rounded / scale).toLocaleString('en-US')
  const fraction =
    digits > 0 ? (rounded % scale).toString().padStart(digits, '0').replace(/0+$/, '') : ''
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`
}

/**
 * A narrative headline, as renderable pieces. Amounts are structured so the UI
 * can put a token chip (icon + symbol) next to the number — a plain string
 * cannot, and a symbol like "01" rendered as text reads as part of the number.
 */
export type NarrativePart =
  | { kind: 'text'; text: string }
  | {
      kind: 'amount'
      /** The same string formatAmount produces, used for the plain headline. */
      text: string
      value: string
      symbol: string
      iconUrl: string | null
      address: string | null
      /** Decimals unknown: value is in raw units. */
      raw: boolean
      /** For pricing on the client: which asset, and how many base units. */
      assetKey: string
      units: string
    }

export const text = (value: string): NarrativePart => ({ kind: 'text', text: value })

export function amountPart(
  amount: bigint,
  asset: AssetRef,
  tokens: Map<string, TokenMeta>,
  nativeSymbol = 'ETH',
): NarrativePart {
  const full = formatAmount(amount, asset, tokens, nativeSymbol)
  const priced = { assetKey: assetKey(asset), units: amount.toString() }
  if (asset.kind === 'native') {
    return {
      kind: 'amount',
      text: full,
      value: formatUnits(amount, 18),
      symbol: nativeSymbol,
      iconUrl: null,
      address: null,
      raw: false,
      ...priced,
    }
  }
  const meta = tokens.get(assetKey(asset))
  const symbol = meta?.symbol ?? truncateAddress(asset.address)
  const base = {
    kind: 'amount' as const,
    text: full,
    symbol,
    iconUrl: meta?.iconUrl ?? null,
    address: asset.address,
    ...priced,
  }
  if (asset.kind === 'nft') return { ...base, value: `#${asset.tokenId}`, raw: false }
  const raw = meta?.decimals === null || meta?.decimals === undefined
  return {
    ...base,
    value: raw ? amount.toString() : formatUnits(amount, meta.decimals as number),
    raw,
  }
}

export function partsToText(parts: NarrativePart[]): string {
  return parts.map((part) => part.text).join('')
}

const AMOUNT_ARGS = new Set(['value', 'amount', 'wad'])

/**
 * Show an event's amount argument in real units when we know how: only for
 * events the token contract itself emitted (Transfer, Approval, Deposit…) and
 * only when its decimals are known. Anywhere else a bare integer could mean
 * anything, so it is left alone rather than guessed at.
 */
export function formatLogArg(
  logAddress: string,
  arg: { name: string; type: string; value: string },
  tokens: Record<string, TokenMeta>,
): string | null {
  if (!arg.type.startsWith('uint') || !AMOUNT_ARGS.has(arg.name)) return null
  const meta = tokens[`erc20:${logAddress.toLowerCase()}`]
  if (meta?.decimals === null || meta?.decimals === undefined) return null
  try {
    return `${formatUnits(BigInt(arg.value), meta.decimals)} ${meta.symbol ?? ''}`.trim()
  } catch {
    return null
  }
}
