import { type AbiFunction, type Address, decodeFunctionData, type Hex, slice } from 'viem'
import type { AbiResolver } from '~~/server/abi/resolve'

export interface DecodedArg {
  name: string
  type: string
  value: string
}

export interface DecodedCall {
  /** How much we actually know. The UI renders each of these differently. */
  confidence: 'decoded' | 'signatureOnly' | 'raw' | 'nativeTransfer'
  contractName: string | null
  via: Address | null
  functionName: string | null
  signature: string | null
  selector: Hex | null
  args: DecodedArg[]
  raw: Hex
}

/** Everything crossing the API edge is a string. bigints do not survive JSON. */
function stringifyValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(', ')}]`
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    return JSON.stringify(value, (_key, entry) =>
      typeof entry === 'bigint' ? entry.toString() : entry,
    )
  }
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

export async function decodeCallInput(
  input: Hex,
  resolver: AbiResolver,
  target: Address | null,
): Promise<DecodedCall> {
  const base: DecodedCall = {
    confidence: 'raw',
    contractName: null,
    via: null,
    functionName: null,
    signature: null,
    selector: null,
    args: [],
    raw: input,
  }

  if (!input || input === '0x' || input.length < 10) {
    return { ...base, confidence: 'nativeTransfer' }
  }

  const selector = slice(input, 0, 4)
  const withSelector: DecodedCall = { ...base, selector }

  const resolution = target ? await resolver.forAddress(target) : { kind: 'unknown' as const }

  if (resolution.kind === 'full') {
    const named = { ...withSelector, contractName: resolution.name, via: resolution.via }
    try {
      const { functionName, args } = decodeFunctionData({ abi: resolution.abi, data: input })
      const entry = resolution.abi.find(
        (item): item is AbiFunction => item.type === 'function' && item.name === functionName,
      )
      const inputs = entry?.inputs ?? []
      return {
        ...named,
        confidence: 'decoded',
        functionName,
        signature: `${functionName}(${inputs.map((i) => i.type).join(',')})`,
        args: (args ?? []).map((value, index) => {
          const type = inputs[index]?.type ?? 'unknown'
          return {
            name: inputs[index]?.name || `arg${index}`,
            type,
            value: formatArgValue(type, value),
          }
        }),
      }
    } catch {
      // The ABI resolved but does not contain this selector — a proxy pointing
      // at the wrong implementation, or an ABI that is simply incomplete.
      return named
    }
  }

  const signature = await resolver.forSelector(selector)
  if (signature) {
    // A name with no argument types. Do not attempt to decode arguments from
    // it: a 4byte signature is a guess, and wrong arguments are worse than none.
    return {
      ...withSelector,
      confidence: 'signatureOnly',
      signature,
      functionName: signature.split('(')[0],
    }
  }

  return withSelector
}
