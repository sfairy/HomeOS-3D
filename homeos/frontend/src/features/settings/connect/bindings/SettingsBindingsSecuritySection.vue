<!--
组件：SettingsBindingsSecuritySection.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：安防绑定分区。按 Tab 切换门铃路由（多路触发实体/摄像头/门锁）、危险源绑定、
      门禁事件记录路径，并以流程概览展示门铃与事件路径状态；同时给出「安防主控方案」
      对比卡片，引导用户避免重复布防。
关键依赖：
  - EntityInput：实体选择
  - HazardBindingsSection：危险源（烟/气/漏）绑定子组件
  - SettingsFlowBand / SettingsFlowStat / SettingsOrchTabs：布局
  - SETTINGS_ROUTES：跳转安防场景/参数页
数据来源：父级透传的 doorbellList / eventsPath / hazard 系列双向绑定 + emit 回调
-->
<template>
  <div class="settings-hub-section bind-security-hub">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="securityFlowSteps"
        class="bind-sec-flow"
        band-class="bind-sec-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="securityFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'门铃路由'"
            :value="`${doorbellList.length} 路`"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'事件路径'"
            :value="eventsPath?.trim() ? '已配置' : '未配置'"
            :tone="eventsPath?.trim() ? 'emerald' : 'amber'"
            :val-tone="eventsPath?.trim() ? 'emerald' : 'amber'"
          />
        </template>
      </SettingsFlowBand>
      <div class="bind-energy-dock">
        <SettingsOrchTabs v-model="bindingsSecurityTab" :tabs="bindingsSecurityTabs" plain />
      </div>

      <div v-show="bindingsSecurityTab === 'doorbell'" class="bind-doorbell-section">
        <header class="bind-section__head">
          <div>
            <p class="bind-section__eyebrow">{{ '门铃路由' }}</p>
            <h3 class="bind-section__title">{{ '多路门铃绑定' }}</h3>
          </div>
          <span v-if="doorbellList.length" class="bind-section__badge">{{
            `${doorbellList.length} 路`
          }}</span>
        </header>

        <div v-if="doorbellList.length" class="bind-doorbell-list">
          <article v-for="(db, idx) in doorbellList" :key="db.id || idx" class="bind-doorbell-card">
            <header class="bind-doorbell-card__head">
              <span class="bind-doorbell-card__index">{{ idx + 1 }}</span>
              <input
                v-model="db.label"
                type="text"
                class="settings-field bind-doorbell-card__label"
                :placeholder="'前门'"
              />
              <button
                type="button"
                class="bind-doorbell-card__delete"
                :title="'删除此路门铃'"
                :aria-label="'删除此路门铃'"
                @click="$emit('remove-doorbell', idx)"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </header>
            <div class="bind-doorbell-card__fields">
              <label class="bind-doorbell-card__field">
                <span class="bind-doorbell-card__field-label">{{ '触发实体' }}</span>
                <EntityInput
                  v-model="db.triggerEntityId"
                  :placeholder="'触发实体'"
                  domain-filter="input_boolean,binary_sensor,switch,button,input_button"
                  suggest-device-class="door"
                />
              </label>
              <label class="bind-doorbell-card__field">
                <span class="bind-doorbell-card__field-label">{{ '摄像头' }}</span>
                <EntityInput
                  v-model="db.cameraEntityId"
                  :placeholder="'摄像头'"
                  domain-filter="camera"
                />
              </label>
              <label class="bind-doorbell-card__field">
                <span class="bind-doorbell-card__field-label">{{ '门锁（可选）' }}</span>
                <EntityInput
                  v-model="db.lockEntityId"
                  :placeholder="'门锁(可选)'"
                  domain-filter="lock"
                  suggest-device-class="lock"
                />
              </label>
            </div>
          </article>
        </div>
        <div v-else class="bind-doorbell-empty">
          <Bell class="bind-doorbell-empty__icon" />
          <p class="bind-doorbell-empty__title">{{ '尚未配置门铃' }}</p>
          <p class="bind-doorbell-empty__desc">
            {{ '点击页头「添加门铃」配置触发实体、摄像头与门锁' }}
          </p>
        </div>
      </div>

      <div v-show="bindingsSecurityTab === 'hazard'" class="bind-hazard-section">
        <HazardBindingsSection
          v-model:hazard-smoke-entity-ids="hazardSmokeEntityIds"
          v-model:hazard-gas-entity-ids="hazardGasEntityIds"
          v-model:hazard-leak-entity-ids="hazardLeakEntityIds"
          v-model:hazard-emergency-scene-id="hazardEmergencySceneId"
          v-model:hazard-gas-valve-entity-id="hazardGasValveEntityId"
          v-model:hazard-water-valve-entity-id="hazardWaterValveEntityId"
          v-model:hazard-exhaust-fan-entity-ids="hazardExhaustFanEntityIds"
          v-model:hazard-drill-mode="hazardDrillMode"
          :hazard-testing="hazardTesting"
          :hazard-drill-busy="hazardDrillBusy"
          :hazard-drill-tip="hazardDrillTip"
          :hazard-drill-ok="hazardDrillOk"
          @test-hazard="$emit('test-hazard')"
          @hazard-drill="forwardHazardDrill"
        />
      </div>

      <div v-show="bindingsSecurityTab === 'events'" class="bind-events-section">
        <header class="bind-section__head">
          <div>
            <p class="bind-section__eyebrow">{{ '事件与抓拍' }}</p>
            <h3 class="bind-section__title">{{ '门禁事件记录' }}</h3>
          </div>
        </header>
        <div class="settings-form-grid">
          <div class="col-span-2">
            <label class="settings-form-label mb-1.5">{{ '抓拍记录路径' }}</label>
            <input
              v-model="eventsPath"
              type="text"
              class="settings-field"
              :placeholder="'/local/events.jsonl'"
            />
          </div>
          <button
            type="button"
            class="settings-btn-ghost shrink-0 self-end"
            :disabled="eventsValidating"
            @click="$emit('test-events-path')"
          >
            {{ eventsValidating ? '检测中…' : '测试连通' }}
          </button>
        </div>
        <p
          v-if="eventsValidateTip"
          :class="[
            'bind-events-tip',
            'text-[12px] mt-2 font-mono',
            eventsValidateOk ? 'bind-events-tip--ok' : 'bind-events-tip--warn',
          ]"
        >
          {{ eventsValidateTip }}
        </p>
        <p class="settings-note-callout settings-note-callout--pink mt-4">
          <span class="settings-note-callout__label">{{ '多路路由' }}</span>
          <span>{{
            '每路门铃独立触发弹窗，自动匹配对应摄像头与门锁。eventsPath 用于安防页门禁事件时间轴。'
          }}</span>
        </p>
      </div>
    </SettingsCard>

    <SettingsCard static extra-class="bind-sec-overview-card mt-4 settings-card--keep-nested">
      <div class="bind-sec-overview">
        <header class="bind-sec-overview__head">
          <div class="bind-sec-overview__head-orb" aria-hidden="true">
            <Shield class="bind-sec-overview__head-icon" />
          </div>
          <div class="bind-sec-overview__head-copy">
            <p class="bind-sec-overview__eyebrow">{{ '避免重复布防' }}</p>
            <h3 class="bind-sec-overview__title">{{ '安防主控方案' }}</h3>
            <p class="bind-sec-overview__desc">
              {{ '与虚拟面板、布局安防场景、家庭模式的关系' }}
            </p>
          </div>
        </header>

        <div class="bind-sec-overview__paths" role="list">
          <article class="bind-sec-path bind-sec-path--homeos" role="listitem">
            <span class="bind-sec-path__badge">{{ '推荐' }}</span>
            <div class="bind-sec-path__icon-wrap">
              <ShieldCheck class="bind-sec-path__icon" />
            </div>
            <h4 class="bind-sec-path__name">{{ 'HomeOS 虚拟安防面板' }}</h4>
            <p class="bind-sec-path__hint">{{ '大屏 / 安防页 · 区域传感器 · 离家模拟' }}</p>
          </article>
          <article class="bind-sec-path bind-sec-path--ha" role="listitem">
            <div class="bind-sec-path__icon-wrap">
              <Shield class="bind-sec-path__icon" />
            </div>
            <h4 class="bind-sec-path__name">
              HA <code class="bind-sec-path__code">alarm_control_panel</code>
            </h4>
            <p class="bind-sec-path__hint">{{ 'Home Assistant 原生报警面板实体弹窗' }}</p>
          </article>
        </div>

        <div class="bind-sec-overview__note">
          <Sparkles class="bind-sec-overview__note-icon" aria-hidden="true" />
          <p class="bind-sec-overview__note-text">
            {{ '推荐只选一种主布防入口。安防面板负责布防；生活方式设备写在「家庭模式」；「安防场景」动作只放外围设备。布防↔家庭模式对照见安防场景 · 联动。' }}
          </p>
        </div>

        <div class="bind-sec-overview__actions">
          <RouterLink :to="SETTINGS_ROUTES.securityModes()" class="bind-sec-action bind-sec-action--primary">
            <LayoutGrid class="bind-sec-action__icon" aria-hidden="true" />
            <span>{{ '配置安防场景动作' }}</span>
            <ArrowRight class="bind-sec-action__arrow" aria-hidden="true" />
          </RouterLink>
          <RouterLink :to="SETTINGS_ROUTES.params('security')" class="bind-sec-action bind-sec-action--ghost">
            <SlidersHorizontal class="bind-sec-action__icon" aria-hidden="true" />
            <span>{{ '高级参数 · 安防阈值' }}</span>
            <ArrowRight class="bind-sec-action__arrow" aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Bell,
  Trash2,
  Shield,
  ShieldCheck,
  Sparkles,
  LayoutGrid,
  SlidersHorizontal,
  ArrowRight,
  Camera,
  DoorOpen,
  Lock,
  History,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import HazardBindingsSection from '@/features/settings/connect/bindings/HazardBindingsSection.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import type { DoorbellConfig } from '@/types/setup-wizard'

