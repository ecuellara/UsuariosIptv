<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppSwitch from '@/components/ui/AppSwitch.vue'
import MoneyInput from '@/components/ui/MoneyInput.vue'
import { useToast } from '@/composables/useToast'
import { toUserMessage } from '@/lib/errors'
import { decimalString } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { updatePlan } from '@/services/plans'
import type { Plan } from '@/types/domain'

const props = defineProps<{ plan: Plan }>()
const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const toast = useToast()

const saving = ref(false)
const error = ref<string | null>(null)

const draft = reactive({
  name: props.plan.name,
  durationMonths: String(props.plan.durationMonths),
  devices: String(props.plan.devices),
  price: decimalString(props.plan.suggestedPrice),
  tokens: String(props.plan.tokensRequired),
  isActive: props.plan.isActive,
})

watch(
  () => props.plan,
  (plan) => {
    draft.name = plan.name
    draft.durationMonths = String(plan.durationMonths)
    draft.devices = String(plan.devices)
    draft.price = decimalString(plan.suggestedPrice)
    draft.tokens = String(plan.tokensRequired)
    draft.isActive = plan.isActive
  },
  { deep: true },
)

const dirty = computed(() => {
  return (
    draft.name !== props.plan.name ||
    Number(draft.durationMonths) !== props.plan.durationMonths ||
    Number(draft.devices) !== props.plan.devices ||
    Number(draft.price) !== Number(props.plan.suggestedPrice) ||
    Number(draft.tokens) !== props.plan.tokensRequired ||
    draft.isActive !== props.plan.isActive
  )
})

const devicesOptions = [
  { value: '1', label: '1 dispositivo' },
  { value: '3', label: '3 dispositivos' },
]

async function save(): Promise<void> {
  error.value = null
  const months = Number(draft.durationMonths)
  const tokens = Number(draft.tokens)
  const price = Number(draft.price)

  if (draft.name.trim().length === 0) {
    error.value = 'El nombre del plan es obligatorio.'
    return
  }
  if (draft.price.trim().length === 0) {
    error.value = 'El precio es obligatorio (puede ser 0.00).'
    return
  }
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    error.value = 'Los meses deben ser un entero entre 1 y 60.'
    return
  }
  if (!Number.isInteger(tokens) || tokens < 0 || tokens > 99) {
    error.value = 'Los tokens deben ser un entero entre 0 y 99.'
    return
  }
  if (!Number.isFinite(price) || price < 0) {
    error.value = 'El precio no es válido.'
    return
  }

  saving.value = true
  try {
    await updatePlan(props.plan.id, {
      name: draft.name.trim(),
      duration_months: months,
      devices: Number(draft.devices),
      suggested_price: price,
      tokens_required: tokens,
      is_active: draft.isActive,
    })
    toast.success('Plan actualizado', {
      description: 'Las renovaciones ya registradas conservan su snapshot.',
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.plans.all })
    emit('saved')
  } catch (caught) {
    error.value = toUserMessage(caught, 'No se pudo guardar el plan.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <tr>
    <td class="dt-card-primary" data-label="Plan">
      <AppInput
        v-model="draft.name"
        label="Nombre del plan"
        hide-label
        :maxlength="80"
        :disabled="saving"
      />
      <p class="mt-1 font-mono text-xs text-content-muted">{{ plan.key }}</p>
      <p v-if="error" class="mt-1 text-xs text-danger-text" role="alert">{{ error }}</p>
    </td>

    <td data-label="Meses">
      <AppInput
        v-model="draft.durationMonths"
        label="Meses"
        hide-label
        inputmode="numeric"
        :disabled="saving"
      />
    </td>

    <td data-label="Dispositivos">
      <AppSelect
        v-model="draft.devices"
        label="Dispositivos"
        hide-label
        :options="devicesOptions"
        :disabled="saving"
      />
    </td>

    <td data-label="Precio sugerido">
      <MoneyInput
        v-model="draft.price"
        label="Precio sugerido"
        hide-label
        :disabled="saving"
        :min="0"
      />
    </td>

    <td data-label="Tokens">
      <AppInput
        v-model="draft.tokens"
        label="Tokens"
        hide-label
        inputmode="numeric"
        :disabled="saving"
      />
    </td>

    <td data-label="Activo">
      <AppSwitch v-model="draft.isActive" label="Activo" hide-label :disabled="saving" />
    </td>

    <td class="dt-card-actions" data-label="Acciones">
      <div class="dt-actions">
        <AppButton
          size="sm"
          variant="secondary"
          :disabled="!dirty"
          :loading="saving"
          @click="save"
        >
          Guardar
        </AppButton>
      </div>
    </td>
  </tr>
</template>
