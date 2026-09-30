/**
 * Turn a contract identifier into words: "NativeRFQPool" -> "Native RFQ Pool",
 * "TransitSwapRouterV5.1" -> "Transit Swap Router V5.1". Names that are already
 * prose ("Uniswap V4: Pool Manager", "alice.eth") pass through unchanged.
 */
export function humanize(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}
