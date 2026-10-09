<!--
组件：SettingsAssetsPanel.vue
所属模块：frontend / src / views / settings / display
职责：素材库面板。管理背景图 / 状态图标两类素材，并提供仪表盘开灯/关灯
      背景图配置（手动填写路径或从背景图库拾取）。
关键依赖：
  - SettingsPageShell / SettingsCard / SettingsCardIntro：页面骨架
  - SettingsFlowBand / SettingsFlowStat：流程概览
  - AssetManagerModal / AssetPickerModal：素材管理与拾取弹窗（懒加载）
数据来源：layoutStore.layoutConfig（lightOn/OffBackgroundUrl 等背景字段）
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="assets"
    icon-key="image"
    accent="var(--module-accent-layout)"
    layout="single"
    page-class="assets-hub-page"
    body-class="assets-hub-page__body"
  >

    <div class="settings-hub-section assets-hub">
      <SettingsFlowBand
        :steps="assetsFlowSteps"
        class="assets-flow-band"
        band-class="assets-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="素材流程"
        :collapsed-summary="flowCollapsedSummary"
      >
        <template #stats>
          <SettingsFlowStat label="素材库" value="2 类" tone="sky" val-tone="sky" />
          <SettingsFlowStat
            :label="'布局变更'"
            :value="pending ? '待保存' : '已同步'"
            :tone="pending ? 'amber' : 'emerald'"
            :val-tone="pending ? 'amber' : 'emerald'"
          />
        </template>
      </SettingsFlowBand>

      <SettingsCard full static>
        <SettingsCardIntro
          :icon="SunMoon"
          icon-class="ah-icon-amber"
          orb-class="ah-orb-amber"
          title="仪表盘背景图"
          description="按开灯 / 关灯状态切换大屏氛围；从背景图库拾取或手动填写路径"
        >
          <template #actions>
            <button
              type="button"
              class="assets-launcher__cta assets-launcher__cta--amber"
              @click="backgroundModalOpen = true"
            >
              <FolderOpen class="w-4 h-4" />
              <span>管理背景库</span>
              <ChevronRight class="w-4 h-4 assets-launcher__arrow" />
            </button>
          </template>
        </SettingsCardIntro>

        <div class="assets-bg-settings">
          <div
            v-for="slot in bgSlots"
            :key="slot.key"
            class="assets-bg-slot"
            :class="`assets-bg-slot--${slot.key}`"
          >
            <div class="assets-bg-slot__preview" aria-hidden="true">
              <img
                v-if="slot.url"
                :src="slot.url"
                alt=""
                class="assets-bg-slot__img"
                @error="onBgPreviewError(slot.key)"
              />
              <component :is="slot.icon" v-else class="assets-bg-slot__placeholder" />
            </div>
            <div class="assets-bg-slot__body">
              <label class="settings-form-label">{{ slot.label }}</label>
              <div class="relative mt-1">
                <input
                  v-model="layoutConfig[slot.model]"
                  type="text"
                  class="settings-field font-mono text-xs pr-10"
                  :placeholder="slot.placeholder"
                />
                <button
                  type="button"
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center lf-asset-pick-btn rounded-md transition-all"
                  :title="`从背景图库拾取${slot.label}`"
                  :aria-label="`从背景图库拾取${slot.label}`"
                  @click="openBgPick(slot.key)"
                >
                  <Search class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </SettingsCard>

      <div class="assets-lib-grid">
        <button
          v-for="lib in libraries"
          :key="lib.id"
          type="button"
          class="assets-lib-card"
          :class="`assets-lib-card--${lib.tone}`"
          @click="openLibrary(lib.id)"
        >
          <div class="assets-lib-card__orb" :class="lib.orbClass">
            <component :is="lib.icon" class="w-5 h-5" :class="lib.iconClass" />
          </div>
          <div class="assets-lib-card__text">
            <span class="assets-lib-card__eyebrow">{{ lib.eyebrow }}</span>
            <span class="assets-lib-card__title">{{ lib.title }}</span>
            <span class="assets-lib-card__desc">{{ lib.description }}</span>
          </div>
          <span class="assets-lib-card__cta" :class="`assets-launcher__cta--${lib.tone}`">
            打开
            <ChevronRight class="w-3.5 h-3.5" />
          </span>
        </button>
      </div>

      <AssetManagerModal
        :is-open="backgroundModalOpen"
        type="background"
        title="背景图素材库"
        description="浏览、上传与管理仪表盘开/关灯背景图"
        @close="backgroundModalOpen = false"
      />

      <AssetManagerModal
        :is-open="iconModalOpen"
        type="icon"
        title="状态图标素材库"
        description="浏览、上传与管理 SVG 状态图标"
        @close="iconModalOpen = false"
      />

      <AssetPickerModal
        :is-open="bgPickerOpen"
        type="background"
        @close="bgPickerOpen = false"
        @select="onSelectBgAsset"
      />
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import {
  Sparkles,
  ChevronRight,
  FolderOpen,
  Upload,
  Layout,
  Monitor,
  SunMoon,
  Search,
  Lightbulb,
  Moon,
} from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { storeToRefs } from 'pinia'

