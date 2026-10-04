<!--
  组件文件：ChildModeStatusBar.vue
  所属模块：frontend/src/layouts
  组件职责：儿童模式状态顶栏。桌面 MainLayout 的黄色提示条，
    左侧发光状态点 + 受限文案，右侧当家长角色拥有 canOverride=true 时显示「临时解除 30 分钟」按钮。
    本组件为纯展示型，不感知儿童模式业务规则；状态、文案与权限均由父级 props 传入，
    点击 override 按钮后向父组件 emit override 事件触发真实的临时解除流程。
  主要 props / emits：
    - props.text：顶栏展示文案（如「儿童模式已启用，部分功能受限」），由 composable 根据角色/权限计算。
    - props.canOverride：是否允许临时解除（家长/管理员 true，儿童角色 false）。
    - emit override：用户点击「临时解除 30 分钟」按钮时触发，含空 payload。
  依赖关系：无额外外部依赖；纯 scoped CSS 驱动视觉（黄色发光点 + 紫色胶囊按钮）。
-->
<script setup lang="ts">
/**
 * 儿童模式顶栏 — 桌面主布局（MainLayout）使用。
 *
 * 职责：在儿童模式启用时显示一条黄色提示顶栏，告知当前处于受限模式；
 * 当允许临时解除时显示"临时解除 30 分钟"按钮。
 *
 * 复用说明：状态由调用方（useMainLayoutChildMode）解析后通过 props 传入；
 * 组件本身不感知儿童模式业务规则，只负责展示与触发 override 事件。
 */
defineProps<{
  // 顶栏显示的文案（如“儿童模式已启用，部分功能受限”）
  text: string
  // 是否允许当前用户临时解除儿童模式（家长/管理员为 true，儿童角色为 false）
  canOverride: boolean
}>()

const emit = defineEmits<{
  // 用户点击“临时解除 30 分钟”按钮时触发，由调用方执行实际解除逻辑
  override: []
}>()
</script>

<template>
  <div class="child-mode-bar" role="status">
    <span class="child-mode-bar__dot" />
    <span>{{ text }}</span>
    <button
      v-if="canOverride"
      type="button"
      class="child-mode-bar__override"
      @click="emit('override')"
    >
      临时解除 30 分钟
    </button>
  </div>
</template>

<style scoped>
.child-mode-bar {
  display: flex;
  align-items: center;
  gap: var(--hos-space-sm, 8px);
  min-height: 44px;
  padding: 0 16px;
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  color: rgb(251, 191, 36);
  background: rgba(251, 191, 36, 0.08);
  border-bottom: 1px solid rgba(251, 191, 36, 0.15);
  flex-shrink: 0;
}

.child-mode-bar__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(251, 191, 36);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
}

.child-mode-bar__override {
  margin-left: auto;
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid rgba(167, 139, 250, 0.35);
  background: rgba(139, 92, 246, 0.15);
  color: rgb(196, 181, 253);
  cursor: pointer;
}
</style>

