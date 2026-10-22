<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCombobox from '@/components/ui/AppCombobox.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppSheet from '@/components/ui/AppSheet.vue'
import AppSwitch from '@/components/ui/AppSwitch.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import MoneyInput from '@/components/ui/MoneyInput.vue'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import { useToast } from '@/composables/useToast'
import { formatDateKey, formatDateTime, nowIso } from '@/lib/dates'
import {
  decimalString,
  formatMoney,
  formatPhone,
  formatTokens,
} from '@/lib/format'
import { toUserMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { listAccounts } from '@/services/accounts'
import { listPlans } from '@/services/plans'
import { countRenewals } from '@/services/renewals'
import { getTokenSummary } from '@/services/tokens'
import {
  addMonths,
  createIdempotencyKey,
  recordPayment,
  registerRenewal,
} from '@/services/rpc'
import {
  PAYMENT_METHODS,
  type Account,
  type PaymentMethod,
  type RenewalOperationType,
} from '@/types/domain'

/* Flujo "Registrar renovación" (PANTALLAS.md §11).
   - La fecha sugerida la calcula `add_months()` en SQL, nunca una copia en TS.
   - `idempotency_key` se genera al abrir y se reutiliza en los reintentos.
   - El cobro es una RPC posterior; si falla, la renovación NO se reenvía. */

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    account?: Account | null
    customerId?: string | null
    customerName?: string | null
  }>(),
  {
    account: null,
    customerId: null,
    customerName: null,
  },
)

const emit = defineEmits<{
  registered: [payload: { renewalId: string; newExpiration: string }]
}>()

const queryClient = useQueryClient()
const toast = useToast()

interface RenewalFormValues {
  accountId: string
  planId: string
  operationType: RenewalOperationType
  effectiveAt: string
  newExpiration: string
  amountAgreed: string
  tokensUsed: string
  notes: string
  chargeEnabled: boolean
  chargeAmount: string
  chargeMethod: PaymentMethod
  chargePaidAt: string
  chargeReference: string
}

const EMPTY_VALUES: RenewalFormValues = {
  accountId: '',
  planId: '',
  operationType: 'RENOVACION',
  effectiveAt: '',
  newExpiration: '',
  amountAgreed: '',
  tokensUsed: '',
  notes: '',
  chargeEnabled: true,
  chargeAmount: '',
  chargeMethod: 'YAPE',
  chargePaidAt: '',
  chargeReference: '',
}

const amountPattern = /^\d+(\.\d{1,2})?$/
const integerPattern = /^\d+$/

const schema = toTypedSchema(
  z
    .object({
      accountId: z.string().min(1, 'Elige un cliente y una cuenta.'),
      planId: z.string().min(1, 'Elige un plan.'),
      operationType: z.enum(['RENOVACION', 'ACTIVACION']),
      effectiveAt: z.string().min(1, 'Elige la fecha y hora de la operación.'),
      newExpiration: z.string().min(1, 'Elige el nuevo vencimiento.'),
      amountAgreed: z
        .string()
        .trim()
        .regex(amountPattern, 'Ingresa un importe con hasta 2 decimales.'),
      tokensUsed: z
        .string()
        .trim()
        .regex(integerPattern, 'Ingresa una cantidad de tokens válida.'),
      notes: z.string().max(500, 'Máximo 500 caracteres.'),
      chargeEnabled: z.boolean(),
      chargeAmount: z.string(),
      chargeMethod: z.enum(['YAPE', 'PLIN', 'TRANSFERENCIA', 'EFECTIVO', 'OTRO']),
      chargePaidAt: z.string(),
      chargeReference: z.string().max(120, 'Máximo 120 caracteres.'),
    })
    .superRefine((data, ctx) => {
      if (
        data.effectiveAt &&
        data.newExpiration &&
        new Date(data.newExpiration).getTime() <= new Date(data.effectiveAt).getTime()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newExpiration'],
          message: 'El vencimiento debe ser posterior a la operación.',
        })
      }

      const available = tokenSummary.value?.quantity
      const requested = Number(data.tokensUsed)
      if (
        available !== undefined &&
        Number.isFinite(requested) &&
        requested > available
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tokensUsed'],
          message: `Necesitas ${requested} tokens y tienes ${available}. Compra tokens para continuar.`,
        })
      }

      if (!data.chargeEnabled) return
      if (!amountPattern.test(data.chargeAmount.trim()) || Number(data.chargeAmount) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['chargeAmount'],
          message: 'Ingresa un importe mayor a 0 o desactiva el cobro.',
        })
      } else if (
        amountPattern.test(data.amountAgreed.trim()) &&
        Number(data.chargeAmount) > Number(data.amountAgreed)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['chargeAmount'],
          message: `El cobro no puede superar el importe acordado (${formatMoney(data.amountAgreed)}).`,
        })
      }
      if (!data.chargePaidAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['chargePaidAt'],
          message: 'Elige la fecha del cobro.',
        })
      }
    }),
)

