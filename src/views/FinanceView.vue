<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import ExpenseFormModal from '@/components/finance/ExpenseFormModal.vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppSkeleton from '@/components/ui/AppSkeleton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable, { type TableColumn } from '@/components/ui/DataTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { downloadCsv, csvFilename, toCsv } from '@/lib/csv'
import { formatDate, formatDateTime, limaTimeKey } from '@/lib/dates'
import { toUserMessage } from '@/lib/errors'
import {
  cashOperatingOutflow,
  currentMonthKeyInLima,
  expenseCategoryLabel,
  lastMonthsInLima,
  monthRangeInLima,
} from '@/lib/finance'
import { formatInteger, formatMoney } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import {
  deleteExpense,
  getCashMonthly,
  getProfitMonthly,
  listExpenses,
} from '@/services/finance'
import type { Expense } from '@/types/domain'

/* Finanzas: dos bloques que no se mezclan.
   A. Caja (v_cash_monthly): el dinero que entró y salió, compras de tokens
      incluidas en el egreso y mostradas aparte solo como información.
   B. Rentabilidad (v_profit_monthly): ingreso devengado menos tokens
      consumidos y gastos operativos (nunca compras de tokens).
   No se suman filas en el navegador: cada cifra ya viene de SQL. */

const queryClient = useQueryClient()
const toast = useToast()

const monthKey = ref(currentMonthKeyInLima())
const monthOptions = lastMonthsInLima()
const month = computed(() => monthRangeInLima(monthKey.value))
const monthModel = computed<string | null>({
  get: () => monthKey.value,
  set: (value) => {
    if (value && monthOptions.some((option) => option.value === value)) {
      monthKey.value = value
    }
  },
})

const cashQuery = useQuery({
  queryKey: computed(() => queryKeys.finance.cash(monthKey.value)),
  queryFn: () => getCashMonthly(monthKey.value),
  staleTime: 30_000,
})

const profitQuery = useQuery({
  queryKey: computed(() => queryKeys.finance.profit(monthKey.value)),
  queryFn: () => getProfitMonthly(monthKey.value),
  staleTime: 30_000,
})

const expensesQuery = useQuery({
  queryKey: computed(() => queryKeys.finance.expenses(monthKey.value)),
  queryFn: () => listExpenses(monthKey.value),
})

const cash = computed(() => cashQuery.data.value ?? null)
const cashLoading = computed(() => cashQuery.isPending.value)
const cashError = computed(() => cashQuery.isError.value)
const cashMissing = computed(
  () => !cashLoading.value && !cashError.value && cash.value === null,
)

const profit = computed(() => profitQuery.data.value ?? null)
const profitLoading = computed(() => profitQuery.isPending.value)
const profitError = computed(() => profitQuery.isError.value)
const profitMissing = computed(
  () => !profitLoading.value && !profitError.value && profit.value === null,
)

/* Ceros honestos: una vista sin fila significa que no hubo movimientos en el
   mes, no que el total sea desconocido. `net` y `grossMargin` se leen tal cual
   llegan; solo los gastos operativos de caja son una resta de dos columnas. */
const cashValues = computed(() => {
  const row = cash.value
  return {
    income: row?.income ?? 0,
    outflow: row?.outflow ?? 0,
    net: row?.net ?? 0,
    paymentsCount: row?.paymentsCount ?? 0,
    tokenPurchases: row?.tokenPurchases ?? 0,
    operating: cashOperatingOutflow(row?.outflow ?? 0, row?.tokenPurchases ?? 0),
  }
})

const profitValues = computed(() => ({
  agreedRevenue: profit.value?.agreedRevenue ?? 0,
  tokenCost: profit.value?.tokenCost ?? 0,
  operatingExpenses: profit.value?.operatingExpenses ?? 0,
  grossMargin: profit.value?.grossMargin ?? 0,
}))

/* --- Gastos --------------------------------------------------------------- */

const expenses = computed(() => expensesQuery.data.value ?? [])
const expensesLoading = computed(() => expensesQuery.isPending.value)
const expensesError = computed(() => expensesQuery.error.value)

const columns: TableColumn[] = [
  { key: 'spent', label: 'Fecha', width: '150px', card: 'start' },
  { key: 'category', label: 'Categoría', width: '130px', card: 'meta' },
  { key: 'description', label: 'Descripción', card: 'primary' },
  { key: 'reference', label: 'Referencia', width: '150px', hideBelow: 'lg' },
  { key: 'amount', label: 'Importe', width: '120px', align: 'right', numeric: true, card: 'end' },
  { key: 'actions', label: 'Acciones', width: '100px', align: 'right', card: 'actions' },
]

const formOpen = ref(false)
const editing = ref<Expense | null>(null)
const deleteOpen = ref(false)
const deleteTarget = ref<Expense | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

