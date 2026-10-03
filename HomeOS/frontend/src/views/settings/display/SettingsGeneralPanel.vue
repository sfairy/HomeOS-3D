<!--
组件：SettingsGeneralPanel.vue
所属模块：frontend / src / views / settings / display
职责：通用设置面板。按子导航切换：站点品牌（siteTitle）、导航标签（NavTabEditor）、
      天气特效、高级渲染、性能调试（高/中/低三档）、全屋关闭；并提供安全登出入口。
关键依赖：
  - SettingsPageShell / SettingsCard / SettingsCardIntro：页面骨架
  - SettingsFlowBand / SettingsFlowStat / SettingsHubSubnav：流程概览与子导航
  - NavTabEditor / SettingsWeatherEffectsSection / SettingsRenderingSection / SettingsWholeHomeOffSection：子区段
  - useSettingsPendingChanges / useSettingsSave：待保存变更与保存逻辑
  - applyGlassEffectDocument：毛玻璃效果应用
数据来源：layoutStore.layoutConfig（siteTitle / performanceMode / glassEffect 等）
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="general"
    icon-key="settings"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="general-hub"
    body-class="general-hub__body"
  >
    <template #actions>
      <button class="settings-btn-ghost settings-btn-ghost--danger" @click="onLogout">
        {{ '退出大屏终端' }}
      </button>
    </template>

    <template #mobile-save>
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="saving"
        save-text="保存配置"
        @save="handleSave"
        @cancel="handleCancel"
      />
    </template>

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

    <div v-show="generalSection === 'theme'" class="settings-hub-section general-theme-section">
      <SettingsCard static>
        <SettingsCardIntro :icon="Sparkles" icon-class="general-intro-icon--amber" orb-class="orb-amber" eyebrow="中控主题" :description="'选择当前终端的微晶氛围主题，切换立即生效。'" />
        <div class="general-theme-grid" role="radiogroup" aria-label="中控主题">
          <button
            v-for="option in themeOptions"
            :key="option.id"
            type="button"
            class="general-theme-choice"
            :class="{ 'general-theme-choice--active': activeTheme === option.id }"
            role="radio"
            :aria-checked="activeTheme === option.id"
            @click="setTheme(option.id)"
          >
            <span class="general-theme-swatch" :class="option.swatch" aria-hidden="true" />
            <span>
              <strong>{{ option.label }}</strong>
              <small>{{ option.tagline }}</small>
            </span>
          </button>
        </div>
      </SettingsCard>
    </div>

    <div v-show="generalSection === 'runtime'" class="settings-hub-section">
      <SettingsCard static>
        <SettingsCardIntro
          :icon="Zap"
          icon-class="general-intro-icon--cyan"
          orb-class="orb-cyan"
          eyebrow="动画性能与渲染模式"
          :description="'调整天气背景的渲染帧率以平衡视觉效果与功耗。'"
        />
        <div class="settings-choice-grid mt-5">
          <button
            :class="perfBtnClass('high')"
            style="--choice-accent: var(--module-accent-layout)"
            @click="setPerformanceMode('high')"
          >
            <Zap class="w-5 h-5" />
            <div class="text-center">
              <div class="text-xs font-bold flex items-center gap-1.5 justify-center">
                <Sparkles class="w-3.5 h-3.5" />{{ '华丽模式' }}
              </div>
              <div class="sys-hint-micro">{{ '60fps 完整动效' }}</div>
            </div>
          </button>
          <button
            :class="perfBtnClass('medium')"
            style="--choice-accent: var(--set-info)"
            @click="setPerformanceMode('medium')"
          >
            <MonitorPlay class="w-5 h-5" />
            <div class="text-center">
              <div class="text-xs font-bold">{{ '均衡性能' }}</div>
              <div class="sys-hint-micro">{{ '30fps 天气粒子' }}</div>
            </div>
          </button>
          <button
            :class="perfBtnClass('low')"
            style="--choice-accent: var(--set-warn)"
            @click="setPerformanceMode('low')"
          >
            <SettingsIcon class="w-5 h-5" />
            <div class="text-center">
              <div class="text-xs font-bold">{{ '低功耗模式' }}</div>
              <div class="sys-hint-micro">{{ '静态背景' }}</div>
            </div>
          </button>
        </div>
        <p class="settings-note-box mt-6 sys-hint-note leading-relaxed">
          {{ '通知、安防、能源等系统阈值在' }}
          <button
            type="button"
            class="general-link--warn underline font-bold"
            @click="goParamsTab()"
          >
            {{ '高级参数' }}
          </button>
          {{ '中配置；天气场景特效见' }}
          <button
            type="button"
            class="general-link--info underline font-bold"
            @click="generalSection = 'weather-effects'"
          >
            {{ '天气特效' }}
          </button>
          {{ '子页；PostgreSQL 历史保留见' }}
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

    <div v-show="generalSection === 'weather-effects'" class="settings-hub-section">
      <SettingsWeatherEffectsSection />
    </div>

    <div v-show="generalSection === 'rendering'" class="settings-hub-section">
      <SettingsRenderingSection />
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

    <div v-show="generalSection === 'whole-home-off'" class="settings-hub-section">
      <SettingsWholeHomeOffSection />
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useLayoutConfigRef } from '@/composables/ui/useLayoutConfigRef'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
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
import SettingsWeatherEffectsSection from '@/views/settings/display/SettingsWeatherEffectsSection.vue'
import SettingsRenderingSection from '@/views/settings/display/SettingsRenderingSection.vue'
import SettingsWholeHomeOffSection from '@/views/settings/display/SettingsWholeHomeOffSection.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import NavTabEditor from './NavTabEditor.vue'
import { markPerformanceModeUserSet } from '@/utils/perf/tablet-default-perf.util'
import { applyGlassEffectDocument } from '@/utils/ui/glass-effect.util'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { useSettingsPendingChanges } from '@/composables/settings/pending.internals'
import { useSettingsSave } from '@/composables/settings/hub-ui.internals'
import { syncGlobalLayoutPendingSnapshot } from '@/composables/settings/pending.internals'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import { applyHomeOsTheme } from '@/utils/ui/theme.util'