const { errors, values, resetForm, validate, defineField, setFieldValue } =
  useForm<RenewalFormValues>({
    validationSchema: schema,
    initialValues: { ...EMPTY_VALUES },
  })

const [accountId] = defineField('accountId')
const [amountAgreed] = defineField('amountAgreed')
const [tokensUsed] = defineField('tokensUsed')
const [notes] = defineField('notes')
const [chargeEnabled] = defineField('chargeEnabled')
const [chargeAmount] = defineField('chargeAmount')
const [chargeReference] = defineField('chargeReference')

const operationTypeModel = computed<string | null>({
  get: () => values.operationType,
  set: (value) =>
    setFieldValue('operationType', value === 'ACTIVACION' ? 'ACTIVACION' : 'RENOVACION'),
})

const planIdModel = computed<string | null>({
  get: () => values.planId || null,
  set: (value) => setFieldValue('planId', value ?? ''),
})

const accountIdModel = computed<string | null>({
  get: () => values.accountId || null,
  set: (value) => setFieldValue('accountId', value ?? ''),
})

const chargeMethodModel = computed<string | null>({
  get: () => values.chargeMethod,
  set: (value) => {
    if (value && (PAYMENT_METHODS as readonly string[]).includes(value)) {
      setFieldValue('chargeMethod', value as PaymentMethod)
    }
  },
})

const effectiveAtModel = computed<string | null>({
  get: () => values.effectiveAt || null,
  set: (value) => setFieldValue('effectiveAt', value ?? ''),
})

const newExpirationModel = computed<string | null>({
  get: () => values.newExpiration || null,
  set: (value) => setFieldValue('newExpiration', value ?? ''),
})

const chargePaidAtModel = computed<string | null>({
  get: () => values.chargePaidAt || null,
  set: (value) => setFieldValue('chargePaidAt', value ?? ''),
})

/* --- Datos de apoyo ------------------------------------------------------- */

const plansQuery = useQuery({
  queryKey: queryKeys.plans.all,
  queryFn: listPlans,
  enabled: computed(() => open.value),
  staleTime: 60_000,
})

const activePlans = computed(
  () => plansQuery.data.value?.filter((plan) => plan.isActive) ?? [],
)

const tokenQuery = useQuery({
  queryKey: queryKeys.tokens.summary,
  queryFn: getTokenSummary,
  enabled: computed(() => open.value),
})

const tokenSummary = computed(() => tokenQuery.data.value ?? null)
const tokenUnavailable = computed(
  () => tokenQuery.isSuccess.value && tokenSummary.value === null,
)

const selectedAccount = ref<Account | null>(null)

const accountSearch = ref('')
const debouncedAccountSearch = useDebouncedRef(accountSearch, 250)

