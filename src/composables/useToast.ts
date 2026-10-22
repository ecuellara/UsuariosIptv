import { readonly, ref } from 'vue'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  action?: ToastAction
  durationMs: number
}

const MAX_TOASTS = 3
const DEFAULT_DURATION = 4000
const ACTION_DURATION = 5000

const items = ref<ToastItem[]>([])
const timers = new Map<number, number>()
let sequence = 0

function clearTimer(id: number): void {
  const handle = timers.get(id)
  if (handle !== undefined) {
    window.clearTimeout(handle)
    timers.delete(id)
  }
}

function schedule(id: number, durationMs: number): void {
  clearTimer(id)
  timers.set(
    id,
    window.setTimeout(() => dismiss(id), durationMs),
  )
}

function dismiss(id: number): void {
  clearTimer(id)
  items.value = items.value.filter((item) => item.id !== id)
}

function push(
  variant: ToastVariant,
  title: string,
  options: { description?: string; action?: ToastAction } = {},
): number {
  const id = ++sequence
  const durationMs = options.action ? ACTION_DURATION : DEFAULT_DURATION
  items.value = [
    ...items.value,
    { id, variant, title, ...options, durationMs },
  ].slice(-MAX_TOASTS)
  schedule(id, durationMs)
  return id
}

function pause(id: number): void {
  clearTimer(id)
}

function resume(id: number): void {
  const item = items.value.find((candidate) => candidate.id === id)
  if (item) schedule(id, item.durationMs)
}

/** Toasts globales. No es el único canal de un error de formulario:
 *  el campo también lo muestra (COMPONENTES.md §12). */
export function useToast() {
  return {
    items: readonly(items),
    push,
    success: (title: string, options?: { description?: string; action?: ToastAction }) =>
      push('success', title, options),
    error: (title: string, options?: { description?: string; action?: ToastAction }) =>
      push('error', title, options),
    info: (title: string, options?: { description?: string; action?: ToastAction }) =>
      push('info', title, options),
    dismiss,
    pause,
    resume,
  }
}
