<!--
组件：RegistryDegradedGuide.vue
所属模块：frontend / src / views / settings / shared
职责：注册中心降级引导。在设置注册中心异常时展示原因与刷新按钮，并引导跳转至高级参数配置。
Props：
  - reason：降级原因文案
  - refreshing：是否正在刷新
关键依赖：
  - AlertTriangle：警示图标
  - RouterLink / SETTINGS_ROUTES：跳转路由
数据来源：父级透传的 reason / refreshing
-->
<template>
  <div class="registry-degraded-guide settings-deploy-note settings-deploy-note--amber !mt-4">
    <div class="settings-deploy-note__icon">
      <AlertTriangle class="w-4 h-4" />
    </div>
    <div class="settings-deploy-note__body space-y-2">
      <p class="settings-deploy-note__title">{{ 'HA 区域注册表不可用' }}</p>
      <p class="settings-deploy-note__text">
        {{ reason || 'HomeOS 已回退到实体属性中的 area_id，房间列表可能不完整。' }}
      </p>
      <ol class="list-decimal list-inside text-[12px] rd-text-tertiary space-y-1">
        <li>{{ '确认 Home Assistant 版本 ≥ 2024.2，且 area_registry 集成正常' }}</li>
        <li>
          <RouterLink :to="SETTINGS_ROUTES.connection()" class="rd-text-warn underline">{{
            '设置 → HA 连接'
          }}</RouterLink>
          {{ ' → 测试连接 → 重新同步实体' }}
        </li>
        <li>{{ '在 HA「设置 → 区域与楼层」中维护房间，同步后点击本页「同步 HA 区域」' }}</li>
        <li>{{ '若仍降级，可继续在下方手动为各区域绑定传感器（使用实体属性中的 area_id）' }}</li>
      </ol>
      <button
        type="button"
        class="settings-btn-ghost text-xs"
        :disabled="refreshing"
        @click="$emit('retry')"
      >
        {{ refreshing ? '同步中…' : '重试同步区域' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { AlertTriangle } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

defineProps({
  reason: { type: String, default: '' },
  refreshing: { type: Boolean, default: false },
})

defineEmits(['retry'])
</script>

<style scoped src="./styles/RegistryDegradedGuide.css"></style>