const accountOptionsQuery = useQuery({
  queryKey: computed(() => [
    'accounts',
    'renewal-options',
    props.customerId ?? '',
    debouncedAccountSearch.value,
  ]),
  queryFn: () =>
    listAccounts({
      search: debouncedAccountSearch.value,
      customerId: props.customerId ?? undefined,
      includeArchived: false,
      pageSize: 10,
    }),
  enabled: computed(() => open.value && selectedAccount.value === null),
})

const accountOptions = computed(() =>
  (accountOptionsQuery.data.value?.rows ?? []).map((account) => ({
    value: account.id,
    label: `${account.customerName} · ${account.externalUsername}`,
    secondary: `Vence ${formatDateKey(account.expiresOn)} · ${formatPhone(account.phone)}`,
  })),
)

const accountsLoading = computed(() => accountOptionsQuery.isFetching.value)

const planOptions = computed(() =>
  activePlans.value.map((plan) => ({
    value: plan.id,
    label: plan.name,
    secondary: `${formatMoney(plan.suggestedPrice)} · ${formatTokens(plan.tokensRequired)}`,
  })),
)

const selectedPlan = computed(
  () => activePlans.value.find((plan) => plan.id === values.planId) ?? null,
)

const operationOptions = [
  { value: 'RENOVACION', label: 'Renovación' },
  { value: 'ACTIVACION', label: 'Activación' },
]

const paymentOptions = PAYMENT_METHODS.map((method) => ({
  value: method,
  label:
    method === 'YAPE'
      ? 'Yape'
      : method === 'PLIN'
        ? 'Plin'
        : method === 'TRANSFERENCIA'
          ? 'Transferencia'
          : method === 'EFECTIVO'
            ? 'Efectivo'
            : 'Otro',
}))

/* --- Fecha sugerida (add_months en SQL) ----------------------------------- */

const suggestedExpiration = ref<string | null>(null)
const suggestionLoading = ref(false)
const suggestionError = ref<string | null>(null)
let suggestionSequence = 0

const expirationEdited = computed(() => {
  const current = values.newExpiration
  const suggested = suggestedExpiration.value
  if (!current || !suggested) return false
  return new Date(current).getTime() !== new Date(suggested).getTime()
})

const suggestionBase = computed<{ iso: string; label: string } | null>(() => {
  const account = selectedAccount.value
  if (!account || !values.effectiveAt) return null
  if (values.operationType === 'ACTIVACION') {
    return {
      iso: values.effectiveAt,
      label: `desde la operación (${formatDateTime(values.effectiveAt)})`,
    }
  }
  const stillValid =
    new Date(account.expiresAt).getTime() > new Date(values.effectiveAt).getTime()
  return stillValid
    ? {
        iso: account.expiresAt,
        label: `desde el vencimiento actual (${formatDateTime(account.expiresAt)})`,
      }
    : {
        iso: values.effectiveAt,
        label: `desde la operación (${formatDateTime(values.effectiveAt)})`,
      }
})

async function refreshSuggestion(): Promise<void> {
  const base = suggestionBase.value
  const plan = selectedPlan.value
  if (!base || !plan) {
    suggestedExpiration.value = null
    return
  }

  const wasEdited = expirationEdited.value
  const sequence = ++suggestionSequence
  suggestionLoading.value = true
  suggestionError.value = null
  try {
    const result = await addMonths(base.iso, plan.durationMonths)
    if (sequence !== suggestionSequence) return
    suggestedExpiration.value = result
    if (!wasEdited) setFieldValue('newExpiration', result)
  } catch (error) {
    if (sequence !== suggestionSequence) return
    suggestionError.value = toUserMessage(
      error,
      'No se pudo calcular la fecha sugerida. Escríbela manualmente.',
    )
  } finally {
    if (sequence === suggestionSequence) suggestionLoading.value = false
  }
}

watch(
  () => [
    values.planId,
    values.operationType,
    values.effectiveAt,
    selectedAccount.value?.id,
    selectedAccount.value?.expiresAt,
  ],
  () => void refreshSuggestion(),
)

