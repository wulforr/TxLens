<template>
  <div class="shell">
    <NuxtRouteAnnouncer />
    <header>
      <NuxtLink to="/" class="brand">TxLens</NuxtLink>
      <span class="tagline">read-only · no wallet connection, ever</span>
    </header>
    <main><NuxtPage /></main>
  </div>
</template>

<style scoped>
.shell {
  max-width: 60rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 6rem;
}
header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 3rem;
  flex-wrap: wrap;
}
.brand {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  text-decoration: none;
  color: var(--text);
}
.tagline {
  font-size: 0.75rem;
  color: var(--text-faint);
}
</style>
