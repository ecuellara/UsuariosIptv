<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui'
import {
  getLocalTimeZone,
  parseDate,
  today,
  type DateValue,
} from '@internationalized/date'
import AppIcon from './AppIcon.vue'
import FormField from './FormField.vue'
import { formatDate, formatDateTime, limaDateKey, limaDateTimeToIso, limaTimeKey, nowIso } from '@/lib/dates'

/* COMPONENTES.md §5. Nunca `<input type="datetime-local">`: el valor se guarda
   en UTC y se edita en el calendario de America/Lima. */

const model = defineModel<string | null>({ default: null })

const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string | null
    required?: boolean
    disabled?: boolean
    withTime?: boolean
    size?: 'md' | 'lg'
    placeholder?: string
    hideLabel?: boolean
  }>(),
  {
    label: undefined,
    hint: undefined,
    error: null,
    required: false,
    disabled: false,
    withTime: true,
    size: 'md',
    placeholder: 'Seleccionar fecha',
    hideLabel: false,
  },
)

const open = ref(false)
const hourText = ref('08')
const minuteText = ref('00')
const timeError = ref<string | null>(null)

/* Dentro de un modal/sheet el popover debe portalarse al propio diálogo:
   el layer modal deja `pointer-events: none` en el resto del body y oculta
   con aria-hidden a los hermanos, así que un portal a `body` no sería
   clickeable ni accesible. */
const root = ref<HTMLElement | null>(null)
const portalTarget = ref<HTMLElement | undefined>(undefined)

onMounted(() => {
  const dialog = root.value?.closest('[role="dialog"]')
  portalTarget.value = dialog instanceof HTMLElement ? dialog : undefined
})

const dateKey = computed(() => (model.value ? limaDateKey(model.value) : ''))
const selectedDate = computed<DateValue | undefined>(() =>
  dateKey.value ? parseDate(dateKey.value) : undefined,
)
const placeholderDate = computed<DateValue>(
  () => selectedDate.value ?? today(getLocalTimeZone()),
)

const displayValue = computed(() => {
  if (!model.value) return ''
  return props.withTime ? formatDateTime(model.value) : formatDate(model.value)
})

watch(
  () => model.value,
  (value) => {
    if (!value) return
    hourText.value = limaTimeKey(value).slice(0, 2)
    minuteText.value = limaTimeKey(value).slice(3, 5)
  },
  { immediate: true },
)

function commit(date: string, hour: string, minute: string): void {
  model.value = limaDateTimeToIso(date, `${hour}:${minute}`)
  timeError.value = null
}

function onSelectDate(value: DateValue | DateValue[] | null | undefined): void {
  if (!value || Array.isArray(value)) return
  const next = value.toString()
  if (!props.withTime) {
    // Sin hora: se conserva 00:00 de Lima como instante canónico.
    model.value = limaDateTimeToIso(next, '00:00')
    open.value = false
    return
  }
  commit(next, hourText.value, minuteText.value)
}

function applyTime(): void {
  const hour = Number.parseInt(hourText.value, 10)
  const minute = Number.parseInt(minuteText.value, 10)
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    timeError.value = 'Usa una hora entre 00:00 y 23:59.'
    return
  }
  const date = dateKey.value || limaDateKey(nowIso())
  commit(date, String(hour).padStart(2, '0'), String(minute).padStart(2, '0'))
}

function setTime(hour: string, minute: string): void {
  hourText.value = hour
  minuteText.value = minute
  applyTime()
}

function setNow(): void {
  const now = nowIso()
  model.value = now
}

const quickTimes: ReadonlyArray<{ label: string; hour: string; minute: string }> = [
  { label: '08:00', hour: '08', minute: '00' },
  { label: '12:00', hour: '12', minute: '00' },
  { label: '20:00', hour: '20', minute: '00' },
]
</script>