function restoreSuggestion(): void {
  if (suggestedExpiration.value) {
    setFieldValue('newExpiration', suggestedExpiration.value)
  }
}

/* --- Selección de cuenta y plan ------------------------------------------ */

watch(accountId, (id) => {
  if (!id) {
    selectedAccount.value = null
    return
  }
  if (selectedAccount.value?.id === id) return
  const found = accountOptionsQuery.data.value?.rows.find((account) => account.id === id)
  if (found) selectedAccount.value = found
})

watch(selectedAccount, async (account) => {
  if (!account) return
  try {
    const count = await countRenewals(account.id)
    setFieldValue('operationType', count === 0 ? 'ACTIVACION' : 'RENOVACION')
  } catch {
    /* Si el conteo falla se mantiene RENOVACIÓN; el RPC no depende de esto. */
  }
})

watch(
  () => values.planId,
  (id) => {
    const plan = activePlans.value.find((candidate) => candidate.id === id)
    if (!plan) return
    setFieldValue('amountAgreed', decimalString(plan.suggestedPrice))
    setFieldValue('tokensUsed', String(plan.tokensRequired))
    setFieldValue('chargeAmount', decimalString(plan.suggestedPrice))
  },
)

watch(activePlans, (plans) => {
  if (plans.length === 0 || values.planId) return
  const preferred = plans.find((plan) => plan.key === '1M_3D') ?? plans[0]
  if (preferred) setFieldValue('planId', preferred.id)
})

function clearAccount(): void {
  selectedAccount.value = null
  setFieldValue('accountId', '')
  accountSearch.value = ''
}

/* --- Resumen estimado ----------------------------------------------------- */

const stock = computed(() => tokenSummary.value?.quantity ?? null)
const tokensRequested = computed(() => {
  const value = Number(values.tokensUsed)
  return Number.isFinite(value) ? value : 0
})
const tokensAfter = computed(() =>
  stock.value === null ? null : stock.value - tokensRequested.value,
)
const stockShort = computed(
  () => stock.value !== null && tokensRequested.value > stock.value,
)

const estimatedCost = computed<number | null>(() => {
  if (!tokenSummary.value) return null
  return Math.round(tokensRequested.value * tokenSummary.value.avgUnitCost * 100) / 100
})

const estimatedMargin = computed<number | null>(() => {
  if (estimatedCost.value === null) return null
  const agreed = Number(values.amountAgreed)
  if (!Number.isFinite(agreed)) return null
  return Math.round((agreed - estimatedCost.value) * 100) / 100
})

const stockLabel = computed(() => {
  if (tokenQuery.isPending.value) return 'Cargando saldo…'
  if (tokenUnavailable.value) return 'Saldo no disponible'
  return stock.value === null ? 'Saldo no disponible' : formatTokens(stock.value)
})

/* --- Idempotencia y envío ------------------------------------------------- */

const renewalKey = ref('')
const paymentKey = ref('')
const submitting = ref(false)
const retryingCharge = ref(false)
const formError = ref<string | null>(null)
const showErrors = ref(false)

function fieldError(field: keyof RenewalFormValues): string | null {
  if (!showErrors.value) return null
  return errors.value[field] ?? null
}

interface PartialState {
  renewalId: string
  newExpiration: string
  amount: string
  error: string
}

const partial = ref<PartialState | null>(null)

const confirmDisabled = computed(
  () =>
    submitting.value ||
    stockShort.value ||
    tokenQuery.isPending.value ||
    tokenUnavailable.value,
)

function invalidateAll(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  void queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all })
  void queryClient.invalidateQueries({ queryKey: queryKeys.tokens.all })
  void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all })
}

async function chargeRenewal(renewalId: string): Promise<void> {
  await recordPayment({
    renewalId,
    amount: Number(values.chargeAmount),
    method: values.chargeMethod,
    paidAt: values.chargePaidAt,
    reference: values.chargeReference.trim() ? values.chargeReference.trim() : null,
    notes: null,
    idempotencyKey: paymentKey.value,
  })
}

