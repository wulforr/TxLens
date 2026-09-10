// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  typescript: { strict: true, typeCheck: false },
  nitro: { preset: 'cloudflare-pages' },
  css: ['~/assets/base.css'],
  devtools: { enabled: true },
})