const props = defineProps({ activeTab: { type: String, default: 'general' } })

const router = useRouter()
const authStore = useAuthStore()
const chrome = useChromeStore()
const { layoutStore, layoutConfig } = useLayoutConfigRef()
// 当前激活的子导航区段
const generalSection = ref('brand')
const activeTheme = ref(applyHomeOsTheme(undefined, false))

/**
 * 主题选项：改为 computed 渲染（不再硬编码两个按钮），
 * 为后续「随系统语言切换实时刷新文案」留出响应式入口。
 * id 与 swatch 类名一一对应，新增主题只需在此追加一条。
 */
const themeOptions = computed(() => [
  {
    id: 'warm-amber',
    label: '琥珀暖意',
    tagline: 'Warm Amber',
    swatch: 'general-theme-swatch--amber',
  },
  {
    id: 'slate-navy',
    label: '石板深蓝',
    tagline: 'Slate Navy',
    swatch: 'general-theme-swatch--navy',
  },
])

/** 主题显示名：通知文案不再硬编码，随 themeOptions 变化自动跟随 */
function themeLabel(mode) {
  return themeOptions.value.find((o) => o.id === mode)?.label || mode
}

function setTheme(mode) {
  activeTheme.value = mode
  applyHomeOsTheme(mode)
  chrome.notify(`已切换为${themeLabel(mode)}主题`, 'success')
}

const initialLayoutConfig = ref(null)
const {
  pendingCount: pendingChanges,
  takeSnapshot,
  confirmAndRevert,
} = useSettingsPendingChanges({
  snapshot: initialLayoutConfig,
  current: () => layoutStore.layoutConfig,
  ready: () => layoutStore.isConfigLoaded,
})

