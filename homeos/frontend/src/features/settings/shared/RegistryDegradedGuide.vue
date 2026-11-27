<!--
  注册中心降级引导。在设置注册中心异常时展示原因与刷新按钮，并引导跳转至高级参数配置。
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

<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { SETTINGS_ROUTES } from '@/kernel/registry/settings-route'

defineProps({
  reason: { type: String, default: '' },
  refreshing: { type: Boolean, default: false },
})

defineEmits(['retry'])
</script>

<style scoped>
/* 两条语义色工具类。原先单独放在 registry-degraded-guide.css 由本组件 `<style scoped src>` 引入；
   那 2 条规则只被本组件用（`rd-text-*` 在仓库里没有第二个消费者），8 行的独立文件没有独立存在的理由。
   保持 `scoped` 而不并入全局 settings-utilities.css：scoped 会给节点加 data 属性，
   并入全局等于把作用域放大到全站。 */
.rd-text-tertiary {
  color: var(--hos-fg-3);
}

.rd-text-warn {
  color: var(--hos-color-warning-text);
}
</style>
