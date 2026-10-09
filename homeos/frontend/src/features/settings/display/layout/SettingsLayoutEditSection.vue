<!--
组件：SettingsLayoutEditSection.vue
所属模块：frontend / src / views / settings / display / layout
职责：仪表盘创作入口区段。总览首页已改为「只读 3D 展示」，编辑与户型图绘制
      不再出现在总览，统一从这里（管理员后台设置 → 布局）进入。
      两张入口卡：仪表盘编辑器（页面/控件/实体绑定）与 3D 户型图绘制。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
数据来源：无（纯入口，跳转到 /studio/editor 与 /3d-studio，二者均为 admin-only 路由）
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
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'

const router = useRouter()

/** 打开仪表盘编辑器（管理员专属路由，守卫层二次校验角色）。 */
function openDashboardEditor() {
  router.push('/studio/editor')
}

/** 打开 3D 户型图绘制工具（管理员专属路由）。 */
function openFloorplanStudio() {
  router.push('/3d-studio')
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
