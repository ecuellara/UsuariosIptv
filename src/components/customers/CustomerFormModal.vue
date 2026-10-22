<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import PhoneInput from '@/components/ui/PhoneInput.vue'
import { queryKeys } from '@/lib/query-keys'
import { toUserMessage } from '@/lib/errors'
import { createCustomer, updateCustomer } from '@/services/customers'
import { useToast } from '@/composables/useToast'
import type { Customer } from '@/types/domain'

/* Formulario de referencia del proyecto: vee-validate + zod.
   Las reglas viven en el esquema, no en el template. `trim` se aplica en el
   esquema y los mensajes salen en español. */

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ customer?: Customer | null }>()
const emit = defineEmits<{ saved: [id: string] }>()

const queryClient = useQueryClient()
const toast = useToast()

const isEdit = computed(() => Boolean(props.customer))
const saving = ref(false)
const formError = ref<string | null>(null)

const schema = toTypedSchema(
  z.object({
    firstName: z
      .string()
      .trim()
      .min(1, 'Escribe el nombre.')
      .max(60, 'Máximo 60 caracteres.'),
    lastName: z
      .string()
      .trim()
      .min(1, 'Escribe el apellido.')
      .max(60, 'Máximo 60 caracteres.'),
    phone: z
      .string()
      .regex(/^\d{9,15}$/, 'Ingresa un celular de 9 dígitos (empieza con 9).'),
    notes: z.string().max(500, 'Máximo 500 caracteres.'),
  }),
)

interface CustomerFormValues {
  firstName: string
  lastName: string
  phone: string
  notes: string
}

const { errors, values, resetForm, validate, defineField } = useForm<CustomerFormValues>({
  validationSchema: schema,
  initialValues: { firstName: '', lastName: '', phone: '', notes: '' },
})

/* `values` es de solo lectura: los campos escriben por `defineField`, que
   actualiza el formulario y dispara la validación. */
const [firstName] = defineField('firstName')
const [lastName] = defineField('lastName')
const [phone] = defineField('phone')
const [notes] = defineField('notes')

watch(open, (value) => {
  if (!value) return
  formError.value = null
  resetForm({
    values: {
      firstName: props.customer?.firstName ?? '',
      lastName: props.customer?.lastName ?? '',
      phone: props.customer?.phone ?? '',
      notes: props.customer?.notes ?? '',
    },
  })
})

async function save(): Promise<void> {
  formError.value = null
  const result = await validate()
  if (!result.valid) {
    await nextTick()
    const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]')
    invalid?.focus()
    return
  }

  saving.value = true
  try {
    const payload = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phone: values.phone,
      notes: values.notes.trim() ? values.notes.trim() : null,
    }
    let id = props.customer?.id ?? ''
    if (props.customer) {
      await updateCustomer(props.customer.id, {
        first_name: payload.firstName,
        last_name: payload.lastName,
        phone: payload.phone,
        notes: payload.notes,
      })
    } else {
      id = await createCustomer(payload)
    }
    toast.success(props.customer ? 'Cliente actualizado' : 'Cliente registrado', {
      description: props.customer
        ? `${payload.firstName} ${payload.lastName} se guardó correctamente.`
        : 'Ya puedes registrarle una cuenta IPTV.',
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard', 'metrics'] })
    open.value = false
    emit('saved', id)
  } catch (error) {
    formError.value = toUserMessage(error, 'No se pudo guardar el cliente.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    v-model:open="open"
    :title="isEdit ? 'Editar cliente' : 'Nuevo cliente'"
    :description="isEdit ? 'Los cambios se guardan en el cliente, no en sus cuentas.' : 'El teléfono no es único: varias personas pueden compartir número.'"
    :prevent-close="saving"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <AppInput
          v-model="firstName"
          label="Nombre"
          autocomplete="given-name"
          :required="true"
          :error="errors.firstName ?? null"
          :disabled="saving"
          :maxlength="60"
        />
        <AppInput
          v-model="lastName"
          label="Apellido"
          autocomplete="family-name"
          :required="true"
          :error="errors.lastName ?? null"
          :disabled="saving"
          :maxlength="60"
        />
      </div>

      <PhoneInput
        v-model="phone"
        label="Teléfono"
        :required="true"
        :error="errors.phone ?? null"
        :disabled="saving"
      />

      <AppTextarea
        v-model="notes"
        label="Notas"
        hint="Opcional. Cómo llegó, referencias o acuerdos verbales."
        :maxlength="500"
        :rows="3"
        :disabled="saving"
        :error="errors.notes ?? null"
      />

      <p v-if="formError" class="text-sm text-danger-text" role="alert">{{ formError }}</p>
    </form>

    <template #footer>
      <AppButton variant="secondary" :disabled="saving" @click="open = false">Cancelar</AppButton>
      <AppButton variant="primary" :loading="saving" @click="save">
        {{ isEdit ? 'Guardar cambios' : 'Crear cliente' }}
      </AppButton>
    </template>
  </AppModal>
</template>