async function submit(): Promise<void> {
  formError.value = null
  if (submitting.value) return

  showErrors.value = true
  const result = await validate()
  if (!result.valid) {
    await nextTick()
    const invalid = document.querySelector<HTMLElement>(
      '[role="dialog"] [aria-invalid="true"]',
    )
    invalid?.focus()
    return
  }

  submitting.value = true
  try {
    const renewal = await registerRenewal({
      accountId: values.accountId,
      planId: values.planId,
      operationType: values.operationType,
      effectiveAt: values.effectiveAt,
      newExpiration: values.newExpiration,
      expirationEdited: expirationEdited.value,
      amountAgreed: Number(values.amountAgreed),
      tokensUsed: tokensRequested.value,
      notes: values.notes.trim() ? values.notes.trim() : null,
      idempotencyKey: renewalKey.value,
    })

    invalidateAll()

    if (values.chargeEnabled) {
      try {
        await chargeRenewal(renewal.id)
      } catch (error) {
        partial.value = {
          renewalId: renewal.id,
          newExpiration: renewal.new_expiration,
          amount: values.chargeAmount,
          error: toUserMessage(error, 'El cobro no se guardó.'),
        }
        return
      }
    }

    toast.success('Renovación registrada', {
      description: `Nuevo vencimiento ${formatDateTime(renewal.new_expiration)}.`,
    })
    open.value = false
    emit('registered', {
      renewalId: renewal.id,
      newExpiration: renewal.new_expiration,
    })
  } catch (error) {
    formError.value = toUserMessage(error, 'No se pudo registrar la renovación.')
  } finally {
    submitting.value = false
  }
}

async function retryCharge(): Promise<void> {
  if (!partial.value || retryingCharge.value) return
  retryingCharge.value = true
  partial.value = { ...partial.value, error: '' }
  try {
    await chargeRenewal(partial.value.renewalId)
    toast.success('Cobro registrado', {
      description: `${formatMoney(partial.value.amount)} en la renovación del ${formatDateTime(
        partial.value.newExpiration,
      )}.`,
    })
    invalidateAll()
    open.value = false
  } catch (error) {
    partial.value = {
      ...partial.value,
      error: toUserMessage(error, 'El cobro no se guardó.'),
    }
  } finally {
    retryingCharge.value = false
  }
}

/* --- Apertura y limpieza -------------------------------------------------- */

watch(open, async (isOpen) => {
  if (!isOpen) return

  renewalKey.value = createIdempotencyKey()
  paymentKey.value = createIdempotencyKey()
  partial.value = null
  formError.value = null
  showErrors.value = false
  suggestionError.value = null
  suggestedExpiration.value = null
  accountSearch.value = ''
  selectedAccount.value = props.account ?? null

  const now = nowIso()
  resetForm({
    values: {
      ...EMPTY_VALUES,
      accountId: props.account?.id ?? '',
      effectiveAt: now,
      chargePaidAt: now,
    },
  })

  const available = activePlans.value
  const preferred =
    available.find((plan) => plan.key === '1M_3D') ?? available[0] ?? null
  if (preferred) {
    setFieldValue('planId', preferred.id)
    setFieldValue('amountAgreed', decimalString(preferred.suggestedPrice))
    setFieldValue('tokensUsed', String(preferred.tokensRequired))
    setFieldValue('chargeAmount', decimalString(preferred.suggestedPrice))
  }

  await nextTick()
  const first = document.querySelector<HTMLElement>(
    selectedAccount.value
      ? '[role="dialog"] [data-first-field], [role="dialog"] button[aria-haspopup="listbox"]'
      : '[role="dialog"] input[role="combobox"], [role="dialog"] input',
  )
  first?.focus()
})
</script>

