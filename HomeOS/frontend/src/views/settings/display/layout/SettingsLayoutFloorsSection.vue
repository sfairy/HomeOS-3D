<!--
组件：SettingsLayoutFloorsSection.vue
所属模块：frontend / src / views / settings / display / layout
职责：楼层配置区段。维护各楼层底图路径、画布宽高比、楼层统计实体绑定（灯光/温控/电量/异常），
      并在多楼层时展示「楼层切换器」的排列方向、按钮尺寸与定位（锁定后可在户型图上拖拽）。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
  - SettingsRangeField：滑块输入（按钮尺寸 / 位置微调）
  - SETTINGS_RANGE_STEP：滑块步进常量
  - EntityInput：统计实体选择
  - useLayoutStore：读写 layoutConfig.floors / floorSwitcherConfig
数据来源：layoutStore.layoutConfig.floors 与 floorSwitcherConfig
-->
<template>
  <div class="settings-hub-section layout-floors-hub">
    <SettingsCard full static>
      <SettingsFlowBand
        :steps="floorsFlowSteps"
        class="lf-flow-band"
        band-class="lf-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="楼层流程"
        :collapsed-summary="floorsFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'楼层'"
            :value="floors.length"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'拖拽'"
            :value="floorSwitcherCfg.isLocked ? '锁定' : '解锁'"
            :tone="floorSwitcherCfg.isLocked ? 'amber' : 'emerald'"
            :val-tone="floorSwitcherCfg.isLocked ? 'amber' : 'emerald'"
          />
        </template>
      </SettingsFlowBand>

      <header class="layout-floors__head">
        <div>
          <p class="layout-floors__eyebrow">{{ '户型分层' }}</p>
          <h3 class="layout-floors__title">{{ '楼层配置' }}</h3>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="floors.length" class="layout-floors__badge">{{ `${floors.length} 层` }}</span>
        </div>
      </header>

      <div v-if="floors.length" class="space-y-3">
        <article v-for="(floor, idx) in floors" :key="floor.id" class="layout-floor-card">
          <header class="layout-floor-card__head">
            <span class="layout-floor-card__index">{{ idx + 1 }}</span>
            <input
              v-model="floor.name"
              type="text"
              class="settings-field layout-floor-card__name"
              :placeholder="'楼层名称'"
            />
            <button
              type="button"
              class="layout-floor-card__delete"
              @click="$emit('delete-floor', floor.id)"
            >
              {{ '删除该层' }}
            </button>
          </header>
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div class="md:col-span-8">
              <label class="settings-form-label">{{ '底图路径' }}</label>
              <div class="relative mt-1 group/input">
                <input
                  v-model="floor.backgroundUrl"
                  type="text"
                  class="settings-field font-mono text-xs pr-10"
                  :placeholder="'/floorplans/lights_off.png'"
                />
                <button
                  type="button"
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center lf-asset-pick-btn rounded-md transition-all"
                  :title="'从素材库拾取路径'"
                  :aria-label="'从素材库拾取路径'"
                  @click="$emit('open-floor-asset-pick', floor.id)"
                >
                  <Search class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div class="md:col-span-4">
              <label class="settings-form-label">{{ '画布宽高比' }}</label>
              <input
                v-model="floor.floorplanAspectRatio"
                type="text"
                class="settings-field font-mono text-xs mt-1"
                :placeholder="'留空=自动按底图比例'"
                @input="
                  floor.floorplanAspectRatioManual = !!String(
                    floor.floorplanAspectRatio || '',
                  ).trim()
                "
              />
              <p class="text-[12px] lf-c-muted mt-1">
                {{ '留空时选图/加载底图将自动匹配原始宽高比。' }}
              </p>
            </div>
          </div>
          <div class="pt-3 mt-3 border-t border-white/5">
            <p class="text-[12px] font-bold lf-c-muted uppercase tracking-wider mb-3">
              {{ '楼层统计实体绑定（可选覆盖）' }}
            </p>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label class="settings-form-label">{{ '灯光统计' }}</label
                ><EntityInput
                  v-model="(floor.statsSensors || {}).lights"
                  :placeholder="'sensor.1f_lights'"
                  wrapper-class="mt-0.5"
                  domain-filter="sensor"
                />
              </div>
              <div>
                <label class="settings-form-label">{{ '温控统计' }}</label
                ><EntityInput
                  v-model="(floor.statsSensors || {}).climates"
                  :placeholder="'sensor.1f_climates'"
                  wrapper-class="mt-0.5"
                  domain-filter="sensor"
                />
              </div>
              <div>
                <label class="settings-form-label">{{ '电量监控' }}</label
                ><EntityInput
                  v-model="(floor.statsSensors || {}).battery"
                  :placeholder="'sensor.1f_battery'"
                  wrapper-class="mt-0.5"
                  domain-filter="sensor"
                />
              </div>
              <div>
                <label class="settings-form-label">{{ '异常监控' }}</label
                ><EntityInput
                  v-model="(floor.statsSensors || {}).offline"
                  :placeholder="'sensor.1f_offline'"
                  wrapper-class="mt-0.5"
                  domain-filter="sensor"
                />
              </div>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="settings-premium-empty settings-premium-empty--violet">
        <Building2 class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">{{ '尚未定义楼层' }}</p>
        <p class="settings-premium-empty__desc">
          {{ '在布局页顶栏添加楼层后，可在此配置各层底图与统计实体' }}
        </p>
      </div>

      <Transition name="fade-down">
        <div v-if="floors.length > 1" class="mt-5 lf-switcher-panel rounded-2xl p-5 space-y-5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-1.5 h-1.5 rounded-full lf-switcher-dot animate-pulse" />
              <span class="text-xs font-bold lf-switcher-title">{{
                '楼层切换器 · 布局与定位'
              }}</span>
            </div>
            <button
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all',
                floorSwitcherCfg.isLocked !== false
                  ? 'lf-lock-btn--locked'
                  : 'lf-lock-btn--unlocked',
              ]"
              @click="$emit('toggle-switcher-lock')"
            >
              <Lock v-if="floorSwitcherCfg.isLocked !== false" class="w-3.5 h-3.5" />
              <Unlock v-else class="w-3.5 h-3.5" />
              <span class="text-xs font-bold">{{
                floorSwitcherCfg.isLocked !== false ? '已锁定定位' : '定位已解锁'
              }}</span>
            </button>
          </div>
          <p class="text-xs lf-c-muted">{{ '解锁后可在户型图上直接拖拽调节位置' }}</p>
          <div
            :class="[
              'space-y-5 transition-all duration-300',
              floorSwitcherCfg.isLocked !== false
                ? 'opacity-40 pointer-events-none grayscale-[0.5]'
                : '',
            ]"
          >
            <div>
              <label class="settings-form-label">{{ '排列方向' }}</label>
              <div class="flex gap-2 mt-1.5">
                <button
                  :class="[
                    'flex-1 py-2 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                    floorSwitcherCfg.direction !== 'horizontal'
                      ? 'lf-dir-btn--active'
                      : 'lf-dir-btn--idle',
                  ]"
                  @click="$emit('set-switcher-dir', 'vertical')"
                >
                  <Grid3x3 class="w-3.5 h-3.5" /> {{ '纵向' }}
                </button>
                <button
                  :class="[
                    'flex-1 py-2 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                    floorSwitcherCfg.direction === 'horizontal'
                      ? 'lf-dir-btn--active'
                      : 'lf-dir-btn--idle',
                  ]"
                  @click="$emit('set-switcher-dir', 'horizontal')"
                >
                  <Grid3x3 class="w-3.5 h-3.5" /> {{ '横向' }}
                </button>
              </div>
            </div>
            <SettingsRangeField
              v-model="floorSwitcherCfg.btnSize"
              variant="plain"
              :label="'按钮尺寸'"
              :min="28"
              :max="72"
              :step="SETTINGS_RANGE_STEP.btnSizePx"
              unit="px"
              class="mt-1"
            />
            <div class="mt-3">
              <label class="settings-form-label">{{ '位置微调（相对于户型图左上角，px）' }}</label>
              <SettingsRangeField
                v-model="floorSwitcherCfg.left"
                variant="inline"
                :label="'左偏移'"
                leading="左"
                :min="0"
                :max="2000"
                :step="SETTINGS_RANGE_STEP.positionPx"
                unit="px"
                class="mt-1.5"
                @enter="$emit('save-layout')"
              />
              <SettingsRangeField
                v-model="floorSwitcherCfg.top"
                variant="inline"
                :label="'上偏移'"
                leading="上"
                :min="0"
                :max="2000"
                :step="SETTINGS_RANGE_STEP.positionPx"
                unit="px"
                class="mt-2"
                @enter="$emit('save-layout')"
              />
            </div>
          </div>
        </div>
      </Transition>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Building2, Search, Lock, Unlock, Grid3x3, Image, Ratio, BarChart3 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsRangeField from '@/views/settings/shared/layout/SettingsRangeField.vue'