const { saving, onSave } = useSettingsSave()

// 保存：调用 onSave 成功后刷新快照与全局待保存镜像
async function handleSave() {
  const ok = await onSave()
  if (ok) {
    takeSnapshot(layoutStore.layoutConfig)
    syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
  }
  return ok
}

// 取消：确认后回滚到基线快照
async function handleCancel() {
  await confirmAndRevert(chrome, (baseline) => {
    Object.assign(layoutStore.layoutConfig, baseline)
  })
}

// 配置加载完成后取初始快照
watch(
  () => layoutStore.isConfigLoaded,
  (loaded) => {
    if (loaded && !initialLayoutConfig.value) {
      takeSnapshot(layoutStore.layoutConfig)
    }
  },
  { immediate: true },
)

// 子导航区段配置
const generalSubnavSections = computed(() => {
  return [
    { id: 'brand', label: '站点品牌', emoji: '🎨' },
    { id: 'theme', label: '中控主题', emoji: '◈' },
    { id: 'nav', label: '导航标签', emoji: '🧭' },
    { id: 'weather-effects', label: '天气特效', emoji: '🌦️' },
    { id: 'rendering', label: '高级渲染', emoji: '🖥️' },
    { id: 'runtime', label: '性能调试', emoji: '⚡' },
    { id: 'whole-home-off', label: '全屋关闭', emoji: '🔌' },
  ]
})

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

// 毛玻璃效果与性能模式变化时重新应用
watch(
  () => [layoutConfig.value.glassEffect, layoutConfig.value.performanceMode],
  () =>
    applyGlassEffectDocument(layoutConfig.value.glassEffect, layoutConfig.value.performanceMode),
  { immediate: true },
)

// 性能模式按钮样式（高亮当前模式）
function perfBtnClass(mode) {
  const active = (layoutConfig.value.performanceMode || 'high') === mode
  return ['settings-choice-btn', active && 'settings-choice-btn--active']
}

// 设置性能模式并标记用户已手动设置
function setPerformanceMode(mode) {
  layoutConfig.value.performanceMode = mode
  markPerformanceModeUserSet()
}

// 跳转到高级参数 Tab（可选指定 section）
function goParamsTab(section) {
  router.push({
    path: '/settings',
    query: section ? { tab: 'params', section } : { tab: 'params' },
  })
}

// 安全登出：确认后登出并跳转登录页
async function onLogout() {
  const confirmed = await chrome.confirm('确定要安全登出退出当前智控终端吗？', '安全登出')
  if (confirmed) {
    await authStore.logout()
    router.push('/login')
  }
}
</script>

<style src="./styles/settings-general-panel.css"></style>

<style scoped>
.general-theme-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:16px; }
.general-theme-choice { display:flex; align-items:center; gap:12px; padding:12px; border-radius:14px; border:1px solid var(--hos-border-subtle); background:var(--hos-surface-1); color:var(--hos-text-primary); text-align:left; cursor:pointer; box-shadow:inset 0 1px 0 rgba(255,255,255,.08); }
.general-theme-choice--active { border-color:rgba(249,115,22,.55); box-shadow:0 0 0 1px rgba(249,115,22,.22), inset 0 1px 0 rgba(255,255,255,.16); }
.general-theme-choice strong,.general-theme-choice small { display:block; }
.general-theme-choice small { margin-top:3px; color:var(--hos-text-tertiary); font-size:11px; }
.general-theme-swatch { width:32px; height:32px; border-radius:10px; flex:none; box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 0 0 1px rgba(249,115,22,.22); }
.general-theme-swatch--amber { background:linear-gradient(135deg,#f97316,#451a03); }
.general-theme-swatch--navy { background:linear-gradient(135deg,#60a5fa,#0f172a); }
@media (max-width:639px) { .general-theme-grid { grid-template-columns:1fr; } }
</style>