// 入参：安防子 Tab 配置、事件校验态与提示、危险源测试/演练态与提示
defineProps({
  bindingsSecurityTabs: { type: Array, default: () => [] },
  eventsValidating: Boolean,
  eventsValidateTip: { type: String, default: '' },
  eventsValidateOk: Boolean,
  hazardTesting: Boolean,
  hazardDrillBusy: Boolean,
  hazardDrillTip: { type: String, default: '' },
  hazardDrillOk: { type: Boolean, default: true },
})

// 双向绑定：当前安防子 Tab（doorbell / hazard / events）
const bindingsSecurityTab = defineModel('bindingsSecurityTab', {
  type: String,
  default: 'doorbell',
})
// 双向绑定：门禁事件抓拍记录路径
const eventsPath = defineModel('eventsPath', { type: String, default: '' })
// 双向绑定：门铃配置列表（触发实体 / 摄像头 / 门锁）
const doorbellList = defineModel<DoorbellConfig[]>('doorbellList', { default: () => [] })
// 双向绑定：危险源系列实体（烟/气/漏/阀门/排气扇/演练模式/紧急场景）
const hazardSmokeEntityIds = defineModel<string[]>('hazardSmokeEntityIds', { default: () => [] })
const hazardGasEntityIds = defineModel<string[]>('hazardGasEntityIds', { default: () => [] })
const hazardLeakEntityIds = defineModel<string[]>('hazardLeakEntityIds', { default: () => [] })
const hazardEmergencySceneId = defineModel('hazardEmergencySceneId', { type: String, default: '' })
const hazardGasValveEntityId = defineModel('hazardGasValveEntityId', { type: String, default: '' })
const hazardWaterValveEntityId = defineModel('hazardWaterValveEntityId', {
  type: String,
  default: '',
})
const hazardExhaustFanEntityIds = defineModel('hazardExhaustFanEntityIds', {
  type: String,
  default: '',
})
const hazardDrillMode = defineModel('hazardDrillMode', { type: Boolean, default: false })

