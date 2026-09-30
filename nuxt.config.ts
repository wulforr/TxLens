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
  css: ['~/assets/base.css'],
  devtools: { enabled: true },
})
