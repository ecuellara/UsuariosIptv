<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import AccountDetailSheet from '@/components/accounts/AccountDetailSheet.vue'
import AccountFormSheet from '@/components/accounts/AccountFormSheet.vue'
import CorrectExpirationModal from '@/components/accounts/CorrectExpirationModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { toUserMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { markVerification, setAccountArchived } from '@/services/accounts'
import type { Account } from '@/types/domain'

/* Estado y mutaciones de las acciones de una cuenta. Se expone un API mínima
   para que dashboard, listado y ficha de cliente no dupliquen formularios ni
   reglas de archivado. */

const emit = defineEmits<{ changed: [] }>()

const queryClient = useQueryClient()
const toast = useToast()

const detailOpen = ref(false)
const selected = ref<Account | null>(null)
const formOpen = ref(false)
const formAccount = ref<Account | null>(null)
const formCustomerId = ref<string | null>(null)
const formCustomerName = ref<string | null>(null)
const correctingOpen = ref(false)
const confirmOpen = ref(false)
const confirmLoading = ref(false)
const confirmError = ref<string | null>(null)
const pendingAction = ref<'archive' | 'reactivate' | null>(null)

const selectedId = computed(() => selected.value?.id ?? null)

async function refresh(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
  await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  emit('changed')
}

function openDetail(account: Account): void {
  selected.value = account
  detailOpen.value = true
}

function openCreate(customerId?: string, customerName?: string): void {
  formAccount.value = null
  formCustomerId.value = customerId ?? null
  formCustomerName.value = customerName ?? null
  formOpen.value = true
}

function openEdit(account: Account): void {
  formAccount.value = account
  detailOpen.value = false
  formOpen.value = true
}

function onDetailEdit(): void {
  if (selected.value) openEdit(selected.value)
}

function onDetailCorrect(): void {
  if (!selected.value) return
  detailOpen.value = false
  correctingOpen.value = true
}

function onDetailArchive(): void {
  if (!selected.value) return
  pendingAction.value = selected.value.archivedAt ? 'reactivate' : 'archive'
  confirmError.value = null
  confirmOpen.value = true
}

async function onDetailVerify(): Promise<void> {
  if (!selected.value) return
  try {
    await markVerification(selected.value.id, new Date().toISOString())
    toast.success('Fecha marcada como verificada', {
      description: 'La cuenta queda confirmada con la fecha de hoy.',
    })
    detailOpen.value = false
    await refresh()
  } catch (error) {
    toast.error(toUserMessage(error, 'No se pudo marcar la verificación.'))
  }
}

async function confirmArchive(): Promise<void> {
  if (!selected.value || !pendingAction.value) return
  confirmLoading.value = true
  confirmError.value = null
  try {
    await setAccountArchived(selected.value.id, pendingAction.value === 'archive')
    toast.success(
      pendingAction.value === 'archive' ? 'Cuenta archivada' : 'Cuenta reactivada',
      {
        description:
          pendingAction.value === 'archive'
            ? 'Conserva su historial y deja de contar en los vencimientos.'
            : 'Vuelve a contar en los vencimientos.',
      },
    )
    confirmOpen.value = false
    detailOpen.value = false
    await refresh()
  } catch (error) {
    confirmError.value = toUserMessage(error, 'No se pudo cambiar el estado de la cuenta.')
  } finally {
    confirmLoading.value = false
  }
}

defineExpose({ openDetail, openCreate, openEdit })
</script>

<template>
  <AccountDetailSheet
    v-model:open="detailOpen"
    :account-id="selectedId"
    @edit="onDetailEdit"
    @correct-expiration="onDetailCorrect"
    @archive="onDetailArchive"
    @verify="onDetailVerify"
  />

  <AccountFormSheet
    v-model:open="formOpen"
    :account="formAccount"
    :customer-id="formCustomerId"
    :customer-name="formCustomerName"
    @saved="refresh()"
  />

  <CorrectExpirationModal
    v-model:open="correctingOpen"
    :account="selected"
    @saved="refresh()"
  />

  <ConfirmDialog
    v-model:open="confirmOpen"
    :title="pendingAction === 'reactivate' ? 'Reactivar cuenta' : 'Archivar cuenta'"
    :body="
      pendingAction === 'reactivate'
        ? 'La cuenta volverá a contar en los vencimientos y conservará todo su historial.'
        : 'La cuenta dejará de contar en los vencimientos y se conservará su historial. Podrás reactivarla cuando quieras.'
    "
    :confirm-label="pendingAction === 'reactivate' ? 'Reactivar cuenta' : 'Archivar cuenta'"
    :destructive="pendingAction !== 'reactivate'"
    :loading="confirmLoading"
    :error="confirmError"
    @confirm="confirmArchive"
  />
</template>