const AssetManagerModal = defineAsyncComponent(
  () => import('@/components/common/AssetManagerModal.vue'),
)
const AssetPickerModal = defineAsyncComponent(
  () => import('@/components/common/AssetPickerModal.vue'),
)

defineProps({ activeTab: { type: String, default: 'assets' } })

const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const { layoutConfig } = storeToRefs(layoutStore)

// 布局是否有未保存更改：与侧栏全局保存/取消共用 layoutDirty 标记
const pending = computed(() => layoutStore.layoutDirty)

// 两类素材管理弹窗的开关状态
const backgroundModalOpen = ref(false)
const iconModalOpen = ref(false)
// 背景图拾取弹窗开关
const bgPickerOpen = ref(false)
/** @type {import('vue').Ref<'on' | 'off' | null>} */
const pickingBgSlot = ref(null)

/** 预览加载失败的槽位，避免坏图反复请求 */
const bgPreviewBroken = ref(/** @type {Set<'on' | 'off'>} */ (new Set()))

// 素材库卡片配置（id / tone / icon / 文案）
const libraries = [
  {
    id: 'background',
    tone: 'amber',
    icon: SunMoon,
    iconClass: 'ah-icon-amber',
    orbClass: 'ah-orb-amber',
    eyebrow: '大屏氛围',
    title: '背景图',
    description: '开灯 / 关灯切换',
  },
  {
    id: 'icon',
    tone: 'violet',
    icon: Sparkles,
    iconClass: 'ah-icon-accent',
    orbClass: 'ah-orb-accent',
    eyebrow: '热点 / 微件',
    title: '状态图标',
    description: 'SVG 状态资源',
  },
]

const bgSlots = computed(() => {
  const onUrl = String(layoutConfig.value.lightOnBackgroundUrl || '').trim()
  const offUrl = String(layoutConfig.value.lightOffBackgroundUrl || '').trim()
  return [
    {
      key: 'on',
      label: '开灯背景',
      model: 'lightOnBackgroundUrl',
      placeholder: '/backgrounds/light_on.png',
      icon: Lightbulb,
      url: onUrl && !bgPreviewBroken.value.has('on') ? onUrl : '',
    },
    {
      key: 'off',
      label: '关灯背景',
      model: 'lightOffBackgroundUrl',
      placeholder: '/backgrounds/light_off.png',
      icon: Moon,
      url: offUrl && !bgPreviewBroken.value.has('off') ? offUrl : '',
    },
  ]
})

const flowCollapsedSummary = computed(() =>
  pending.value ? '2 类素材 · 有未保存布局' : '2 类素材 · 布局已同步',
)

// 开/关灯背景 URL 变化时重置坏图标记
watch(
  () => [layoutConfig.value.lightOnBackgroundUrl, layoutConfig.value.lightOffBackgroundUrl],
  () => {
    bgPreviewBroken.value = new Set()
  },
)

// 打开对应素材库弹窗
function openLibrary(id) {
  if (id === 'background') backgroundModalOpen.value = true
  else if (id === 'icon') iconModalOpen.value = true
}

// 打开背景图拾取弹窗，记录当前拾取的槽位
function openBgPick(slot) {
  pickingBgSlot.value = slot
  bgPickerOpen.value = true
}

