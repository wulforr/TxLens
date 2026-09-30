<template>
  <div>
    <h1>What actually happened in this transaction?</h1>
    <p class="lede">
      Paste an Ethereum transaction ID and get it explained in plain words — who paid whom, how much,
      and what it was worth.
    </p>
    <HashForm autofocus />
    <p class="note">Ethereum only, for now. Read-only: TxLens never connects to a wallet.</p>
  </div>
</template>

<style scoped>
h1 {
  font-size: clamp(1.6rem, 1.2rem + 1.8vw, 2.3rem);
  font-weight: 560;
  letter-spacing: -0.02em;
  line-height: 1.2;
  max-width: 22ch;
  margin: 0 0 1rem;
  text-wrap: balance;
}
.lede {
  color: var(--text-dim);
  max-width: 54ch;
  margin: 0 0 2.25rem;
}
.note {
  color: var(--text-faint);
  font-size: 0.85rem;
  margin-top: 1.75rem;
}
</style>
