<!--
组件：DisplaySection.vue
所属模块：frontend / src / views / settings / system / profiles
职责：显示方案区段。展示 UI 布局方案列表，支持新建/切换/删除方案、终端绑定与默认值配置，
      展示方案克隆流程概览。数据由 useProfilesSection 注入。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat / ApiQueryState：卡片与流程
  - HosSelect：方案选择
  - useProfilesSection：注入方案/绑定相关状态与方法
数据来源：useProfilesSection() 返回的 layoutStore / terminalBindings / createNewProfile 等
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard full static extra-class="profiles-shell">
      <SettingsFlowBand
        :steps="profileFlowSteps"
        class="pd-flow-band"
        band-class="pd-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="方案流程"
        :collapsed-summary="profileFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'方案数量'"
            :value="layoutStore.availableProfiles?.length || 0"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'当前方案'"
            :value="layoutStore.activeProfileId || '—'"
            tone="sky"
            val-tone="sky"
          />
        </template>
      </SettingsFlowBand>

      <ApiQueryState
        :loading="layoutStore.isProfilesLoading"
        :error="layoutStore.profilesLoadError"
        error-title="显示方案加载失败"
        tone="indigo"
      >
        <header class="profile-section__head">
          <div>
            <p class="profile-section__eyebrow">{{ '终端方案' }}</p>
            <h3 class="profile-section__title">{{ '已绑定显示方案' }}</h3>
          </div>
          <span v-if="layoutStore.availableProfiles?.length" class="profile-section__badge">{{
            `${layoutStore.availableProfiles.length} 个`
          }}</span>
        </header>

        <div v-if="showCreateProfile" class="settings-note-box mb-4">
          <p class="pd-section-eyebrow font-bold mb-3 uppercase tracking-wider text-[12px]">
            {{ '新方案 ID（推荐使用设备名称）' }}
          </p>
          <div class="flex flex-col gap-3 sm:flex-row">
            <input
              v-model="newProfileName"
              type="text"
              :placeholder="'输入新方案唯一 ID...'"
              class="settings-field flex-1"
              @keyup.enter="createNewProfile"
            />
            <button type="button" class="settings-btn-accent shrink-0" @click="createNewProfile">
              {{ '确认克隆' }}
            </button>
          </div>
          <p class="text-[12px] pd-desc mt-2">
            {{ '从当前 UI 布局克隆一份新方案，不含联动器与系统参数。' }}
          </p>
        </div>

        <div v-if="layoutStore.availableProfiles?.length" class="profile-list">
          <article
            v-for="p in layoutStore.availableProfiles"
            :key="p.projectId"
            :class="[
              'profile-card',
              p.projectId === layoutStore.activeProfileId && 'profile-card--active',
            ]"
          >
            <div class="profile-card__main">
              <span
                class="profile-card__orb"
                :class="p.projectId === layoutStore.activeProfileId && 'profile-card__orb--active'"
              />
              <div class="profile-card__info">
                <div class="profile-card__title-row">
                  <h4 class="profile-card__name">{{ profileLabel(p.projectId) }}</h4>
                  <span v-if="p.projectId === 'default'" class="profile-card__tag">{{
                    '系统默认'
                  }}</span>
                  <span
                    v-if="p.projectId === layoutStore.activeProfileId"
                    class="profile-card__active-badge"
                    >{{ '当前' }}</span
                  >
                </div>
                <p class="profile-card__meta">{{ formatLastSaved(p.updatedAt) }}</p>
                <p class="profile-card__id font-mono">{{ p.projectId }}</p>
              </div>
            </div>
            <div class="profile-card__actions">
              <button
                v-if="p.projectId !== layoutStore.activeProfileId"
                type="button"
                class="profile-card__btn profile-card__btn--switch"
                :title="'切换到此方案'"
                :aria-label="'切换到此方案'"
                @click="switchToProfile(p.projectId)"
              >
                <RefreshCw class="w-4 h-4" />
              </button>
              <button
                v-if="p.projectId !== layoutStore.activeProfileId && p.projectId !== 'default'"
                type="button"
                class="profile-card__btn profile-card__btn--delete"
                :title="'删除方案'"
                :aria-label="'删除方案'"
                @click="onDeleteProfile(p.projectId)"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </article>
        </div>
        <div
          v-else-if="!layoutStore.isProfilesLoading"
          class="settings-premium-empty settings-premium-empty--indigo"
        >
          <Monitor class="settings-premium-empty__icon" />
          <p class="settings-premium-empty__title">{{ '暂无显示方案' }}</p>
          <p class="settings-premium-empty__desc">
            {{ '创建新方案以保存不同的 UI 布局与侧栏组态' }}
          </p>
          <div class="settings-premium-empty__actions">
            <button
              type="button"
              class="settings-premium-empty__btn settings-premium-empty__btn--accent"
              @click="showCreateProfile = !showCreateProfile"
            >
              {{ '新建方案' }}
            </button>
          </div>
        </div>
      </ApiQueryState>

      <div class="profile-section__divider" />

      <div class="pd-bind-row">
        <div class="settings-note-box pd-local-box">
          <p class="pd-section-eyebrow font-bold mb-2 uppercase tracking-wider text-[12px]">
            {{ '本终端' }}
          </p>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm text-white font-medium">{{ localTerminalLabel }}</p>
              <p class="text-[12px] pd-mono-faint font-mono mt-0.5">
                {{ shortClientId(localClientId) }}
              </p>
              <p class="text-[12px] pd-info-text mt-1">
                {{ '当前方案' }}:
                <span class="pd-accent-mono font-mono">{{ localBinding.profileId }}</span>
              </p>
            </div>
            <button
              type="button"
              class="settings-btn-accent text-xs shrink-0"
              :disabled="bindingActionLoading"
              @click="bindCurrentTerminal"
            >
              {{ bindingActionLoading ? '绑定中…' : '绑定到当前方案' }}
            </button>
          </div>
        </div>

        <div v-if="isAdmin" class="settings-note-box">
          <p class="pd-section-eyebrow-neutral font-bold mb-2 uppercase tracking-wider text-[12px]">
            {{ '新终端默认策略' }}
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <HosSelect
              variant="settings"
              trigger-class="text-xs max-w-xs"
              v-model="newTerminalDefault"
              :disabled="defaultsLoading || defaultsSaving"
            >
              <option value="activeProfile">{{ '跟随当前激活方案' }}</option>
              <option value="default">{{ '使用 default 方案' }}</option>
            </HosSelect>
            <button
              type="button"
              class="settings-btn-ghost text-xs"
              :disabled="defaultsSaving"
              @click="saveNewTerminalDefault"
            >
              {{ defaultsSaving ? '保存中…' : '保存策略' }}
            </button>
          </div>
          <p class="text-[12px] pd-desc mt-2">
            {{ '无 URL、无本地缓存、无绑定时，新设备使用上述策略。' }}
          </p>
        </div>
      </div>

      <div v-if="isAdmin" class="mt-4 pt-4 border-t border-white/5">
        <header class="profile-section__head mb-3">
          <div>
            <p class="profile-section__eyebrow">{{ '跨设备绑定' }}</p>
            <h3 class="profile-section__title">{{ '已注册终端' }}</h3>
          </div>
          <span v-if="!bindingsLoading" class="profile-section__badge">{{
            `${terminalBindings.length} 台`
          }}</span>
        </header>
        <ApiQueryState
          :loading="bindingsLoading"
          :error="bindingsError"
          error-title="终端绑定加载失败"
          tone="indigo"
        >
          <div v-if="terminalBindings.length" class="profile-list">
            <article v-for="b in terminalBindings" :key="b.clientId" class="profile-card">
              <div class="profile-card__main">
                <span class="profile-card__orb" />
                <div class="profile-card__info">
                  <div class="profile-card__title-row">
                    <h4 class="profile-card__name">{{ b.label || '未命名终端' }}</h4>
                    <span v-if="b.clientId === localClientId" class="profile-card__active-badge">{{
                      '本机'
                    }}</span>
                  </div>
                  <p class="profile-card__meta font-mono text-[12px]">
                    {{ shortClientId(b.clientId) }}
                  </p>
                  <div class="profile-card__bind-row">
                    <HosSelect
                      variant="inline"
                      trigger-class="profile-card__profile-select"
                      :model-value="b.profileId"
                      :disabled="bindingActionLoading"
                      @update:model-value="
                        (v) => updateTerminalBindingProfile(b.clientId, String(v), b.label)
                      "
                    >
                      <option
                        v-for="p in layoutStore.availableProfiles || []"
                        :key="p.projectId"
                        :value="p.projectId"
                      >
                        {{ profileLabel(p.projectId) }}
                      </option>
                    </HosSelect>
                  </div>
                </div>
              </div>
              <div class="profile-card__actions">
                <button
                  type="button"
                  class="profile-card__btn profile-card__btn--delete"
                  :title="'解除绑定'"
                  :aria-label="'解除绑定'"
                  :disabled="bindingActionLoading"
                  @click="removeTerminalBinding(b.clientId)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </article>
          </div>
          <p v-else class="text-[12px] pd-desc">
            {{ '暂无终端绑定；在各设备上切换方案后将自动注册。' }}
          </p>
        </ApiQueryState>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { Copy, Monitor, RefreshCw, Smartphone, Trash2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { useProfilesSection } from './useProfilesSection'

const profileFlowSteps = [
  { label: 'UI 布局', meta: '布局配置', icon: Monitor, tone: 'in' },
  { label: '方案克隆', meta: '终端方案', icon: Copy, tone: 'mid' },
  { label: '终端绑定', meta: '自动记忆', icon: Smartphone, tone: 'exec' },
  { label: '切换生效', meta: '即时加载', icon: RefreshCw, tone: 'out' },
]

const {
  layoutStore,
  isAdmin,
  showCreateProfile,
  newProfileName,
  createNewProfile,
  switchToProfile,
  onDeleteProfile,
  profileLabel,
  formatLastSaved,
  localClientId,
  localTerminalLabel,
  shortClientId,
  localBinding,
  terminalBindings,
  bindingsLoading,
  bindingsError,
  bindingActionLoading,
  newTerminalDefault,
  defaultsLoading,
  defaultsSaving,
  saveNewTerminalDefault,
  bindCurrentTerminal,
  removeTerminalBinding,
  updateTerminalBindingProfile,
} = useProfilesSection([
  'layoutStore',
  'isAdmin',
  'showCreateProfile',
  'newProfileName',
  'createNewProfile',
  'switchToProfile',
  'onDeleteProfile',
  'profileLabel',
  'formatLastSaved',
  'localClientId',
  'localTerminalLabel',
  'shortClientId',
  'localBinding',
  'terminalBindings',
  'bindingsLoading',
  'bindingsError',
  'bindingActionLoading',
  'newTerminalDefault',
  'defaultsLoading',
  'defaultsSaving',
  'saveNewTerminalDefault',
  'bindCurrentTerminal',
  'removeTerminalBinding',
  'updateTerminalBindingProfile',
])

const profileFlowSummary = computed(() => {
  const n = layoutStore.availableProfiles?.length || 0
  const active = layoutStore.activeProfileId || '—'
  return `${n} 个方案 · ${active}`
})
</script>

<style src="./styles/DisplaySection.css"></style>