// 拾取背景图后回填到对应槽位并提示
function onSelectBgAsset(url) {
  if (pickingBgSlot.value === 'on') {
    layoutConfig.value.lightOnBackgroundUrl = url
  } else if (pickingBgSlot.value === 'off') {
    layoutConfig.value.lightOffBackgroundUrl = url
  }
  chrome.notify('路径已自动填入', 'success')
  bgPickerOpen.value = false
  pickingBgSlot.value = null
}

/** @param {'on' | 'off'} key */
function onBgPreviewError(key) {
  const next = new Set(bgPreviewBroken.value)
  next.add(key)
  bgPreviewBroken.value = next
}

// 素材流程概览步骤：上传 → 整理 → 引用 → 呈现
const assetsFlowSteps = [
  { label: '上传', meta: '素材入库', icon: Upload, tone: 'in' },
  { label: '整理', meta: '分类目录', icon: FolderOpen, tone: 'sky' },
  { label: '引用', meta: '布局配置', icon: Layout, tone: 'exec' },
  { label: '呈现', meta: '大屏 / 平板', icon: Monitor, tone: 'out' },
]

</script>

<style>
.assets-hub-page {
  --page-accent-rgb: var(--module-accent-layout-rgb);
  --page-accent-secondary: var(--module-accent-layout-sub);
  --page-accent-secondary-rgb: var(--module-accent-layout-sub-rgb);
}
</style>
<style scoped src="./styles/layout-panels.css"></style>
<style scoped>
.assets-bg-settings {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 14px;
}

@media (min-width: 768px) {
  .assets-bg-settings {
    grid-template-columns: 1fr 1fr;
  }
}

.assets-bg-slot {
  display: flex;
  gap: 12px;
  align-items: stretch;
  padding: 10px;
  border-radius: var(--hos-radius-card);
  background: rgba(255, 255, 255, 0.025);
  border: var(--hos-hairline) solid rgba(251, 191, 36, 0.14);
}

.assets-bg-slot__preview {
  width: 72px;
  min-height: 56px;
  flex-shrink: 0;
  border-radius: var(--hos-radius-card);
  overflow: hidden;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.28);
  border: var(--hos-hairline) solid rgba(255, 255, 255, 0.06);
}

.assets-bg-slot__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.assets-bg-slot__placeholder {
  width: 22px;
  height: 22px;
  color: rgba(251, 191, 36, 0.55);
}

.assets-bg-slot__body {
  flex: 1;
  min-width: 0;
}

.lf-asset-pick-btn {
  background: rgba(251, 191, 36, 0.85);
  color: #111827;
}

.lf-asset-pick-btn:hover {
  background: #fbbf24;
}

.assets-lib-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 720px) {
  .assets-lib-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.assets-lib-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 14px 14px 14px 12px;
  border-radius: var(--hos-radius-card, 14px);
  text-align: left;
  cursor: pointer;
  background: var(--set-card-surface-bg, rgba(255, 255, 255, 0.03));
  border: var(--hos-hairline) solid var(--set-card-surface-border, var(--set-border-subtle));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.assets-lib-card:hover {
  background: rgba(255, 255, 255, 0.045);
  transform: translateY(-1px);
}

.assets-lib-card:focus-visible {
  outline: 2px solid var(--page-accent-text);
  outline-offset: 2px;
}

.assets-lib-card--sky {
  border-color: rgba(56, 189, 248, 0.18);
}
.assets-lib-card--amber {
  border-color: rgba(251, 191, 36, 0.2);
}
.assets-lib-card--emerald {
  border-color: rgba(52, 211, 153, 0.2);
}
.assets-lib-card--violet {
  border-color: rgba(var(--page-accent-rgb, 126, 184, 255), 0.22);
}

.assets-lib-card__orb {
  width: 42px;
  height: 42px;
  border-radius: var(--hos-radius-card);
  display: grid;
  place-items: center;
}

.assets-lib-card__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.assets-lib-card__eyebrow {
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--set-text-muted, rgba(255, 255, 255, 0.5));
}

.assets-lib-card__title {
  font-size: var(--premium-fs-body);
  font-weight: 700;
  color: var(--set-text-primary, #fff);
}

.assets-lib-card__desc {
  font-size: var(--premium-fs-micro);
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.assets-lib-card__cta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border-radius: var(--hos-radius-pill);
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  border: var(--hos-hairline) solid transparent;
}

.assets-lib-card:hover .assets-lib-card__cta {
  transform: translateX(1px);
}
</style>
