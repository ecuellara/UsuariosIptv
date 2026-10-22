import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { queryClient, registerAuthFailureHandler } from './lib/query-client'
import { useSessionStore } from './stores/session'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(VueQueryPlugin, { queryClient })
app.use(router)

// Un 401 de PostgREST (JWT expirado) cierra la sesión y App redirige a /login.
registerAuthFailureHandler(() => {
  const session = useSessionStore(pinia)
  session.handleExpired()
})

app.mount('#app')
