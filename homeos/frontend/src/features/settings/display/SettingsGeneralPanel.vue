<!--
  通用设置面板。按子导航切换：站点品牌（siteTitle）、导航标签（NavTabEditor）、
  底部信息栏、锁屏屏保、显示缩放（整页等比缩放 + 布局尺寸与停靠）、
  性能调试（高/中/低三档：界面动效、毛玻璃与图表动画）、全屋关闭。中控风格固定石板深蓝。
  退出登录不在本页：它是会话动作，常驻在设置侧栏底部的账号条（SettingsSidebar）。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="general"
    icon-key="settings"
    accent="var(--hos-color-accent)"
    layout="single"
    page-class="general-hub"
    body-class="general-hub__body"
  >
    <template #subnav>
      <SettingsHubSubnav v-model="generalSection" :sections="generalSubnavSections" />
    </template>

    <div v-show="generalSection === 'brand'" class="settings-hub-section">
      <SettingsCard full static extra-class="general-brand-card">
        <SettingsFlowBand
          :steps="generalBrandFlowSteps"
          class="general-flow-band"
          band-class="general-flow-band__shell"
          collapsible
          default-collapsed
          toggle-label="品牌流程"
          :collapsed-summary="brandFlowSummary"
        >
          <template #stats>
            <SettingsFlowStat
              :label="'站点名称'"
              :value="brandPreviewTitle.length > 12 ? `${brandPreviewTitle.slice(0, 12)}…` : brandPreviewTitle"
              tone="accent"
              val-tone="accent"
            />
            <SettingsFlowStat
              :label="'布局变更'"
              :value="pendingChanges ? '待保存' : '已同步'"
              :tone="pendingChanges ? 'amber' : 'emerald'"
              :val-tone="pendingChanges ? 'amber' : 'emerald'"
            />
          </template>
        </SettingsFlowBand>

        <div class="settings-deploy-notes general-brand-notes">
          <div class="settings-deploy-note settings-deploy-note--indigo">
            <div class="settings-deploy-note__icon">
              <Monitor class="w-4 h-4" />
            </div>
            <div class="settings-deploy-note__body">
              <p class="settings-deploy-note__title">{{ '生效范围' }}</p>
              <p class="settings-deploy-note__text">
                {{ '写入当前 UI 方案，仅本终端 / 本方案生效。' }}
              </p>
            </div>
          </div>
        </div>

        <div class="general-brand-editor">
          <div class="general-brand-editor__head">
            <label class="general-brand-editor__label" for="general-site-title">{{
              '显示名称'
            }}</label>
            <span class="general-brand-editor__chip">{{ '布局 · 站点名称' }}</span>
          </div>
          <div class="general-brand-editor__input-wrap">
            <Type class="general-brand-editor__input-icon" aria-hidden="true" />
            <input
              id="general-site-title"
              v-model="layoutStore.layoutConfig.siteTitle"
              type="text"
              class="general-brand-editor__input"
              maxlength="48"
              :placeholder="'如：我的智能家居'"
            />
          </div>
          <div class="general-brand-preview" aria-live="polite">
            <span class="general-brand-preview__eyebrow">{{ '顶栏预览' }}</span>
            <div class="general-brand-preview__bar">
              <span class="general-brand-preview__dot" aria-hidden="true" />
              <span class="general-brand-preview__title">{{ brandPreviewTitle }}</span>
            </div>
          </div>
          <p class="general-brand-editor__hint">
            {{ '未填写时使用默认名称' }} <strong>HomeOS</strong
            >{{ '；建议 2–24 字，避免过长导致顶栏截断。' }}
          </p>
        </div>
      </SettingsCard>
    </div>

    <div v-show="generalSection === 'runtime'" class="settings-hub-section">
      <SettingsCard static>
        <SettingsCardIntro
          :icon="Zap"
          icon-class="general-intro-icon--cyan"
          orb-class="orb-cyan"
          eyebrow="界面动效与渲染"
          :description="'调整界面动效、毛玻璃与图表动画的渲染开销以平衡视觉效果与功耗；3D 户型的画质在组件属性面板「渲染分辨率 / 地面反射」中单独设置。'"
        />
        <div class="settings-choice-grid mt-5">
          <button
            :class="perfBtnClass('high')"
            style="--choice-accent: var(--hos-color-accent)"
            @click="setPerformanceMode('high')"
          >
            <Zap class="w-5 h-5" />
            <div class="text-center">
              <div class="text-xs font-bold flex items-center gap-1.5 justify-center">
                <Sparkles class="w-3.5 h-3.5" />{{ '华丽模式' }}
              </div>
              <div class="sys-hint-micro">{{ '完整动效 · 开毛玻璃' }}</div>
            </div>
          </button>
          <button
            :class="perfBtnClass('medium')"
            style="--choice-accent: var(--hos-color-info-text)"
            @click="setPerformanceMode('medium')"
          >
            <MonitorPlay class="w-5 h-5" />
            <div class="text-center">
              <div class="text-xs font-bold">{{ '均衡性能' }}</div>
              <div class="sys-hint-micro">{{ '关毛玻璃与图表动画' }}</div>
            </div>
          </button>
          <button
            :class="perfBtnClass('low')"
            style="--choice-accent: var(--hos-color-warning-text)"
            @click="setPerformanceMode('low')"
          >
            <SettingsIcon class="w-5 h-5" />
            <div class="text-center">
              <div class="text-xs font-bold">{{ '低功耗模式' }}</div>
              <div class="sys-hint-micro">{{ '静态界面 · 关阴影与模糊' }}</div>
            </div>
          </button>
        </div>
        <p
          v-if="autoDowngradeMode"
          class="settings-note-box mt-4 sys-hint-note leading-relaxed"
        >{{
          '当前终端因设备能力或帧率回落自动降为' +
          (autoDowngradeMode === 'low' ? '低功耗模式' : '均衡性能') +
          '（只影响这台终端，不会写入共享布局）；点选任一档位可固定为本机设置。'
        }}</p>
        <p class="settings-note-box mt-6 sys-hint-note leading-relaxed">
          {{ '通知、安防、能源等系统阈值在' }}
          <button
            type="button"
            class="general-link--warn underline font-bold"
            @click="goParamsTab()"
          >
            {{ '高级参数' }}
          </button>
          {{ '中配置；SQLite 历史保留见' }}
          <button
            type="button"
            class="general-link--warn underline font-bold"
            @click="goParamsTab('other')"
          >
            {{ '其它参数' }}
          </button>
          {{ '。' }}
        </p>
      </SettingsCard>
    </div>

    <div v-show="generalSection === 'screensaver'" class="settings-hub-section">
      <SettingsScreensaverSection />
    </div>

    <div v-show="generalSection === 'scaling'" class="settings-hub-section">
      <SettingsLayoutDisplaySection
        :scaling-enabled="scalingEnabled"
        :scale="scale"
        :active-design-width="activeDesignWidth"
        :design-height="DESIGN_HEIGHT"
        :viewport-w="viewportW"
        :viewport-h="viewportH"
        :width-presets="widthPresets"
        :screen-hint="screenHint"
        :screen-height-hint="screenHeightHint"
        @toggle-scaling="toggleScaling()"
        @apply-width-preset="applyWidthPreset"
        @auto-match-resolution="autoMatchResolution"
      />
    </div>

    <div v-show="generalSection === 'nav'" class="settings-hub-section">
      <SettingsCard full static>
        <SettingsCardIntro
          :icon="Grip"
          icon-class="general-intro-icon--emerald"
          orb-class="orb-green"
          eyebrow="顶部导航标签"
          :description="'控制顶栏各功能标签的显示、隐藏、顺序，以及直显或收入「更多」下拉菜单。'"
        />
        <NavTabEditor />
      </SettingsCard>
    </div>

    <div v-show="generalSection === 'footer'" class="settings-hub-section">
      <SettingsLayoutFooterSection
        v-model:preset-to-add="presetToAdd"
        v-model:active-footer-item-id="activeFooterItemId"
        :preset-options="presetOptions"
        :source-options="sourceOptions"
        :footer-item-tabs="footerItemTabs"
        :footer-items-order-key="footerItemsOrderKey"
        :field-options="fieldOptions"
        @toggle-dashboard-footer="toggleDashboardFooter"
        @reset-dashboard-footer="resetDashboardFooter"
        @add-preset="onAddPreset"
        @add-custom-entity="onAddCustomEntity"
        @footer-items-reorder="onFooterItemsReorder"
        @remove-footer-item="onRemoveFooterItem"
      />
    </div>

    <div v-show="generalSection === 'whole-home-off'" class="settings-hub-section">
      <SettingsWholeHomeOffSection />
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { useLayoutConfigRef } from '@/composables/ui/useLayoutConfigRef'
import SettingsPageShell from '@/components/common/settings-page-shell/SettingsPageShell.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import SettingsHubSubnav from '@/features/settings/shared/layout/SettingsHubSubnav.vue'
import { useRouter } from 'vue-router'
import {
  Database,
  Layout,
  Monitor,
  MonitorPlay,
  Settings as SettingsIcon,
  Sparkles,
  Type,
  Zap,
  Grip,
} from '@lucide/vue'
import SettingsWholeHomeOffSection from '@/features/settings/display/SettingsWholeHomeOffSection.vue'
import SettingsScreensaverSection from '@/features/settings/display/SettingsScreensaverSection.vue'
import SettingsLayoutDisplaySection from '@/features/settings/display/layout/SettingsLayoutDisplaySection.vue'
import SettingsLayoutFooterSection from '@/features/settings/display/layout/SettingsLayoutFooterSection.vue'
import { useDashboardFooterEditor } from '@/features/settings/composables/display/layout-dashboard.internals'
import { useScaling } from '@/composables/ui/useScaling'
import { reloadFrontendConfig } from '@/shared/utils/config/frontend-config'
import {
  handleSystemConfigPatchError,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { useChromeStore } from '@/stores/chrome.store'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import NavTabEditor from './NavTabEditor.vue'
import { markPerformanceModeUserSet } from '@/shared/utils/perf/tablet-default-perf.util'
import {
  autoPerformanceModeRef,
  clearAutoPerformanceMode,
  resolveEffectivePerformanceMode,
} from '@/shared/utils/perf/runtime-perf-mode.util'
import { applyGlassEffectDocument } from '@/shared/utils/ui/glass-effect.util'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { useSettingsHubRouteSection } from '@/features/settings/composables/hub-ui.internals'
import { useSettingsPendingChanges } from '@/composables/settings-kernel/pending.internals'

const props = defineProps({ activeTab: { type: String, default: 'general' } })

const router = useRouter()
const chrome = useChromeStore()
// 「修改密码」弹窗已提升到设置页外壳（SettingsPage）：它是账号动作，不与某个 Tab 绑定。
const { layoutStore, layoutConfig } = useLayoutConfigRef()
// 当前激活的子导航区段
const generalSection = ref('brand')

const initialLayoutConfig = ref(null)
const { pendingCount: pendingChanges, takeSnapshot } = useSettingsPendingChanges({
  snapshot: initialLayoutConfig,
  current: () => layoutStore.layoutConfig,
  ready: () => layoutStore.isConfigLoaded,
})

// 配置（重新）加载完成时重拍基线：面板可能先于 loadConfig 挂载（硬刷新 /settings），
// 若只在首次非空时拍快照，切方案 / 重新加载后基线会停在旧配置上，被误判成「待保存」。
watch(
  () => layoutStore.isConfigLoaded,
  (loaded) => {
    if (loaded) takeSnapshot(layoutStore.layoutConfig)
  },
  { immediate: true },
)

// 任意来源保存成功后 layoutDirty 归位：同步基线，让「已同步」状态不至于一直停在「待保存」。
// 延后一拍再拍快照：保存调用方可能在 await 返回后做收尾写入（密钥回填占位等），
// 立刻拍快照会把这部分收尾当成新的未保存项。
watch(
  () => layoutStore.layoutDirty,
  (dirty) => {
    if (dirty || !layoutStore.isConfigLoaded) return
    void nextTick(() => {
      if (!layoutStore.layoutDirty && layoutStore.isConfigLoaded) {
        takeSnapshot(layoutStore.layoutConfig)
      }
    })
  },
)

// 子导航区段配置
const generalSubnavSections = computed(() => {
  return [
    { id: 'brand', label: '站点品牌', emoji: '🎨' },
    { id: 'nav', label: '导航标签', emoji: '🧭' },
    { id: 'footer', label: '底部信息栏', emoji: '📊' },
    { id: 'screensaver', label: '锁屏屏保', emoji: '🌙' },
    { id: 'scaling', label: '显示缩放', emoji: '🖥️' },
    { id: 'runtime', label: '性能调试', emoji: '⚡' },
    { id: 'whole-home-off', label: '全屋关闭', emoji: '🔌' },
  ]
})

// 显示缩放：基于 pageMaxWidth 计算缩放比与设计尺寸
const {
  scalingEnabled,
  toggleScaling,
  scale,
  activeDesignWidth,
  DESIGN_HEIGHT,
  vw: viewportW,
  vh: viewportH,
} = useScaling(computed(() => layoutStore.layoutConfig.pageMaxWidth))

const { save: saveSystemConfig } = useSystemConfig()

// 宽度预设
const widthPresets = [
  { label: 'iPad 1366', w: 1366 },
  { label: 'FHD 1920', w: 1920 },
  { label: '2K 2560', w: 2560 },
  { label: '4K 3840', w: 3840 },
]

// 应用宽度预设：写入 pageMaxWidth，缩放未启用时一并启用
function applyWidthPreset(w) {
  layoutStore.layoutConfig.pageMaxWidth = w
  if (!scalingEnabled.value) toggleScaling()
}

// 屏幕宽度提示（限制在 1024–3840 之间）
const screenHint = computed(() => Math.min(3840, Math.max(1024, window.screen?.width || 1920)))

// 屏幕高度提示（限制在 600–2160 之间）
const screenHeightHint = computed(() =>
  Math.min(2160, Math.max(600, window.screen?.height || 1024)),
)

// 自动匹配屏幕分辨率：写入宽度并保存高度到系统配置，失败时仅提示宽度已生效
async function autoMatchResolution() {
  const w = screenHint.value
  const h = screenHeightHint.value
  layoutStore.layoutConfig.pageMaxWidth = w
  if (!scalingEnabled.value) toggleScaling()
  try {
    await saveSystemConfig({ ui: { scaleBaseHeight: h } })
    await reloadFrontendConfig()
    chrome.notify(
      '已匹配屏幕 {w}×{h}px 并启用等比缩放'.replace('{w}', String(w)).replace('{h}', String(h)),
      'success',
    )
  } catch (e) {
    if (await handleSystemConfigPatchError(e, chrome)) return
    chrome.notify(
      '已匹配宽度 {w}px；高度配置保存失败，请稍后在系统配置中设置 scaleBaseHeight'.replace(
        '{w}',
        String(w),
      ),
      'warn',
    )
  }
}

// 站点标题预览：读取配置，缺失回退为 HomeOS
const brandPreviewTitle = computed(() => {
  const raw = layoutStore.layoutConfig?.siteTitle?.trim()
  return raw || 'HomeOS'
})

// 品牌流程折叠态摘要文案
const brandFlowSummary = computed(() =>
  pendingChanges.value
    ? `${brandPreviewTitle.value} · 有未保存变更`
    : `${brandPreviewTitle.value} · 布局已同步`,
)

// 品牌流程步骤：UI 方案 → 站点名称 → 顶栏预览 → 大屏
const generalBrandFlowSteps = [
  { label: 'UI 方案', meta: '布局配置', icon: Database, tone: 'in' },
  { label: '站点名称', meta: 'siteTitle', icon: Type, tone: 'mid' },
  { label: '顶栏预览', meta: '本终端生效', icon: Layout, tone: 'exec' },
  { label: '大屏', meta: '导航展示', icon: Monitor, tone: 'out' },
]

// 侧栏重入时重置到默认区段
useSettingsSidebarReentryReset(
  () => props.activeTab,
  'general',
  () => {
    generalSection.value = 'brand'
  },
)

// 路由参数同步当前区段
useSettingsHubRouteSection(generalSection, generalSubnavSections, {
  tabId: 'general',
  activeTab: () => props.activeTab,
})

// 毛玻璃效果与生效性能档位变化时重新应用（自动降档也要跟着走）
watch(
  () => [
    layoutConfig.value.glassEffect,
    layoutConfig.value.performanceMode,
    autoPerformanceModeRef.value,
  ],
  () =>
    applyGlassEffectDocument(
      layoutConfig.value.glassEffect,
      resolveEffectivePerformanceMode(layoutConfig.value.performanceMode),
    ),
  { immediate: true },
)

/** 自动降档是否正在生效（设备能力 / 帧率回落），用于提示「显示的不是保存值」 */
const autoDowngradeMode = computed(() => {
  const auto = autoPerformanceModeRef.value
  if (!auto) return null
  return auto === resolveEffectivePerformanceMode(layoutConfig.value.performanceMode) ? auto : null
})

// 性能模式按钮样式：高亮「当前实际生效」的档位，自动降档时用户也能看出真实开销
function perfBtnClass(mode) {
  const active = resolveEffectivePerformanceMode(layoutConfig.value.performanceMode) === mode
  return ['settings-choice-btn', active && 'settings-choice-btn--active']
}

function setPerformanceMode(mode) {
  // 手动选档即声明「本机不再跟随自动降档」
  clearAutoPerformanceMode()
  layoutConfig.value.performanceMode = mode
  markPerformanceModeUserSet()
}

// 底部信息栏编辑：开关/重置/预设与自定义实体/移除/重排/字段与来源选项
const {
  footerCfg,
  toggleDashboardFooter,
  resetDashboardFooter,
  addPreset,
  addCustomEntity,
  removeItem,
  reorderItems,
  fieldOptions,
  sourceOptions,
  presetOptions,
  buildItemTabs,
} = useDashboardFooterEditor(layoutConfig)

const presetToAdd = ref('')
const activeFooterItemId = ref('')

// 底部信息栏项 Tab（每项一个 Tab）
const footerItemTabs = computed(() => buildItemTabs(footerCfg.value.items ?? []))

// 底部信息栏排序 key（用于触发重渲染）
const footerItemsOrderKey = computed(() =>
  (footerCfg.value.items ?? []).map((it) => it.id).join(','),
)

// 项列表变化时自动选中首个或保持当前选中
watch(
  () => (footerCfg.value.items ?? []).map((it) => it.id).join(','),
  () => {
    const items = footerCfg.value.items
    if (!items.length) {
      activeFooterItemId.value = ''
      return
    }
    if (!items.some((it) => it.id === activeFooterItemId.value)) {
      activeFooterItemId.value = items[0].id
    }
  },
  { immediate: true },
)

// 重排底部信息栏项
function onFooterItemsReorder({ fromIndex, toIndex }) {
  reorderItems(fromIndex, toIndex)
}

// 添加预设项：清空输入并选中新添加的项
function onAddPreset() {
  if (!presetToAdd.value) return
  const before = footerCfg.value.items.length
  addPreset(presetToAdd.value)
  presetToAdd.value = ''
  nextTick(() => {
    const added = footerCfg.value.items[before]
    if (added) activeFooterItemId.value = added.id
  })
}

function onAddCustomEntity() {
  const before = footerCfg.value.items.length
  addCustomEntity()
  nextTick(() => {
    const added = footerCfg.value.items[before]
    if (added) activeFooterItemId.value = added.id
  })
}

// 移除底部信息栏项：若移除的是当前选中项，则切换到相邻项
function onRemoveFooterItem(idx) {
  const removedId = footerCfg.value.items[idx]?.id
  removeItem(idx)
  if (activeFooterItemId.value === removedId) {
    const items = footerCfg.value.items
    activeFooterItemId.value = items[Math.min(idx, items.length - 1)]?.id || ''
  }
}

// 跳转到高级参数 Tab（可选指定 section）
function goParamsTab(section) {
  router.push({
    path: '/settings',
    query: section ? { tab: 'params', section } : { tab: 'params' },
  })
}
</script>

<style src="./styles/settings-general-panel.css"></style>
