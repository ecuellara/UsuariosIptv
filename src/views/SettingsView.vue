<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSkeleton from '@/components/ui/AppSkeleton.vue'
import { useToast } from '@/composables/useToast'
import { toUserMessage } from '@/lib/errors'
import { formatDate } from '@/lib/dates'
import { queryKeys } from '@/lib/query-keys'
import { getAppSettings, listPlans, updateAppSettings } from '@/services/plans'
import { updateDisplayName } from '@/services/profile'
import { listWhatsAppTemplates } from '@/services/followups'
import { accountStatus } from '@/services/rpc'
import { usePreferencesStore, type DensityPreference, type ThemePreference } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { statusLabel } from '@/lib/format'
import PlanRowEditor from '@/components/settings/PlanRowEditor.vue'
import SecuritySettings from '@/components/settings/SecuritySettings.vue'
import WhatsAppTemplateCard from '@/components/settings/WhatsAppTemplateCard.vue'

const queryClient = useQueryClient()
const toast = useToast()
const session = useSessionStore()
const preferences = usePreferencesStore()

/* --- Perfil --------------------------------------------------------------- */

const displayName = ref(session.displayName)
const profileSaving = ref(false)
const profileError = ref<string | null>(null)
const profileDirty = computed(() => displayName.value.trim() !== session.displayName)

watch(
  () => session.displayName,
  (value) => {
    displayName.value = value
  },
)

async function saveProfile(): Promise<void> {
  profileError.value = null
  if (displayName.value.trim().length < 2) {
    profileError.value = 'Escribe un nombre de al menos 2 caracteres.'
    return
  }
  profileSaving.value = true
  try {
    const userId = session.userId
    if (!userId) throw new Error('Sesión no disponible')
    await updateDisplayName(userId, displayName.value.trim())
    await session.refreshProfile()
    toast.success('Perfil actualizado')
  } catch (error) {
    profileError.value = toUserMessage(error, 'No se pudo guardar el perfil.')
  } finally {
    profileSaving.value = false
  }
}

/* --- Reglas de vencimiento ------------------------------------------------ */

const settingsQuery = useQuery({
  queryKey: queryKeys.settings.all,
  queryFn: getAppSettings,
})

const rules = reactive({
  urgentDays: '3',
  warningDays: '7',
  minTokens: '5',
})
const rulesError = ref<string | null>(null)
const rulesSaving = ref(false)
const rulesDirty = ref(false)

watch(
  () => settingsQuery.data.value,
  (settings) => {
    if (!settings) return
    rules.urgentDays = String(settings.urgentDays)
    rules.warningDays = String(settings.warningDays)
    rules.minTokens = String(settings.minTokenBalance)
    rulesDirty.value = false
  },
  { immediate: true },
)

const savedSettings = computed(() => settingsQuery.data.value ?? null)

/* Ejemplo en vivo usando la función SQL `account_status` (no se replica el CASE
   en TypeScript). Refleja las reglas guardadas, no el borrador sin guardar. */
const previewQuery = useQuery({
  queryKey: computed(() => [
    'settings',
    'preview',
    savedSettings.value?.urgentDays ?? 0,
    savedSettings.value?.warningDays ?? 0,
  ]),
  queryFn: async () => {
    const settings = savedSettings.value
    if (!settings) throw new Error('Sin configuración')
    const now = Date.now()
    const dayMs = 86_400_000
    const at = (days: number) => new Date(now + days * dayMs).toISOString()
    const [today, urgent, warning] = await Promise.all([
      // Vence dentro de un minuto: sigue siendo hoy pero aún no pasó, así que
      // debe dar URGENTE. Pasar `now()` daría VENCIDA por el `>=` de la regla.
      accountStatus(new Date(now + 60_000).toISOString()),
      accountStatus(at(settings.urgentDays + 1)),
      accountStatus(at(settings.warningDays + 1)),
    ])
    return { today, urgent, warning }
  },
  enabled: computed(() => savedSettings.value !== null),
})

const previewText = computed(() => {
  const settings = savedSettings.value
  const data = previewQuery.data.value
  if (!settings || !data) return null
  return `Hoy → ${statusLabel(data.today)} · en ${settings.urgentDays + 1} días → ${statusLabel(data.urgent)} · en ${settings.warningDays + 1} días → ${statusLabel(data.warning)}`
})