// 流程概览折叠态摘要文案：门铃路数 · 事件路径状态
const securityFlowSummary = computed(() => {
  const n = doorbellList.value.length || 0
  const path = eventsPath.value?.trim() ? '事件已配置' : '事件未配置'
  return `${n} 路门铃 · ${path}`
})

// 流程概览步骤：触发实体 → 摄像头 → 门铃弹窗 → 门锁 → 安防时间轴
const securityFlowSteps = computed(() => [
  { label: '触发实体', meta: `${doorbellList.value.length || 0} 路门铃`, icon: Bell, tone: 'in' as const },
  { label: '摄像头', meta: '实时画面', icon: Camera, tone: 'sky' as const },
  { label: '门铃弹窗', meta: '大屏', icon: DoorOpen, tone: 'mid' as const },
  { label: '门锁', meta: '可选联动', icon: Lock, tone: 'exec' as const },
  {
    label: '安防时间轴',
    meta: eventsPath.value?.trim() ? '事件已接入' : '待配置路径',
    icon: History,
    tone: 'out' as const,
  },
])

// 对外事件：删除门铃、测试事件路径、测试危险源、危险源演练
const emit = defineEmits(['remove-doorbell', 'test-events-path', 'test-hazard', 'hazard-drill'])

// 转发危险源演练事件给父级（保留事件名一致）
function forwardHazardDrill(kind: string) {
  emit('hazard-drill', kind)
}
</script>

<style scoped src="./styles/SettingsBindingsSecuritySection.css"></style>
