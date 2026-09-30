<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { truncateAddress } from '~~/shared/address'
import { getChain } from '~~/shared/chains'
import { formatUnits } from '~~/shared/format'
import { labelParticipants, toSteps, usdText } from '~~/shared/steps'
import type { TxPayload } from '~~/shared/wire'

const route = useRoute()
const chainSlug = route.params.chain as string
const hash = route.params.hash as string
const chain = getChain(chainSlug)

// Client-only and lazy: the shell and skeleton paint immediately instead of the
// page freezing while a large transaction decodes. Cached ones return in ms.
const { data, error, pending } = useFetch<TxPayload>(`/api/tx/${chainSlug}/${hash}`, {
  server: false,
  lazy: true,
})

// Honest progress: these are the real stages, but we can't measure them, so the
// copy follows elapsed time and never claims a percentage.
const elapsed = ref(0)
let ticker: ReturnType<typeof setInterval> | undefined
// Browser only: setup also runs during server rendering, where a timer leaks.
onMounted(() => {
  ticker = setInterval(() => (elapsed.value += 1), 1000)
})
watch(pending, (now) => {
  if (!now) clearInterval(ticker)
})
onBeforeUnmount(() => clearInterval(ticker))
const stage = computed(() =>
  elapsed.value < 4
    ? 'Fetching the transaction from Ethereum…'
    : elapsed.value < 12
      ? 'Reading every token movement and naming the contracts involved…'
      : 'This is a big transaction. The first explanation can take up to a minute; after that it loads instantly.',
)

const people = computed(() => {
  if (!data.value) return {}
  const d = data.value
  const order = [
    d.from,
    ...toSteps(d.flow, d.tokens, d.prices, 'ETH').flatMap((s) => [s.from, ...s.via, s.to]),
    ...(d.to ? [d.to] : []),
    ...d.logs.map((l) => l.address),
    ...(d.activity.kind === 'flat'
      ? d.activity.calls.flatMap((c) => [c.from, c.to ?? d.from])
      : []),
  ]
  return labelParticipants(order, d.from, d.names, d.tokens, d.to)
})

const steps = computed(() =>
  data.value ? toSteps(data.value.flow, data.value.tokens, data.value.prices, 'ETH') : [],
)

/** Everyone who appears in a step, in the order they appear — the ones worth listing. */
const involved = computed(() => {
  const seen = new Set<string>()
  const out = []
  for (const address of [
    data.value?.from ?? '',
    ...steps.value.flatMap((s) => [s.from, ...s.via, s.to]),
    // The contract the sender called is involved even when no value moved,
    // as in a failed transaction.
    data.value?.to ?? '',
  ]) {
    const person = people.value[address]
    if (!person || person.role === 'zero' || seen.has(address)) continue
    seen.add(address)
    out.push(person)
  }
  return out
})

const when = computed(() =>
  data.value
    ? // The reader's own clock: "UTC" is one more thing to translate.
      new Date(data.value.timestamp * 1000).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : '',
)

const fee = computed(() => {
  if (!data.value) return ''
  const wei = BigInt(data.value.feeWei)
  const price = data.value.prices.native
  const usd = price === undefined ? '' : ` (${usdText((Number(wei) / 1e18) * price)})`
  return `${formatUnits(wei, 18)} ETH${usd}`
})

const failure = computed(() => {
  const status = error.value?.statusCode
  const message = error.value?.statusMessage
  if (status === 400 && message === 'unknown chain')
    return {
      title: 'That network isn’t supported',
      body: 'TxLens explains Ethereum transactions only, for now.',
    }
  if (status === 400)
    return {
      title: 'That isn’t a transaction ID',
      body: 'A transaction ID starts with 0x, followed by 64 characters using 0–9 and a–f. Check you copied the whole thing.',
    }
  if (status === 404)
    return {
      title: 'No transaction with that ID on Ethereum',
      body: 'Check you copied the whole ID, and that it’s from Ethereum rather than another network such as Base or Polygon.',
    }
  return {
    title: 'The data source didn’t answer',
    body: 'This is on our side, not yours. Try again in a moment.',
  }
})

useHead({
  title: computed(() =>
    data.value
      ? `${data.value.narrative.headline} · TxLens`
      : pending.value
        ? 'Explaining… · TxLens'
        : error.value
          ? `${failure.value.title} · TxLens`
          : 'TxLens',
  ),
})
</script>