import { SETTINGS_RANGE_STEP } from '@/utils/settings/range-steps.util'
import EntityInput from '@/components/common/EntityInput.vue'
import { useLayoutStore } from '@/stores/layout.store'

const layoutStore = useLayoutStore()
/** 必须用 computed：删除楼层会替换整个 floors 数组，不能缓存旧引用 */
const floors = computed(() => layoutStore.layoutConfig.floors || [])
// 楼层切换器配置：缺失时回退默认（左上角 -1/-1、纵向、44px、锁定）
const floorSwitcherCfg = computed(() => {
  const lc = layoutStore.layoutConfig
  if (!lc.floorSwitcherConfig) {
    lc.floorSwitcherConfig = {
      left: -1,
      top: -1,
      direction: 'vertical',
      btnSize: 44,
      isLocked: true,
    }
  }
  return lc.floorSwitcherConfig
})

// 楼层流程步骤：定义楼层 → 底图素材 → 宽高比 → 统计覆盖 → 楼层切换器
const floorsFlowSteps = computed(() => [
  { label: '定义楼层', meta: `${floors.value.length} 层`, icon: Building2, tone: 'in' },
  { label: '底图素材', meta: '素材库路径', icon: Image, tone: 'sky' },
  { label: '宽高比', meta: '自动/手动', icon: Ratio, tone: 'mid' },
  { label: '统计覆盖', meta: '温湿度/人数', icon: BarChart3, tone: 'exec' },
  {
    label: '楼层切换器',
    meta: floorSwitcherCfg.value.direction === 'horizontal' ? '横向' : '纵向',
    icon: Grid3x3,
    tone: 'out',
  },
])

// 楼层流程折叠态摘要：层数 + 锁定状态
const floorsFlowSummary = computed(() => {
  const lock = floorSwitcherCfg.value.isLocked ? '定位锁定' : '定位解锁'
  return `${floors.value.length} 层 · ${lock}`
})

// 对外事件：删除楼层、打开底图素材拾取、切换切换器锁定、设置排列方向、保存布局
defineEmits([
  'delete-floor',
  'open-floor-asset-pick',
  'toggle-switcher-lock',
  'set-switcher-dir',
  'save-layout',
])
</script>

<style src="./styles/SettingsLayoutFloorsSection.css"></style>