<template>
  <FormField :label="label" :hint="hint" :error="error ?? timeError" :required="required" :hide-label="hideLabel">
    <template #default="{ id, describedBy, invalid }">
      <div ref="root">
        <PopoverRoot v-model:open="open">
        <PopoverTrigger as-child :disabled="disabled">
          <button
            :id="id"
            type="button"
            class="field-control justify-between text-left"
            :data-size="size"
            :disabled="disabled"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            :aria-required="required || undefined"
          >
            <span
              class="truncate"
              :class="displayValue ? 'text-content' : 'text-content-placeholder'"
            >
              {{ displayValue || placeholder }}
            </span>
            <AppIcon name="calendar" :size="18" class="shrink-0 text-content-muted" />
          </button>
        </PopoverTrigger>

        <PopoverPortal :to="portalTarget">
          <PopoverContent
            :side-offset="4"
            align="start"
            aria-label="Elegir fecha"
            class="pointer-events-auto rounded-md border border-border bg-surface-raised p-3 shadow-md"
            style="z-index: var(--z-dropdown); width: 300px"
          >
            <CalendarRoot
              v-slot="{ weekDays, grid }"
              :model-value="selectedDate"
              :placeholder="placeholderDate"
              locale="es-PE"
              :week-starts-on="1"
              calendar-label="Elegir fecha"
              prevent-deselect
              @update:model-value="onSelectDate"
            >
              <CalendarHeader class="mb-2 flex items-center justify-between gap-2">
                <CalendarPrev
                  class="inline-flex size-9 items-center justify-center rounded-sm text-content-muted hover:bg-surface-hover hover:text-content"
                  aria-label="Mes anterior"
                >
                  <AppIcon name="chevron-left" :size="16" />
                </CalendarPrev>
                <CalendarHeading class="text-sm font-semibold capitalize text-content" />
                <CalendarNext
                  class="inline-flex size-9 items-center justify-center rounded-sm text-content-muted hover:bg-surface-hover hover:text-content"
                  aria-label="Mes siguiente"
                >
                  <AppIcon name="chevron-right" :size="16" />
                </CalendarNext>
              </CalendarHeader>

              <div class="grid grid-cols-7 gap-1">
                <CalendarHeadCell
                  v-for="day in weekDays"
                  :key="day"
                  class="pb-1 text-center text-xs font-medium text-content-muted"
                >
                  {{ day.slice(0, 2) }}
                </CalendarHeadCell>
              </div>

              <div class="flex flex-col gap-1">
                <CalendarGrid
                  v-for="month in grid"
                  :key="month.value.toString()"
                  class="w-full border-collapse select-none"
                >
                  <CalendarGridBody>
                    <CalendarGridRow
                      v-for="(week, weekIndex) in month.rows"
                      :key="weekIndex"
                      class="grid w-full grid-cols-7 gap-1"
                    >
                      <CalendarCell
                        v-for="day in week"
                        :key="day.toString()"
                        :date="day"
                        class="text-center"
                      >
                        <CalendarCellTrigger
                          :day="day"
                          :month="month.value"
                          class="inline-flex size-9 items-center justify-center rounded-sm text-sm text-content outline-none hover:bg-surface-hover data-[outside-view]:text-content-disabled data-[selected]:bg-primary data-[selected]:text-primary-fg data-[today]:border data-[today]:border-primary data-[disabled]:text-content-disabled"
                        />
                      </CalendarCell>
                    </CalendarGridRow>
                  </CalendarGridBody>
                </CalendarGrid>
              </div>
            </CalendarRoot>

            <div v-if="withTime" class="mt-3 border-t border-border pt-3">
              <div class="flex items-end gap-2">
                <label class="flex flex-col gap-1 text-xs text-content-muted">
                  Hora
                  <input
                    v-model="hourText"
                    inputmode="numeric"
                    maxlength="2"
                    class="h-9 w-12 rounded-sm border border-border-control bg-surface text-center text-base tabular text-content outline-none"
                    aria-label="Hora"
                    @change="applyTime"
                  />
                </label>
                <span class="pb-2 text-content-muted">:</span>
                <label class="flex flex-col gap-1 text-xs text-content-muted">
                  Minuto
                  <input
                    v-model="minuteText"
                    inputmode="numeric"
                    maxlength="2"
                    class="h-9 w-12 rounded-sm border border-border-control bg-surface text-center text-base tabular text-content outline-none"
                    aria-label="Minuto"
                    @change="applyTime"
                  />
                </label>
                <button
                  type="button"
                  class="btn ml-auto"
                  data-variant="secondary"
                  data-size="sm"
                  @click="setTime(limaTimeKey(nowIso()).slice(0, 2), limaTimeKey(nowIso()).slice(3, 5))"
                >
                  Ahora
                </button>
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <button
                  v-for="quick in quickTimes"
                  :key="quick.label"
                  type="button"
                  class="rounded-sm border border-border px-2 py-1 text-xs text-content-muted hover:bg-surface-hover hover:text-content"
                  @click="setTime(quick.hour, quick.minute)"
                >
                  {{ quick.label }}
                </button>
                <button
                  type="button"
                  class="ml-auto text-xs text-primary-text underline"
                  @click="setNow"
                >
                  Usar ahora
                </button>
              </div>
            </div>
          </PopoverContent>
        </PopoverPortal>
        </PopoverRoot>
      </div>
    </template>
  </FormField>
</template>
