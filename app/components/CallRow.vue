<script setup lang="ts">
import { computed } from 'vue'
import type { DecodedCall } from '~~/server/decode/calls'
import { truncateAddress } from '~~/shared/address'

const props = defineProps<{ call: DecodedCall }>()

/** Contract-supplied strings are hostile input. Cap them. See CLAUDE.md. */
const MAX_NAME = 64
const safeName = computed(() => {
  const name = props.call.contractName
  if (!name) return null
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME)}…` : name
})
</script>

<template>
  <div class="row" :data-confidence="call.confidence">
    <div class="head">
      <span v-if="safeName" class="contract">{{ safeName }}</span>
      <span v-if="call.functionName" class="fn">{{ call.functionName }}</span>
      <code v-else-if="call.selector" class="selector">{{ call.selector }}</code>
      <span v-if="call.confidence === 'signatureOnly'" class="flag">
        signature only — arguments not decoded
      </span>
      <span v-else-if="call.confidence === 'raw'" class="flag">
        function name unknown — this contract hasn’t published its code
      </span>
      <span v-else-if="call.confidence === 'nativeTransfer'" class="flag">
        plain transfer, no calldata
      </span>
    </div>

    <dl v-if="call.args.length" class="args">
      <template v-for="arg in call.args" :key="arg.name">
        <dt>{{ arg.name }} <span class="type">{{ arg.type }}</span></dt>
        <dd><ArgValue :type="arg.type" :value="arg.value" /></dd>
      </template>
    </dl>

    <p v-if="call.via" class="via">
      decoded through implementation <code>{{ truncateAddress(call.via) }}</code>
    </p>
  </div>
</template>

<style scoped>
.row {
  border: 1px solid var(--line);
  padding: 0.75rem 1rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75ch;
  align-items: baseline;
}
.contract {
  color: var(--text-dim);
  font-size: 0.8rem;
}
.fn {
  font-family: var(--font-mono);
  color: var(--accent);
}
.selector {
  font-family: var(--font-mono);
  color: var(--text-faint);
}
.flag {
  font-size: 0.75rem;
  color: var(--text-dim);
}
.args {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1.5rem;
  margin: 0.75rem 0 0;
}
dt {
  font-size: 0.8rem;
  color: var(--text-dim);
}
.type {
  color: var(--text-faint);
}
dd {
  margin: 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.via {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--text-faint);
}
</style>
