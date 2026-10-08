<!--
组件：SettingsScreensaverSection.vue
所属模块：frontend / src / views / settings / display
职责：通用设置「锁屏屏保」区段。提供启用开关、空闲分钟数，保存到 AppConfig.screensaver；
      细粒度视觉参数跳转高级参数 screensaver 分区。
关键依赖：
  - SettingsCard / SettingsCardIntro / SettingsFeatureMaster / SettingsRangeField
  - WeatherEffectsSwitch（复用布尔开关样式）
  - patchSystemConfig / reloadFrontendConfig / getConfigSection
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard full static>
      <SettingsCardIntro
        :icon="Moon"
        icon-class="general-intro-icon--violet"
        orb-class="orb-violet"
        eyebrow="锁屏屏保"
        :description="'空闲超时后全屏显示时钟 / 天气锁屏；关闭后不再自动进入。'"
      />

      <SettingsFeatureMaster
        class="settings-feature-master--inset mt-5"
        :icon="Moon"
        tone="accent"
        :active="form.enabled"
        :title="'启用锁屏屏保'"
        :hint="
          form.enabled
            ? '保存后立即生效：空闲超时自动进入锁屏'
            : '关闭后本终端不再自动进入锁屏屏保'
        "
      >
        <template #actions>
          <WeatherEffectsSwitch v-model="form.enabled" aria-label="启用锁屏屏保" />
        </template>
      </SettingsFeatureMaster>

      <div v-if="form.enabled" class="settings-slider-group mt-5">
        <SettingsRangeField
          v-model="form.idleMinutes"
          :label="'空闲多久进入屏保'"
          :min="1"
          :max="60"
          :step="1"
          unit="分钟"
          :hint="'推荐 2 分钟；保存后立即生效'"
        />
      </div>

      <div class="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="settings-btn-accent"
          :disabled="saving || !isDirty"
          @click="onSave"
        >
          {{ saving ? '保存中…' : '保存屏保设置' }}
        </button>
        <button type="button" class="settings-btn-ghost" @click="goAdvanced">
          {{ '高级外观参数' }}
        </button>
        <span v-if="!isDirty && !saving" class="text-xs opacity-50">{{ '已与服务器同步' }}</span>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Moon } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsFeatureMaster from '@/views/settings/shared/layout/SettingsFeatureMaster.vue'
import SettingsRangeField from '@/views/settings/shared/layout/SettingsRangeField.vue'
import WeatherEffectsSwitch from '@/views/settings/display/weather-effects/WeatherEffectsSwitch.vue'
import {
  handleSystemConfigPatchError,
  patchSystemConfig,
} from '@/composables/config/system-config-core.internals'
import {
  getConfigSection,
  loadFrontendConfig,
  onConfigChange,
  reloadFrontendConfig,
} from '@/utils/config/frontend-config'
import { useChromeStore } from '@/stores/chrome.store'

const router = useRouter()
const chrome = useChromeStore()
const saving = ref(false)

function readPower() {
  const ss = getConfigSection('screensaver') || {}
  const ui = getConfigSection('ui') || {}
  const enabled = (ss.screensaverEnabled ?? ui.screensaverEnabled ?? true) !== false
  const idleMs = Number(ss.screensaverIdleMs ?? ui.screensaverIdleMs ?? 120000) || 120000
  const idleMinutes = Math.min(60, Math.max(1, Math.round(idleMs / 60000)))
  return { enabled, idleMinutes }
}

const baseline = reactive(readPower())
const form = reactive({ ...baseline })

const isDirty = computed(
  () => form.enabled !== baseline.enabled || form.idleMinutes !== baseline.idleMinutes,
)

function syncFromConfig() {
  const next = readPower()
  const dirty =
    form.enabled !== baseline.enabled || form.idleMinutes !== baseline.idleMinutes
  baseline.enabled = next.enabled
  baseline.idleMinutes = next.idleMinutes
  if (!dirty) {
    form.enabled = next.enabled
    form.idleMinutes = next.idleMinutes
  }
}

let unsub = null

onMounted(async () => {
  await loadFrontendConfig()
  syncFromConfig()
  unsub = onConfigChange((sections) => {
    if (!sections || sections.includes('screensaver') || sections.includes('ui')) {
      syncFromConfig()
    }
  })
})

onUnmounted(() => {
  unsub?.()
})

async function onSave() {
  if (saving.value || !isDirty.value) return
  saving.value = true
  try {
    const idleMs = Math.min(3_600_000, Math.max(10_000, Math.round(form.idleMinutes * 60000)))
    await patchSystemConfig({
      screensaver: {
        screensaverEnabled: form.enabled,
        screensaverIdleMs: idleMs,
      },
    })
    await reloadFrontendConfig()
    baseline.enabled = form.enabled
    baseline.idleMinutes = Math.min(60, Math.max(1, Math.round(idleMs / 60000)))
    form.idleMinutes = baseline.idleMinutes
    chrome.notify(form.enabled ? '屏保已启用' : '屏保已关闭', 'success')
  } catch (e) {
    if (await handleSystemConfigPatchError(e, chrome)) return
    chrome.notify('保存屏保设置失败', 'error')
  } finally {
    saving.value = false
  }
}

function goAdvanced() {
  router.push({ path: '/settings', query: { tab: 'params', section: 'screensaver' } })
}
</script>
