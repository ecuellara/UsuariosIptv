import { QueryCache, QueryClient } from '@tanstack/vue-query'
import { isAuthError, isPermissionError } from '@/lib/errors'

let authFailureHandler: (() => void) | null = null

/** Se registra desde `main.ts` para redirigir a /login cuando el JWT expiró. */
export function registerAuthFailureHandler(handler: () => void): void {
  authFailureHandler = handler
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isAuthError(error)) authFailureHandler?.()
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        !isAuthError(error) && !isPermissionError(error) && failureCount < 2,
    },
    mutations: {
      retry: false,
    },
  },
})
