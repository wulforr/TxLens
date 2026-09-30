// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  typescript: { strict: true, typeCheck: false },
  nitro: {
    preset: 'cloudflare-pages',
    // Production: a Cloudflare KV namespace bound as TXLENS_CACHE. Without the
    // binding, bestEffortStore turns every read into a miss — slower, never broken.
    storage: { txlens: { driver: 'cloudflare-kv-binding', binding: 'TXLENS_CACHE' } },
    // Development: plain files under .data/txlens (gitignored), inside the repo.
    devStorage: { txlens: { driver: 'fs', base: './.data/txlens' } },
  },
  // Self-hosted: no third-party font request, and the type actually renders
  // instead of silently falling back to whatever the visitor has installed.
  css: ['@fontsource-variable/inter', '@fontsource-variable/jetbrains-mono', '~/assets/base.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'TxLens',
      meta: [
        {
          name: 'description',
          content: 'Paste an Ethereum transaction ID and get it explained in plain words.',
        },
      ],
    },
  },
  devtools: { enabled: true },
})