async function saveRules(): Promise<void> {
  rulesError.value = null
  const urgent = Number(rules.urgentDays)
  const warning = Number(rules.warningDays)
  const minTokens = Number(rules.minTokens)

  if (!Number.isInteger(urgent) || urgent < 0 || urgent > 30) {
    rulesError.value = 'Los días de urgencia deben estar entre 0 y 30.'
    return
  }
  if (!Number.isInteger(warning) || warning < 1 || warning > 60) {
    rulesError.value = 'Los días de aviso deben estar entre 1 y 60.'
    return
  }
  if (urgent >= warning) {
    rulesError.value = 'Los días de urgencia deben ser menores que los de aviso.'
    return
  }
  if (!Number.isInteger(minTokens) || minTokens < 0) {
    rulesError.value = 'El mínimo de tokens debe ser un entero mayor o igual a 0.'
    return
  }

  rulesSaving.value = true
  try {
    await updateAppSettings({
      urgentDays: urgent,
      warningDays: warning,
      minTokenBalance: minTokens,
    })
    toast.success('Reglas actualizadas', {
      description: 'Los estados de la vista se recalculan en la siguiente lectura.',
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    rulesDirty.value = false
  } catch (error) {
    rulesError.value = toUserMessage(error, 'No se pudo guardar la configuración.')
  } finally {
    rulesSaving.value = false
  }
}

/* --- Planes --------------------------------------------------------------- */

const plansQuery = useQuery({ queryKey: queryKeys.plans.all, queryFn: listPlans })

const templatesQuery = useQuery({
  queryKey: queryKeys.followups.templates,
  queryFn: listWhatsAppTemplates,
})

function resetRules(): void {
  rules.urgentDays = String(savedSettings.value?.urgentDays ?? 3)
  rules.warningDays = String(savedSettings.value?.warningDays ?? 7)
  rules.minTokens = String(savedSettings.value?.minTokenBalance ?? 5)
  rulesDirty.value = false
  rulesError.value = null
}

/* --- Apariencia ----------------------------------------------------------- */

const themeOptions: ReadonlyArray<{ value: ThemePreference; label: string; icon: 'sun' | 'moon' | 'monitor' }> = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'system', label: 'Sistema', icon: 'monitor' },
]

const densityOptions: ReadonlyArray<{ value: DensityPreference; label: string }> = [
  { value: 'comfortable', label: 'Cómoda' },
  { value: 'compact', label: 'Compacta' },
]

function setTheme(value: ThemePreference): void {
  preferences.setTheme(value)
}

function setDensity(value: DensityPreference): void {
  preferences.setDensity(value)
}

/* --- Navegación de secciones ---------------------------------------------- */

