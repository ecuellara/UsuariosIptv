import { onScopeDispose, ref, watch, type Ref } from 'vue'

/** Espera `delay` ms sin cambios antes de propagar el valor (búsquedas). */
export function useDebouncedRef<T>(source: Ref<T>, delay = 250): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  let timer: number | undefined

  watch(source, (value) => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      debounced.value = value
    }, delay)
  })

  onScopeDispose(() => {
    if (timer !== undefined) window.clearTimeout(timer)
  })

  return debounced
}
