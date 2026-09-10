<script setup lang="ts">
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey'
import { computed } from 'vue'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { toSankeyModel } from '~~/shared/sankey'
import type { WireFlowEdge } from '~~/shared/wire'

const props = defineProps<{
  flow: WireFlowEdge[]
  tokens: Record<string, TokenMeta>
  sender: string
}>()

const model = computed(() => toSankeyModel(props.flow, props.tokens, props.sender))

/**
 * Colour-blind-safe categorical ramp (Okabe-Ito). Colour is a redundant
 * encoding here: every edge also carries its asset symbol as text, so the
 * diagram is readable in greyscale.
 */
const RAMP = ['#56b4e9', '#e69f00', '#009e73', '#cc79a7', '#f0e442', '#0072b2']

const assetColour = computed(() => {
  const map = new Map<string, string>()
  model.value.assets.forEach((asset, index) => {
    map.set(asset.key, RAMP[index % RAMP.length] as string)
  })
  return map
})

const WIDTH = 720
const NODE_WIDTH = 8
const NODE_PADDING = 22
/**
 * Target thickness for one asset's ribbon. Each asset's shares sum to 1, so
 * the busiest column sums to roughly the number of assets — sizing the canvas
 * from that keeps ribbons looking like flows rather than solid slabs.
 */
const RIBBON = 26

const layout = computed(() => {
  const { nodes, links } = model.value
  if (nodes.length === 0 || links.length === 0) return null

  const assetCount = Math.max(1, model.value.assets.length)
  const height = Math.max(140, assetCount * RIBBON + (assetCount + 1) * NODE_PADDING)
  const generator = d3Sankey<{ id: string; label: string; isSender: boolean }, { share: number }>()
    .nodeId((node) => node.id)
    .nodeWidth(NODE_WIDTH)
    .nodePadding(NODE_PADDING)
    .extent([
      [1, 8],
      [WIDTH - 1, height - 8],
    ])

  try {
    return {
      height,
      graph: generator({
        nodes: nodes.map((node) => ({ ...node })),
        // A share can round to 0; d3 needs a positive value for every link.
        links: links.map((link) => ({ ...link, value: Math.max(link.share, 0.001) })),
      }),
    }
  } catch {
    // Layout can still refuse a graph we thought was fine. Fall back to the
    // list rather than rendering nothing.
    return null
  }
})

const path = sankeyLinkHorizontal()
</script>

<template>
  <section>
    <div v-if="model.links.length === 0" class="empty">No value moved in this transaction.</div>

    <template v-else>
      <!-- Diagram for desktop; the list below is the mobile and fallback view. -->
      <div v-if="layout && !model.tooComplex" class="scroller desktop">
        <svg :viewBox="`0 0 ${WIDTH} ${layout.height}`" role="img"
             :aria-label="`Value flow between ${model.nodes.length} addresses`">
          <g>
            <path
              v-for="(link, index) in layout.graph.links"
              :key="index"
              :d="path(link) ?? undefined"
              :stroke="assetColour.get((link as unknown as { assetKey: string }).assetKey)"
              :stroke-width="Math.max(1, link.width ?? 1)"
              fill="none"
              opacity="0.45"
            >
              <title>{{ (link as unknown as { amountText: string }).amountText }}</title>
            </path>
          </g>
          <g>
            <rect
              v-for="node in layout.graph.nodes"
              :key="node.id"
              :x="node.x0" :y="node.y0"
              :width="(node.x1 ?? 0) - (node.x0 ?? 0)"
              :height="Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0))"
              :fill="node.isSender ? 'var(--accent)' : 'var(--text-faint)'"
            >
              <title>{{ node.id }}</title>
            </rect>
            <text
              v-for="node in layout.graph.nodes"
              :key="`t-${node.id}`"
              :x="(node.x0 ?? 0) < WIDTH / 2 ? (node.x1 ?? 0) + 6 : (node.x0 ?? 0) - 6"
              :y="((node.y0 ?? 0) + (node.y1 ?? 0)) / 2"
              :text-anchor="(node.x0 ?? 0) < WIDTH / 2 ? 'start' : 'end'"
              dominant-baseline="middle"
            >{{ node.label }}{{ node.isSender ? ' (sender)' : '' }}</text>
          </g>
        </svg>
      </div>

      <ul v-if="layout && !model.tooComplex" class="legend desktop">
        <li v-for="asset in model.assets" :key="asset.key">
          <span class="swatch" :style="{ background: assetColour.get(asset.key) }" />
          <TokenBadge :symbol="asset.symbol" :icon-url="asset.iconUrl" />
        </li>
      </ul>

      <p v-if="model.tooComplex" class="note">
        {{ model.nodes.length }} addresses is too many to draw legibly, so the flows are listed
        instead.
      </p>

      <ul class="flows" :class="{ mobileOnly: layout && !model.tooComplex }">
        <li v-for="(link, index) in model.links" :key="index">
          <span class="swatch" :style="{ background: assetColour.get(link.assetKey) }" />
          <code>{{ link.source.slice(0, 8) }}…</code>
          <span class="arrow">→</span>
          <code>{{ link.target.slice(0, 8) }}…</code>
          <span class="amount">
            <TokenBadge :symbol="link.symbol" :icon-url="link.iconUrl" />
            {{ link.amountText.replace(` ${link.symbol}`, '') }}
          </span>
        </li>
      </ul>

      <p class="caveat">
        Widths compare movements of the same asset. They are not comparable between assets.
      </p>

      <details v-if="model.omitted.length" class="omitted">
        <summary>{{ model.omitted.length }} edge(s) omitted from the diagram to break a cycle</summary>
        <ul>
          <li v-for="(link, index) in model.omitted" :key="index">
            {{ link.source.slice(0, 8) }}… → {{ link.target.slice(0, 8) }}… {{ link.amountText }}
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<style scoped>
.scroller { overflow-x: auto; }
svg { width: 100%; min-width: 32rem; height: auto; }
text { font-size: 9.5px; fill: var(--text-dim); font-family: var(--font-mono); }
.legend { list-style: none; margin: 0.6rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 1.25rem; }
.legend li { display: flex; align-items: center; gap: 0.5ch; font-size: 0.75rem; color: var(--text-dim); }
.empty, .note { color: var(--text-dim); font-size: 0.85rem; }
.flows { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.3rem; }
.flows li {
  display: flex; flex-wrap: wrap; gap: 1ch; align-items: center;
  font-size: 0.78rem; font-family: var(--font-mono); font-variant-numeric: tabular-nums;
}
.swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.arrow, code { color: var(--text-dim); }
.amount { margin-left: auto; display: inline-flex; align-items: center; gap: 0.6ch; }
.caveat { color: var(--text-faint); font-size: 0.72rem; margin-top: 0.85rem; }
.omitted { margin-top: 0.75rem; font-size: 0.75rem; color: var(--warn); }
@media (min-width: 641px) { .mobileOnly { display: none; } }
@media (max-width: 640px) { .desktop { display: none; } }
</style>