<template>
  <AppSheet
    v-model:open="open"
    title="Registrar renovación"
    :description="
      selectedAccount
        ? `${selectedAccount.customerName} · ${formatPhone(selectedAccount.phone)}`
        : 'Busca la cuenta por cliente, usuario IPTV o teléfono.'
    "
    :prevent-close="submitting || retryingCharge"
  >
    <template v-if="partial">
      <AppAlert variant="warning" title="Renovación registrada. El cobro no se guardó.">
        <p v-if="partial.error && partial.error !== 'El cobro no se guardó.'">
          {{ partial.error }}
        </p>
        <p class="mt-1">
          La renovación ya está guardada. Reintenta solo el cobro con la misma clave: no se
          volverá a registrar la renovación.
        </p>
      </AppAlert>

      <section class="panel p-4">
        <h2 class="section-label mb-2">Renovación</h2>
        <dl class="grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] gap-y-2 text-base">
          <dt class="text-sm text-content-muted">Nuevo vencimiento</dt>
          <dd class="tabular text-content">{{ formatDateTime(partial.newExpiration) }}</dd>
          <dt class="text-sm text-content-muted">Cobro pendiente</dt>
          <dd class="tabular text-content">{{ formatMoney(partial.amount) }}</dd>
        </dl>
        <p class="mt-3 text-xs text-content-muted">
          La renovación ya está guardada. No se volverá a enviar. El reintento usa la misma
          clave de idempotencia del cobro.
        </p>
      </section>
    </template>

    <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <section aria-labelledby="renovacion-cuenta" class="flex flex-col gap-3">
        <h2 id="renovacion-cuenta" class="section-label">Cuenta</h2>

        <div
          v-if="selectedAccount"
          class="rounded-md border border-border bg-surface-sunken px-3 py-2"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-base font-medium text-content">
                {{ selectedAccount.customerName }}
              </p>
              <p class="truncate font-mono text-sm text-content-muted">
                {{ selectedAccount.externalUsername }}
              </p>
              <p class="text-xs text-content-muted">
                Vence {{ formatDateTime(selectedAccount.expiresAt) }} ·
                {{ formatPhone(selectedAccount.phone) }}
              </p>
            </div>
            <button
              type="button"
              class="min-h-11 shrink-0 text-sm text-primary-text underline"
              @click="clearAccount"
            >
              Cambiar
            </button>
          </div>
        </div>

        <AppCombobox
          v-else
          v-model="accountIdModel"
          :options="accountOptions"
          label="Cliente y cuenta IPTV"
          placeholder="Cliente, usuario IPTV o teléfono…"
          :required="true"
          :loading="accountsLoading"
          :error="fieldError('accountId')"
          :disabled="submitting"
          empty-text="Sin cuentas activas que coincidan."
          @search="accountSearch = $event"
        />

        <p v-if="customerName && !selectedAccount" class="text-xs text-content-muted">
          Mostrando cuentas de {{ customerName }}.
        </p>

        <div class="grid gap-3 sm:grid-cols-2">
          <AppSelect
            v-model="planIdModel"
            :options="planOptions"
            label="Plan"
            placeholder="Elige un plan"
            :required="true"
            :error="fieldError('planId')"
            :disabled="submitting || plansQuery.isPending.value"
          />
          <AppSelect
            v-model="operationTypeModel"
            :options="operationOptions"
            label="Tipo de operación"
            :required="true"
            :disabled="submitting"
          />
        </div>

        <p v-if="plansQuery.isError.value" class="text-sm text-danger-text" role="alert">
          No se pudieron cargar los planes.
          <button type="button" class="underline" @click="plansQuery.refetch()">Reintentar</button>
        </p>
        <p v-else-if="plansQuery.isSuccess.value && activePlans.length === 0" class="text-sm text-content-muted">
          No hay planes activos. Actívalos en Configuración para poder renovar.
        </p>
      </section>

      <section aria-labelledby="renovacion-fechas" class="flex flex-col gap-3">
        <h2 id="renovacion-fechas" class="section-label">Operación</h2>

        <AppDatePicker
          v-model="effectiveAtModel"
          label="Fecha y hora de la operación"
          hint="Se guarda en UTC y se muestra en hora de Lima."
          :required="true"
          :error="fieldError('effectiveAt')"
          :disabled="submitting"
        />

        <div>
          <AppDatePicker
            v-model="newExpirationModel"
            label="Nuevo vencimiento"
            :required="true"
            :error="fieldError('newExpiration')"
            :disabled="submitting || !selectedPlan || !selectedAccount"
          />
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span v-if="suggestionLoading" class="text-content-muted">Calculando sugerido…</span>
            <span v-else-if="suggestedExpiration" class="text-content-muted">
              Sugerido: <span class="tabular">{{ formatDateTime(suggestedExpiration) }}</span>
              <template v-if="suggestionBase"> · {{ suggestionBase.label }}</template>
            </span>
            <span v-else-if="selectedAccount && selectedPlan" class="text-content-muted">
              Sin sugerencia disponible.
            </span>
            <span
              v-if="expirationEdited"
              class="badge border border-warning-border bg-warning-soft text-warning-text"
            >
              Editado
            </span>
            <button
              v-if="expirationEdited && suggestedExpiration"
              type="button"
              class="min-h-11 text-primary-text underline"
              @click="restoreSuggestion"
            >
              Volver al sugerido
            </button>
          </div>
          <p v-if="suggestionError" class="mt-1 text-xs text-warning-text" role="status">
            {{ suggestionError }}
          </p>
        </div>
      </section>

      <section aria-labelledby="renovacion-importes" class="flex flex-col gap-3">
        <h2 id="renovacion-importes" class="section-label">Importes y tokens</h2>

        <div class="grid gap-3 sm:grid-cols-2">
          <MoneyInput
            v-model="amountAgreed"
            label="Precio acordado"
            :required="true"
            :min="0"
            :error="fieldError('amountAgreed')"
            :disabled="submitting"
          />
          <AppInput
            v-model="tokensUsed"
            label="Tokens a consumir"
            inputmode="numeric"
            :required="true"
            :error="fieldError('tokensUsed')"
            :disabled="submitting"
            hint="0 si los tokens se gestionaron fuera del panel."
          />
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="text-content-muted">Saldo actual:</span>
          <span class="tabular text-content">{{ stockLabel }}</span>
          <span v-if="tokensAfter !== null" class="text-content-muted">
            → después: <span class="tabular">{{ formatTokens(tokensAfter) }}</span>
          </span>
          <span
            v-if="selectedPlan && tokensRequested !== selectedPlan.tokensRequired"
            class="badge border border-border bg-surface-sunken text-content-muted"
          >
            Ajustado
          </span>
        </div>

        <AppAlert v-if="stockShort" variant="warning" title="No hay tokens suficientes">
          Necesitas {{ tokensRequested }} tokens y tienes {{ stock }}. Compra tokens para
          continuar.
        </AppAlert>
        <AppAlert v-else-if="tokenUnavailable" variant="warning" title="Saldo de tokens no disponible">
          La vista de tokens no devolvió datos. Sin ese dato no se permite confirmar para no
          inventar un saldo.
        </AppAlert>
        <p v-else-if="tokenQuery.isError.value" class="text-sm text-danger-text" role="alert">
          No se pudo cargar el saldo de tokens.
          <button type="button" class="underline" @click="tokenQuery.refetch()">Reintentar</button>
        </p>

        <AppTextarea
          v-model="notes"
          label="Notas"
          hint="Opcional. Acuerdos o detalles de la operación."
          :maxlength="500"
          :rows="2"
          :disabled="submitting"
          :error="fieldError('notes')"
        />
      </section>

      <section aria-labelledby="renovacion-cobro" class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <h2 id="renovacion-cobro" class="section-label">Cobro</h2>
          <AppSwitch
            v-model="chargeEnabled"
            label="Registrar cobro ahora"
            :disabled="submitting"
          />
        </div>

        <template v-if="chargeEnabled">
          <div class="grid gap-3 sm:grid-cols-2">
            <MoneyInput
              v-model="chargeAmount"
              label="Importe cobrado"
              :required="true"
              :min="0.01"
              :error="fieldError('chargeAmount')"
              :disabled="submitting"
            />
            <AppSelect
              v-model="chargeMethodModel"
              :options="paymentOptions"
              label="Método"
              :required="true"
              :disabled="submitting"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <AppDatePicker
              v-model="chargePaidAtModel"
              label="Fecha del cobro"
              :required="true"
              :error="fieldError('chargePaidAt')"
              :disabled="submitting"
            />
            <AppInput
              v-model="chargeReference"
              label="Referencia"
              hint="Número de operación, opcional."
              :maxlength="120"
              :disabled="submitting"
            />
          </div>
          <p class="text-xs text-content-muted">
            Un solo cobro en este formulario. El total no puede superar el precio acordado.
          </p>
        </template>
        <p v-else class="text-xs text-content-muted">
          La renovación se registrará sin cobro. El importe quedará pendiente en el historial
          de la cuenta.
        </p>
      </section>

      <AppAlert v-if="formError" variant="danger" title="No se pudo registrar la renovación">
        {{ formError }}
        <template #actions>
          <AppButton size="sm" variant="secondary" :disabled="submitting" @click="submit">
            Reintentar
          </AppButton>
        </template>
      </AppAlert>
    </form>

    <template #footer>
      <template v-if="partial">
        <AppButton
          variant="secondary"
          :disabled="retryingCharge"
          @click="open = false"
        >
          Cerrar
        </AppButton>
        <AppButton
          variant="primary"
          :loading="retryingCharge"
          @click="retryCharge"
        >
          Reintentar cobro
        </AppButton>
      </template>
      <template v-else>
        <div class="flex w-full flex-col gap-2">
          <div
            class="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm"
            aria-live="polite"
          >
            <div class="flex flex-wrap gap-x-3 gap-y-1">
              <span>
                Acordado
                <strong class="tabular">{{ formatMoney(values.amountAgreed) }}</strong>
              </span>
              <span class="text-content-muted" aria-hidden="true">·</span>
              <span>
                Costo de tokens
                <strong class="tabular">
                  {{ estimatedCost === null ? 'no disponible' : `${formatMoney(estimatedCost)} estimado` }}
                </strong>
              </span>
              <span class="text-content-muted" aria-hidden="true">·</span>
              <span>
                Margen estimado
                <strong
                  class="tabular"
                  :class="estimatedMargin !== null && estimatedMargin <= 0 ? 'text-danger-text' : 'text-content'"
                >
                  {{ estimatedMargin === null ? 'no disponible' : formatMoney(estimatedMargin) }}
                </strong>
              </span>
            </div>
            <p class="mt-1 text-xs text-content-muted">
              Nuevo vencimiento:
              <span class="tabular">{{ values.newExpiration ? formatDateTime(values.newExpiration) : '—' }}</span>
              · Tokens después:
              <span class="tabular">{{ tokensAfter === null ? '—' : formatTokens(tokensAfter) }}</span>
            </p>
            <p class="text-xs text-content-muted">
              El costo definitivo lo congela el servidor al confirmar.
              <template v-if="estimatedMargin !== null && estimatedMargin <= 0">
                Margen negativo: revisa el precio o los tokens.
              </template>
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <AppButton variant="secondary" :disabled="submitting" @click="open = false">
              Cancelar
            </AppButton>
            <AppButton
              variant="primary"
              :loading="submitting"
              :disabled="confirmDisabled || !selectedAccount || !selectedPlan"
              @click="submit"
            >
              {{ submitting ? 'Registrando…' : 'Confirmar renovación' }}
            </AppButton>
          </div>
        </div>
      </template>
    </template>
  </AppSheet>
</template>
