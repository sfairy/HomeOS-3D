<!--
  仪表盘创作入口区段。总览首页已改为「只读 3D 展示」，编辑与户型图绘制
  不再出现在总览，统一从这里（管理员后台设置 → 布局）进入。
  两张入口卡：仪表盘编辑器（页面/控件/实体绑定）与 3D 户型图绘制。
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard full static>
      <SettingsFlowBand
        :steps="layoutEditFlowSteps"
        class="layout-edit-flow-band"
        band-class="layout-edit-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="创作流程"
        :collapsed-summary="layoutEditFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'总览'"
            :value="'只读展示'"
            tone="secondary"
            val-tone="secondary"
          />
        </template>
      </SettingsFlowBand>

      <div class="layout-edit-hero">
        <div class="layout-edit-hero__mesh" aria-hidden="true" />
        <div class="layout-edit-hero__glow" aria-hidden="true" />
        <div class="layout-edit-hero__body">
          <div class="layout-edit-hero__info">
            <div class="layout-edit-hero__badge">
              <span class="layout-edit-hero__badge-dot" />
              EDITOR
            </div>
            <div class="min-w-0">
              <p class="layout-edit-hero__title">仪表盘编辑器</p>
              <p class="layout-edit-hero__hint">
                编辑页面、控件、主题与实体绑定；保存后总览首页立即生效
              </p>
            </div>
          </div>
          <button
            type="button"
            class="layout-edit-hero__cta"
            @click.stop="openDashboardEditor"
          >
            <PenLine class="w-4 h-4" />
            {{ '打开编辑器' }}
          </button>
        </div>
      </div>

      <div class="layout-edit-hero layout-edit-hero--studio">
        <div class="layout-edit-hero__mesh" aria-hidden="true" />
        <div class="layout-edit-hero__glow" aria-hidden="true" />
        <div class="layout-edit-hero__body">
          <div class="layout-edit-hero__info">
            <div class="layout-edit-hero__badge layout-edit-hero__badge--studio">
              <span class="layout-edit-hero__badge-dot" />
              DRAW
            </div>
            <div class="min-w-0">
              <p class="layout-edit-hero__title">3D 户型图绘制</p>
              <p class="layout-edit-hero__hint">
                绘制户型、家具、灯光与灯组，并生成三维视角与设备热区
              </p>
            </div>
          </div>
          <button
            type="button"
            class="layout-edit-hero__cta layout-edit-hero__cta--studio"
            @click.stop="openFloorplanStudio"
          >
            <Shapes class="w-4 h-4" />
            {{ '打开绘制工具' }}
          </button>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { PenLine, Shapes, ToggleRight, PencilRuler, CloudUpload } from '@lucide/vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { logger } from '@/shared/utils/core/logger'

const router = useRouter()
const chrome = useChromeStore()

/**
 * 跳创作面路由，并把「静默失败」变成可见反馈。
 *
 * 这两条路由都是懒加载的一次性重包：导航失败有多种不报错的形态 ——
 * 守卫 `return false` 中止（`router.push` 不 reject，只 resolve 一个 failure 对象）、
 * 动态 import 失败且自动刷新预算已用尽（`lazyView` 直接抛错）、构建产物换 hash 后旧页面
 * 取不到 chunk。三者对用户都表现为「点了没反应」，所以这里显式记日志并给提示条，
 * 免得把「加载失败」误判成「按钮坏了」。
 */
async function navigateTo(path, label) {
  logger.warn(`[布局入口] 打开${label}`, path)
  try {
    const failure = await router.push(path)
    if (!failure) return
    logger.warn(`[布局入口] 打开${label}被路由拦截`, failure)
    chrome.notify(`${label}未能打开，请刷新页面后重试`, 'warning')
  } catch (error) {
    logger.warn(`[布局入口] 打开${label}失败`, error)
    chrome.notify(`${label}加载失败，请刷新页面后重试`, 'error')
  }
}

/** 打开仪表盘编辑器（管理员专属路由，守卫层二次校验角色）。 */
function openDashboardEditor() {
  void navigateTo('/studio/editor', '仪表盘编辑器')
}

/** 打开 3D 户型图绘制工具（管理员专属路由）。 */
function openFloorplanStudio() {
  void navigateTo('/3d-studio', '3D 户型图绘制')
}

// 创作流程步骤：进入编辑器 → 编辑 / 绘制 → 保存后总览展示
const layoutEditFlowSteps = computed(() => [
  {
    label: '进入编辑器',
    meta: '仅管理员',
    icon: ToggleRight,
    tone: 'in',
  },
  {
    label: '编辑 / 绘制',
    meta: '页面 · 控件 · 户型图',
    icon: PencilRuler,
    tone: 'sky',
  },
  {
    label: '保存并展示',
    meta: '总览只读渲染',
    icon: CloudUpload,
    tone: 'out',
  },
])

// 创作流程折叠态摘要文案
const layoutEditFlowSummary = computed(() => '管理员入口 · 编辑与绘制均在此进入')
</script>

<style scoped src="./styles/settings-layout-edit-section.css"></style>
