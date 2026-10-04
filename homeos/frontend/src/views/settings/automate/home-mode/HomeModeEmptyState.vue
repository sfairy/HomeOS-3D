/**
 * 组件：HomeModeEmptyState.vue
 *
 * 职责：家庭模式「空状态」。无任何模式时展示引导卡片，提供「初始化默认」「新建模式」
 *      入口，并复用右侧预设侧栏供一键安装预设包。
 * 关键依赖：
 *  - HomeModePresetSidebar：预设包侧栏
 * 数据来源：父级透传的 isAdmin / 预设列表 / 安装中状态
 */
<script setup>
/**
 * 职责：渲染 views/HomeModeEmptyState 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Home } from '@lucide/vue'
import HomeModePresetSidebar from './HomeModePresetSidebar.vue'

// 入参：是否管理员（控制初始化入口）、是否展示预设侧栏、预设列表、正在安装的预设 id
defineProps({
  isAdmin: { type: Boolean, default: false },
  showPresetSidebar: { type: Boolean, default: false },
  modePresets: { type: Array, default: () => [] },
  presetInstalling: { type: [String, null], default: null },
})

// 对外事件：初始化默认、新建模式、安装预设
const emit = defineEmits(['seed', 'create', 'install-preset'])
</script>

<template>
  <div class="hm-split flex-1 min-h-0">
    <div class="hm-split__main flex flex-col overflow-y-auto px-6 py-6 gap-6">
      <div class="flex flex-wrap gap-2 justify-end shrink-0">
        <button v-if="isAdmin" type="button" class="hm-toolbar-btn" @click="emit('seed')">
          {{ '初始化默认' }}
        </button>
        <button type="button" class="hm-toolbar-btn hm-toolbar-btn--accent" @click="emit('create')">
          {{ '新建模式' }}
        </button>
      </div>
      <div class="hm-premium-empty hm-premium-empty--indigo">
        <Home class="hm-premium-empty__icon" />
        <p class="hm-premium-empty__title">{{ '暂无家庭模式' }}</p>
        <p class="hm-premium-empty__desc">
          {{ '使用右侧预设包，或点击「初始化默认」「新建模式」' }}
        </p>
        <div class="hm-premium-empty__actions">
          <button v-if="isAdmin" type="button" class="hm-premium-empty__btn" @click="emit('seed')">
            {{ '初始化默认' }}
          </button>
          <button
            type="button"
            class="hm-premium-empty__btn hm-premium-empty__btn--accent"
            @click="emit('create')"
          >
            {{ '新建模式' }}
          </button>
        </div>
      </div>
    </div>
    <HomeModePresetSidebar
      v-if="showPresetSidebar"
      :presets="modePresets"
      :installing="presetInstalling"
      @install="emit('install-preset', $event)"
    />
  </div>
</template>