<template>
  <div>
    <!-- Before the request starts (and in the server's HTML) there is neither
         data nor error yet; show the skeleton then too, never a blank page. -->
    <div v-if="pending || (!data && !error)" class="loading" role="status" aria-live="polite">
      <div class="skeleton headline" />
      <div class="skeleton line" />
      <div class="skeleton line short" />
      <p class="stage">{{ stage }}</p>
    </div>

    <div v-else-if="error" class="failed" role="alert">
      <h1>{{ failure.title }}</h1>
      <p>{{ failure.body }}</p>
      <HashForm label="Try again" :initial="hash" />
      <p class="examples-link">
        Or <NuxtLink to="/#examples">pick an example transaction</NuxtLink>.
      </p>
    </div>

    <article v-else-if="data">
      <Narrative
        :narrative="data.narrative"
        :tokens="data.tokens"
        :prices="data.prices"
        :names="data.names"
      />

      <p class="summary">
        <span class="status" :data-status="data.status">
          {{ data.status === 'success' ? 'Succeeded' : 'Failed' }}
        </span>
        <span>{{ when }}</span>
        <span>
          <Term
            definition="What the sender paid Ethereum’s network to process this transaction. It goes to the network, not to anyone in the steps below."
          >Network fee</Term>
          {{ fee }}
        </span>
        <span v-if="Object.keys(data.prices).length">Dollar values use prices from that day</span>
      </p>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title">Step by step</h2>
        <p
          v-if="data.coverage.logs !== 'complete' || data.coverage.calls !== 'complete'"
          class="partial"
          role="status"
        >
          Some of this transaction’s data couldn’t be read, so these steps may be incomplete.
        </p>
        <StepList v-if="steps.length" :steps="steps" :people="people" :sender="data.from" />
        <p v-else-if="data.status !== 'success'" class="empty">
          Nothing moved: the transaction failed, so every change it tried to make was undone.
        </p>
        <p v-else class="empty">
          No money or tokens moved. This transaction only changed a setting or a record inside a
          contract.
        </p>
      </section>

      <section v-if="involved.length" aria-labelledby="people-title">
        <h2 id="people-title">Who’s involved</h2>
        <PartyList :people="involved" :explorer-base="chain?.explorerBase ?? 'https://etherscan.io'" />
        <p class="txid">
          Transaction ID
          <span class="txid-value">
            <code :title="data.hash">{{ truncateAddress(data.hash, 10, 8) }}</code>
            <CopyButton :value="data.hash" label="Copy the full transaction ID" />
          <a
            class="icon"
            :href="`${chain?.explorerBase ?? 'https://etherscan.io'}/tx/${data.hash}`"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View this transaction on Etherscan (opens in a new tab)"
          >
            <Icon name="external" />
          </a>
          </span>
        </p>
      </section>

      <TechnicalDetails :data="data" :people="people" />

      <section class="another" aria-labelledby="another-title">
        <h2 id="another-title">Explain another transaction</h2>
        <HashForm />
      </section>
    </article>
  </div>
</template>

<style scoped>
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.5rem;
  margin: 1.75rem 0 0;
  padding-top: 1.25rem;
  border-top: 1px solid var(--line);
  font-size: 0.875rem;
  color: var(--text-dim);
}
.status {
  font-weight: 500;
}
.status[data-status='success'] {
  color: var(--ok);
}
.status[data-status='reverted'] {
  color: var(--bad);
}
section {
  margin-top: 3rem;
}
h2 {
  font-size: 1.05rem;
  font-weight: 560;
  color: var(--text);
  margin: 0 0 0.9rem;
}
.partial {
  color: var(--warn);
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
  max-width: 62ch;
}
.empty {
  color: var(--text-dim);
  max-width: 62ch;
  margin: 0;
}
.txid {
  display: flex;
  flex-wrap: wrap;
  white-space: nowrap;
  align-items: center;
  gap: 0.25rem;
  margin: 1rem 0 0;
  font-size: 0.85rem;
  color: var(--text-dim);
}
.txid-value {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.txid code {
  margin: 0 0.5rem 0 0.35rem;
  color: var(--text-faint);
  font-size: 0.8rem;
}
article > :deep(.technical) {
  margin-top: 3.5rem;
}
.another {
  margin-top: 3.5rem;
}

.loading {
  display: grid;
  gap: 0.9rem;
  max-width: 34rem;
}
.skeleton {
  border-radius: 6px;
  background: var(--bg-raised);
  animation: breathe 1.6s ease-in-out infinite;
}
.headline {
  height: 2.6rem;
  width: 92%;
}
.line {
  height: 0.9rem;
  width: 70%;
}
.line.short {
  width: 45%;
}
.stage {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
  color: var(--text-dim);
  max-width: 52ch;
}
@keyframes breathe {
  50% {
    opacity: 0.45;
  }
}

.examples-link {
  margin: 1rem 0 0;
  font-size: 0.9rem;
  color: var(--text-dim);
}
.failed h1 {
  font-size: 1.4rem;
  font-weight: 560;
  margin: 0 0 0.6rem;
}
.failed p {
  color: var(--text-dim);
  max-width: 58ch;
  margin: 0 0 2rem;
}
</style>
