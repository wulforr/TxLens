import type { Abi, Hex } from 'viem'
import type { HttpClient } from '~~/server/utils/http'
import type { ChainConfig } from '~~/shared/chains'

export async function fetchBlockscoutAbi(
  http: HttpClient,
  chain: ChainConfig,
  address: string,
): Promise<{ abi: Abi; name: string | null } | null> {
  const url = `${chain.blockscoutBase}/api/v2/smart-contracts/${address.toLowerCase()}`
  const result = await http.getJson<{ abi: Abi | null; name: string | null }>(url)
  if (!result.ok || !result.data.abi) return null
  return { abi: result.data.abi, name: result.data.name ?? null }
}

/**
 * Sourcify's v2 API. The old `repo.sourcify.dev/contracts/{full,partial}_match`
 * paths this project originally planned for are retired — they 307 to a route
 * that 404s, which would have looked exactly like an unverified contract.
 * v2 collapses full/partial into one lookup and accepts either address casing;
 * verified against the live server on 2026-09-10.
 */
export async function fetchSourcifyAbi(
  http: HttpClient,
  chainId: number,
  address: string,
): Promise<Abi | null> {
  const url = `https://sourcify.dev/server/v2/contract/${chainId}/${address.toLowerCase()}?fields=abi`
  const result = await http.getJson<{ abi?: Abi | null }>(url)
  if (!result.ok || !result.data.abi) return null
  return result.data.abi
}

export async function fetchFourByteSignature(
  http: HttpClient,
  selector: Hex | string,
): Promise<string | null> {
  const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`
  const result = await http.getJson<{ results: { id: number; text_signature: string }[] }>(url)
  if (!result.ok || result.data.results.length === 0) return null
  // Many selectors have multiple registrations, some planted to mislead.
  // Lowest id means registered earliest, which is the least-bad heuristic.
  const oldest = [...result.data.results].sort((a, b) => a.id - b.id)[0]
  return oldest.text_signature
}
