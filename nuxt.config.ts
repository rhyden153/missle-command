// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@vercel/analytics'],
  extends: ['github:rhyden153/neogames-ui'],
  devtools: { enabled: false }
})