/* Si el mes elegido es el actual, el gasto nuevo se fecha ahora; si es un mes
   pasado, se propone el primer día de ese mes a mediodía de Lima. */
const defaultSpentAt = computed(() => {
  if (monthKey.value === currentMonthKeyInLima()) return new Date().toISOString()
  const start = new Date(month.value.startIso)
  return new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString()
})

function createExpense(): void {
  editing.value = null
  formOpen.value = true
}

function editExpense(expense: Expense): void {
  editing.value = expense
  formOpen.value = true
}

function requestDelete(expense: Expense): void {
  deleteTarget.value = expense
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  deleteError.value = null
  try {
    await deleteExpense(target.id)
    toast.success('Gasto eliminado', {
      description: 'La eliminación queda registrada en la auditoría.',
    })
    deleteOpen.value = false
    await queryClient.invalidateQueries({ queryKey: queryKeys.finance.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  } catch (error) {
    deleteError.value = toUserMessage(error, 'No se pudo eliminar el gasto.')
  } finally {
    deleting.value = false
  }
}

const deleteBody = computed(() => {
  const target = deleteTarget.value
  if (!target) return ''
  return `Se eliminará «${target.description}» por ${formatMoney(target.amount)}. La eliminación queda registrada en la auditoría y no se puede deshacer desde el panel.`
})

/* --- Exportación ----------------------------------------------------------
   CSV generado desde las filas ya traídas. No se recalculan totales: se
   escriben los mismos valores que muestra la pantalla. */

function exportExpenses(): void {
  const rows: string[][] = [
    ['Fecha', 'Categoría', 'Descripción', 'Referencia', 'Importe'],
    ...expenses.value.map((expense) => [
      formatDateTime(expense.spentAt),
      expenseCategoryLabel(expense.category),
      expense.description,
      expense.reference ?? '',
      formatMoney(expense.amount),
    ]),
  ]
  downloadCsv(csvFilename('finanzas-gastos', monthKey.value), toCsv(rows))
}

function exportSummary(): void {
  const cashRow = cashValues.value
  const profitRow = profitValues.value
  const rows: string[][] = [
    ['Bloque', 'Concepto', 'Valor'],
    ['Caja', 'Mes', month.value.label],
    ['Caja', 'Cobrado', formatMoney(cashRow.income)],
    ['Caja', 'Gastos operativos (sin compra de tokens)', formatMoney(cashRow.operating)],
    ['Caja', 'Compras de tokens (informativo)', formatMoney(cashRow.tokenPurchases)],
    ['Caja', 'Saldo neto', formatMoney(cashRow.net)],
    [],
    ['Rentabilidad', 'Mes', month.value.label],
    ['Rentabilidad', 'Ingreso devengado', formatMoney(profitRow.agreedRevenue)],
    ['Rentabilidad', 'Costo de tokens consumidos', formatMoney(profitRow.tokenCost)],
    ['Rentabilidad', 'Gastos operativos', formatMoney(profitRow.operatingExpenses)],
    ['Rentabilidad', 'Margen estimado', formatMoney(profitRow.grossMargin)],
  ]
  downloadCsv(csvFilename('finanzas-resumen', monthKey.value), toCsv(rows))
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-3xl font-semibold text-content">Finanzas</h1>
        <p class="mt-1 text-base text-content-muted">
          Caja y rentabilidad del mes, calculadas en SQL. Son dos lecturas distintas:
          cobrar mueve caja; consumir tokens y gastar define el margen.
        </p>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <AppSelect
          v-model="monthModel"
          :options="monthOptions"
          label="Mes"
          class="w-48"
        />
        <AppButton
          variant="secondary"
          :disabled="cashLoading && profitLoading"
          @click="exportSummary"
        >
          <template #icon><AppIcon name="receipt" :size="16" /></template>
          Exportar resumen
        </AppButton>
      </div>
    </header>

    <div class="grid items-start gap-6 xl:grid-cols-2">
      <!-- A. Caja del mes ------------------------------------------------- -->
      <section class="panel p-4" aria-labelledby="finanzas-caja" :aria-busy="cashLoading || undefined">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="finanzas-caja" class="text-xl font-semibold text-content">Caja del mes</h2>
          <span class="text-xs text-content-muted">{{ month.label }}</span>
        </div>
        <p class="mt-1 text-sm text-content-muted">
          Dinero que entró y salió en el mes. El saldo neto lo calcula
          <code class="font-mono text-xs">v_cash_monthly</code>.
        </p>

        <AppAlert
          v-if="cashError"
          class="mt-3"
          variant="danger"
          title="No se pudo cargar la caja del mes"
        >
          <template #actions>
            <AppButton size="sm" variant="secondary" @click="cashQuery.refetch()">
              Reintentar
            </AppButton>
          </template>
        </AppAlert>

        <dl class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-md border border-border bg-surface-raised p-3">
            <dt class="section-label">Cobrado</dt>
            <dd class="mt-1 text-2xl font-semibold tabular text-content">
              <AppSkeleton v-if="cashLoading" width="96px" height="24px" />
              <template v-else>{{ formatMoney(cashValues.income) }}</template>
            </dd>
            <p class="mt-1 text-xs text-content-muted">
              {{ formatInteger(cashValues.paymentsCount) }}
              {{ cashValues.paymentsCount === 1 ? 'cobro' : 'cobros' }} en el mes
            </p>
          </div>

          <div class="rounded-md border border-border bg-surface-raised p-3">
            <dt class="section-label">Gastos operativos</dt>
            <dd class="mt-1 text-2xl font-semibold tabular text-content">
              <AppSkeleton v-if="cashLoading" width="96px" height="24px" />
              <template v-else>{{ formatMoney(cashValues.operating) }}</template>
            </dd>
            <p class="mt-1 text-xs text-content-muted">
              Egresos sin compras de tokens
            </p>
          </div>

          <div class="rounded-md border border-border bg-surface-raised p-3">
            <dt class="section-label">Compras de tokens</dt>
            <dd class="mt-1 text-2xl font-semibold tabular text-content">
              <AppSkeleton v-if="cashLoading" width="96px" height="24px" />
              <template v-else>{{ formatMoney(cashValues.tokenPurchases) }}</template>
            </dd>
            <p class="mt-1 text-xs text-content-muted">
              Informativo: ya está dentro de los egresos
            </p>
          </div>

          <div class="rounded-md border border-border bg-surface-raised p-3">
            <dt class="section-label">Saldo neto</dt>
            <dd
              class="mt-1 text-2xl font-semibold tabular"
              :class="cashValues.net < 0 ? 'text-danger-text' : 'text-content'"
            >
              <AppSkeleton v-if="cashLoading" width="96px" height="24px" />
              <template v-else>{{ formatMoney(cashValues.net) }}</template>
            </dd>
            <p class="mt-1 text-xs text-content-muted">
              {{ cashValues.net < 0 ? 'El mes cierra en negativo' : 'Cobrado − egresos' }}
            </p>
          </div>
        </dl>

        <p v-if="cashMissing" class="mt-3 text-sm text-content-muted" role="status">
          Sin movimientos en el mes: los importes se muestran en cero.
        </p>

        <p class="mt-3 text-xs leading-4 text-content-muted">
          Saldo neto = cobrado − egresos totales. Comprar tokens mueve caja; el costo
          aparece cuando se consume.
        </p>
      </section>

      <!-- B. Rentabilidad del mes ----------------------------------------- -->
      <section class="panel p-4" aria-labelledby="finanzas-rentabilidad" :aria-busy="profitLoading || undefined">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="finanzas-rentabilidad" class="text-xl font-semibold text-content">
            Rentabilidad del mes
          </h2>
          <span class="text-xs text-content-muted">{{ month.label }}</span>
        </div>
        <p class="mt-1 text-sm text-content-muted">
          Resultado devengado del mes. No es la caja: aquí los tokens cuentan cuando se
          consumen.
        </p>

        <AppAlert
          v-if="profitError"
          class="mt-3"
          variant="danger"
          title="No se pudo cargar la rentabilidad del mes"
        >
          <template #actions>
            <AppButton size="sm" variant="secondary" @click="profitQuery.refetch()">
              Reintentar
            </AppButton>
          </template>
        </AppAlert>

        <dl class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-md border border-border bg-surface-raised p-3">
            <dt class="section-label">Ingreso devengado</dt>
            <dd class="mt-1 text-2xl font-semibold tabular text-content">
              <AppSkeleton v-if="profitLoading" width="96px" height="24px" />
              <template v-else>{{ formatMoney(profitValues.agreedRevenue) }}</template>
            </dd>
            <p class="mt-1 text-xs text-content-muted">
              Renovaciones confirmadas del mes
            </p>
          </div>

          <div class="rounded-md border border-border bg-surface-raised p-3">
            <dt class="section-label">Costo de tokens consumidos</dt>
            <dd class="mt-1 text-2xl font-semibold tabular text-content">
              <AppSkeleton v-if="profitLoading" width="96px" height="24px" />
              <template v-else>{{ formatMoney(profitValues.tokenCost) }}</template>
            </dd>
            <p class="mt-1 text-xs text-content-muted">
              Costo congelado al renovar
            </p>
          </div>

          <div class="rounded-md border border-border bg-surface-raised p-3">
            <dt class="section-label">Gastos operativos</dt>
            <dd class="mt-1 text-2xl font-semibold tabular text-content">
              <AppSkeleton v-if="profitLoading" width="96px" height="24px" />
              <template v-else>{{ formatMoney(profitValues.operatingExpenses) }}</template>
            </dd>
            <p class="mt-1 text-xs text-content-muted">
              Gastos del mes; nunca compras de tokens
            </p>
          </div>

          <div class="rounded-md border border-border bg-surface-raised p-3">
            <dt class="section-label">Margen estimado</dt>
            <dd
              class="mt-1 text-2xl font-semibold tabular"
              :class="profitValues.grossMargin < 0 ? 'text-danger-text' : 'text-content'"
            >
              <AppSkeleton v-if="profitLoading" width="96px" height="24px" />
              <template v-else>{{ formatMoney(profitValues.grossMargin) }}</template>
            </dd>
            <p class="mt-1 text-xs text-content-muted">
              {{ profitValues.grossMargin < 0 ? 'Margen negativo' : 'Ingreso − costos − gastos' }}
            </p>
          </div>
        </dl>

        <p v-if="profitMissing" class="mt-3 text-sm text-content-muted" role="status">
          Sin operaciones en el mes: los importes se muestran en cero.
        </p>

        <p class="mt-3 text-xs leading-4 text-content-muted">
          Margen estimado = ingreso devengado − costo de tokens consumidos − gastos
          operativos. Las compras de tokens no aparecen aquí.
        </p>
      </section>
    </div>

    <!-- Gastos del mes ------------------------------------------------------ -->
    <section class="flex min-w-0 flex-col gap-3" aria-labelledby="finanzas-gastos">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="finanzas-gastos" class="text-2xl font-semibold text-content">
            Gastos del mes
          </h2>
          <p class="text-sm text-content-muted">
            <span class="tabular">{{ expenses.length }}</span>
            {{ expenses.length === 1 ? 'gasto' : 'gastos' }} en
            {{ month.label }}. Cada alta, edición y
            eliminación queda auditada.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <AppButton
            variant="secondary"
            size="sm"
            :disabled="expensesLoading || expenses.length === 0"
            @click="exportExpenses"
          >
            <template #icon><AppIcon name="receipt" :size="16" /></template>
            Exportar CSV
          </AppButton>
          <AppButton variant="primary" @click="createExpense">
            <template #icon><AppIcon name="plus" :size="18" /></template>
            Registrar gasto
          </AppButton>
        </div>
      </div>

      <DataTable
        :columns="columns"
        :rows="expenses"
        :row-key="(row) => row.id"
        :loading="expensesLoading"
        :error="expensesError"
        error-message="No se pudieron cargar los gastos del mes."
        caption="Gastos operativos del mes"
        @retry="expensesQuery.refetch()"
      >
        <template #cell-spent="{ row }">
          <span class="block tabular">{{ formatDate(row.spentAt) }}</span>
          <span class="block text-xs text-content-muted">
            {{ limaTimeKey(row.spentAt) }} · Lima
          </span>
        </template>

        <template #cell-category="{ row }">
          <span class="text-sm">{{ expenseCategoryLabel(row.category) }}</span>
        </template>

        <template #cell-description="{ row }">
          <span class="block font-medium text-content">{{ row.description }}</span>
        </template>

        <template #cell-reference="{ row }">
          <span class="block max-w-[24ch] truncate text-sm" :title="row.reference ?? undefined">
            {{ row.reference ?? '—' }}
          </span>
        </template>

        <template #cell-amount="{ row }">
          <span class="tabular">{{ formatMoney(row.amount) }}</span>
        </template>

        <template #cell-actions="{ row }">
          <div class="dt-actions">
            <button
              type="button"
              class="btn"
              data-variant="ghost"
              data-size="sm"
              data-icon-only="true"
              :aria-label="`Editar ${row.description}`"
              @click="editExpense(row)"
            >
              <AppIcon name="pencil" :size="16" />
            </button>
            <button
              type="button"
              class="btn"
              data-variant="ghost"
              data-size="sm"
              data-icon-only="true"
              :aria-label="`Eliminar ${row.description}`"
              @click="requestDelete(row)"
            >
              <AppIcon name="trash" :size="16" />
            </button>
          </div>
        </template>

        <template #empty>
          <EmptyState
            icon="receipt"
            title="Sin gastos registrados en el mes"
            description="Registra hosting, publicidad o herramientas. Las compras de tokens van por Tokens y no se duplican aquí."
          >
            <AppButton variant="primary" @click="createExpense">Registrar gasto</AppButton>
          </EmptyState>
        </template>
      </DataTable>
    </section>

    <ExpenseFormModal
      v-model:open="formOpen"
      :expense="editing"
      :default-spent-at="defaultSpentAt"
    />

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Eliminar gasto"
      :body="deleteBody"
      confirm-label="Eliminar gasto"
      :destructive="true"
      :loading="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
    />
  </div>
</template>