const sections = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'reglas', label: 'Reglas de vencimiento' },
  { id: 'planes', label: 'Planes' },
  { id: 'plantillas', label: 'Plantillas de WhatsApp' },
  { id: 'apariencia', label: 'Apariencia' },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="text-3xl font-semibold text-content">Configuración</h1>
      <p class="mt-1 text-base text-content-muted">
        Reglas y catálogos que usa el panel. Los cambios de plan no alteran renovaciones ya
        registradas: cada operación congela su snapshot.
      </p>
    </header>

    <div class="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <nav aria-label="Secciones de configuración" class="mb-4 lg:sticky lg:top-20 lg:mb-0">
        <ul class="flex flex-wrap gap-1 lg:flex-col">
          <li v-for="section in sections" :key="section.id">
            <a
              :href="`#${section.id}`"
              class="flex min-h-11 items-center rounded-sm px-3 text-sm text-content-muted hover:bg-surface-hover hover:text-content"
            >
              {{ section.label }}
            </a>
          </li>
        </ul>
      </nav>

      <div class="flex max-w-4xl flex-col gap-8">
        <!-- Perfil -->
        <section id="perfil" class="panel p-5" aria-labelledby="perfil-titulo">
          <h2 id="perfil-titulo" class="text-xl font-semibold text-content">Perfil</h2>
          <p class="mt-1 text-sm text-content-muted">
            Nombre visible en el panel. El correo pertenece a Supabase Auth y no se edita aquí.
          </p>

          <div class="mt-4 flex flex-col gap-4">
            <AppInput
              v-model="displayName"
              label="Nombre visible"
              :maxlength="80"
              :disabled="profileSaving"
              :error="profileError"
            />
            <div class="flex flex-col gap-1">
              <span class="field-label">Correo</span>
              <p class="text-base text-content">{{ session.userEmail }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <AppButton
                variant="primary"
                :disabled="!profileDirty"
                :loading="profileSaving"
                @click="saveProfile"
              >
                Guardar cambios
              </AppButton>
              <AppButton variant="secondary" :disabled="profileSaving" @click="session.signOut()">
                <template #icon><AppIcon name="logout" :size="18" /></template>
                Cerrar sesión
              </AppButton>
            </div>
          </div>
        </section>

        <!-- Seguridad: 2FA y contraseña -->
        <SecuritySettings />

        <!-- Reglas -->
        <section id="reglas" class="panel p-5" aria-labelledby="reglas-titulo">
          <h2 id="reglas-titulo" class="text-xl font-semibold text-content">
            Reglas de vencimiento
          </h2>
          <p class="mt-1 text-sm text-content-muted">
            Estos umbrales alimentan los estados de las cuentas. El cálculo vive en la vista de
            cuentas, no en el navegador.
          </p>

          <div v-if="settingsQuery.isPending.value" class="mt-4 flex flex-col gap-2" aria-busy="true">
            <AppSkeleton width="100%" height="40px" />
            <AppSkeleton width="100%" height="40px" />
            <AppSkeleton width="100%" height="40px" />
          </div>

          <AppAlert
            v-else-if="settingsQuery.isError.value"
            class="mt-4"
            variant="danger"
            title="No se pudo cargar la configuración"
          >
            <template #actions>
              <AppButton size="sm" variant="secondary" @click="settingsQuery.refetch()">
                Reintentar
              </AppButton>
            </template>
          </AppAlert>

          <form v-else class="mt-4 flex flex-col gap-4" novalidate @submit.prevent="saveRules">
            <div class="grid gap-4 sm:grid-cols-3">
              <AppInput
                v-model="rules.urgentDays"
                label="Días de urgencia"
                inputmode="numeric"
                hint="0 a 30"
                :disabled="rulesSaving"
                @update:model-value="rulesDirty = true"
              />
              <AppInput
                v-model="rules.warningDays"
                label="Días de aviso"
                inputmode="numeric"
                hint="1 a 60"
                :disabled="rulesSaving"
                @update:model-value="rulesDirty = true"
              />
              <AppInput
                v-model="rules.minTokens"
                label="Mínimo de tokens"
                inputmode="numeric"
                hint="Alerta de saldo"
                :disabled="rulesSaving"
                @update:model-value="rulesDirty = true"
              />
            </div>

            <div class="rounded-md border border-border bg-surface-sunken px-3 py-2">
              <p class="text-xs font-medium uppercase tracking-caps text-content-muted">
                Ejemplo con las reglas guardadas
              </p>
              <p v-if="previewText" class="mt-1 text-sm text-content">{{ previewText }}</p>
              <p v-else class="mt-1 text-sm text-content-muted">Calculando…</p>
            </div>

            <p v-if="rulesError" class="text-sm text-danger-text" role="alert">{{ rulesError }}</p>

            <div class="flex items-center gap-2">
              <AppButton
                type="submit"
                variant="primary"
                :disabled="!rulesDirty"
                :loading="rulesSaving"
              >
                Guardar cambios
              </AppButton>
              <AppButton
                variant="secondary"
                :disabled="!rulesDirty || rulesSaving"
                @click="resetRules"
              >
                Restablecer
              </AppButton>
              <span v-if="savedSettings" class="ml-auto text-xs text-content-muted">
                Actualizado {{ formatDate(savedSettings.updatedAt) }}
              </span>
            </div>
          </form>
        </section>

        <!-- Planes -->
        <section id="planes" class="panel p-5" aria-labelledby="planes-titulo">
          <h2 id="planes-titulo" class="text-xl font-semibold text-content">Planes</h2>
          <p class="mt-1 text-sm text-content-muted">
            Edita meses, dispositivos, precio y tokens por plan. La clave no se modifica.
          </p>

          <AppAlert
            class="mt-3"
            variant="info"
            title="Los cambios aplican a renovaciones nuevas"
          >
            Las renovaciones ya registradas conservan su snapshot de precio y tokens.
          </AppAlert>

          <div v-if="plansQuery.isPending.value" class="mt-4 flex flex-col gap-2" aria-busy="true">
            <AppSkeleton v-for="index in 5" :key="index" width="100%" height="52px" />
          </div>

          <AppAlert
            v-else-if="plansQuery.isError.value"
            class="mt-4"
            variant="danger"
            title="No se pudieron cargar los planes"
          >
            <template #actions>
              <AppButton size="sm" variant="secondary" @click="plansQuery.refetch()">
                Reintentar
              </AppButton>
            </template>
          </AppAlert>

          <div v-else class="mt-4 overflow-hidden rounded-lg border border-border">
            <div class="dt-container !border-0">
              <table class="dt dt-form">
                <caption class="sr-only">Catálogo de planes editable</caption>
                <thead>
                  <tr>
                    <th scope="col" class="min-w-[190px]">Plan</th>
                    <th scope="col" class="w-20">Meses</th>
                    <th scope="col" class="w-36">Dispositivos</th>
                    <th scope="col" class="w-32">Precio</th>
                    <th scope="col" class="w-20">Tokens</th>
                    <th scope="col" class="w-20">Activo</th>
                    <th scope="col" class="w-24 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  <PlanRowEditor
                    v-for="plan in plansQuery.data.value ?? []"
                    :key="plan.id"
                    :plan="plan"
                  />
                </tbody>
              </table>
            </div>
          </div>
          <p v-if="plansQuery.data.value?.length === 0" class="mt-2 text-sm text-danger-text">
            Sin planes activos. Activa al menos uno para poder renovar.
          </p>
        </section>

        <!-- Plantillas de WhatsApp -->
        <section id="plantillas" class="panel p-5" aria-labelledby="plantillas-titulo">
          <h2 id="plantillas-titulo" class="text-xl font-semibold text-content">
            Plantillas de WhatsApp
          </h2>
          <p class="mt-1 text-sm text-content-muted">
            Textos que se preparan en Seguimiento. La app solo abre el chat: no envía mensajes.
            Editar una plantilla no reescribe los contactos ya registrados.
          </p>

          <AppAlert class="mt-3" variant="info" title="El historial queda congelado">
            Cada contacto guarda el mensaje exacto que se abrió. Cambiar una plantilla solo
            afecta a los mensajes nuevos.
          </AppAlert>

          <div v-if="templatesQuery.isPending.value" class="mt-4 flex flex-col gap-3" aria-busy="true">
            <AppSkeleton v-for="index in 4" :key="index" width="100%" height="96px" />
          </div>

          <AppAlert
            v-else-if="templatesQuery.isError.value"
            class="mt-4"
            variant="danger"
            title="No se pudieron cargar las plantillas"
          >
            <template #actions>
              <AppButton size="sm" variant="secondary" @click="templatesQuery.refetch()">
                Reintentar
              </AppButton>
            </template>
          </AppAlert>

          <p
            v-else-if="(templatesQuery.data.value ?? []).length === 0"
            class="mt-4 text-sm text-danger-text"
          >
            No hay plantillas en la base. Revisa el seed o crea una desde el panel de Supabase.
          </p>

          <div v-else class="mt-4 flex flex-col gap-4">
            <WhatsAppTemplateCard
              v-for="template in templatesQuery.data.value ?? []"
              :key="template.id"
              :template="template"
            />
          </div>
        </section>

        <!-- Apariencia -->
        <section id="apariencia" class="panel p-5" aria-labelledby="apariencia-titulo">
          <h2 id="apariencia-titulo" class="text-xl font-semibold text-content">Apariencia</h2>
          <p class="mt-1 text-sm text-content-muted">
            Se guarda en este dispositivo. No se envía a la base de datos.
          </p>

          <div class="mt-4 flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <span class="field-label">Tema</span>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Tema de la interfaz">
                <button
                  v-for="option in themeOptions"
                  :key="option.value"
                  type="button"
                  class="segment"
                  :aria-pressed="preferences.theme === option.value"
                  @click="setTheme(option.value)"
                >
                  <AppIcon :name="option.icon" :size="16" />
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <span class="field-label">Densidad</span>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Densidad de las tablas">
                <button
                  v-for="option in densityOptions"
                  :key="option.value"
                  type="button"
                  class="segment"
                  :aria-pressed="preferences.density === option.value"
                  @click="setDensity(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              <p class="text-xs text-content-muted">
                Compacta reduce las filas de 52 a 40 px.
              </p>
            </div>
          </div>
        </section>

        <p class="text-xs text-content-muted">
          La exportación de datos se habilitará en una entrega posterior. Las plantillas de
          WhatsApp ya se editan aquí y no alteran el historial de contactos.
        </p>
      </div>
    </div>
  </div>
</template>
