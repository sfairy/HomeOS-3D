<template>
  <!--
    实体弹窗宿主：通过 Teleport 渲染到 #teleport-target
    仅在 open=true 且 entityId 与 PopupComp 均有效时渲染
    点击遮罩层（非弹窗本体）触发 close 事件
  -->
  <Teleport
    v-if="open && entityId && PopupComp"
    :to="teleportTarget"
    :disabled="teleportDisabled"
  >
    <div class="entity-control-backdrop" @click.self="$emit('close')">
      <!--
        `:key` 按实体区分：公事业弹窗在 setup 里确定能源类别与解析器，实例复用会把
        上一个实体（例如电力）的数据渲染到新实体（例如燃气）的卡片上。
      -->
      <component :is="PopupComp" :key="entityId" v-bind="popupProps" @close="$emit('close')" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/** - 列表/详情页中以居中模态形式承载单个实体的弹窗组件 */
import { computed, provide, watchEffect } from 'vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { resolveEntityPopupComponent } from '@/features/entity/popup-registry'
import { getEntityPopupProps } from '@/domain/entity/utils/popup-registry'
import { useShellTeleportTarget } from '@/kernel/ui/shell/use-shell-teleport-target'

/**
 * 组件 Props 定义
 * @property {string} entityId - 当前需要弹出的实体 ID（如 'light.xxx'），为空时不渲染
 * @property {boolean} open - 是否打开弹窗
 */
const props = defineProps({
  entityId: { type: String, default: '' },
  open: { type: Boolean, default: false },
})

/**
 * 组件事件定义
 * @emits close - 用户关闭弹窗时触发（点击遮罩或弹窗内部 close 事件）
 */
defineEmits(['close'])

const { teleportTarget, shellTeleportPending, refreshShellTeleport } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

/** 列表/详情页居中模态：禁用 AnchoredPopupShell 的二次 Teleport 与锚点偏移 */
provide('entityPopupCentered', true)

// 打开时再探测挂载点（props 已初始化后再 watchEffect，避免 TDZ）
watchEffect(() => {
  if (props.open && props.entityId) refreshShellTeleport()
})

// 实体仓库，用于查询实体与解析弹窗组件
const entitiesStore = useEntitiesStore()

/**
 * 根据当前 entityId 解析需要渲染的弹窗组件
 * @returns {Object|null} 弹窗组件对象；entityId 为空时返回 null
 */
const PopupComp = computed(() => {
  if (!props.entityId) return null
  return resolveEntityPopupComponent(props.entityId)
})

/**
 * 根据当前 entityId 构造弹窗组件所需的 props
 * 内部通过 entitiesStore.getEntity(id) 提供按 ID 查询实体的回调
 * @returns {Object} 弹窗 props 对象；entityId 为空时返回空对象
 */
const popupProps = computed(() => {
  if (!props.entityId) return {}
  return getEntityPopupProps(props.entityId, (id) => entitiesStore.getEntity(id))
})
</script>

<style scoped src="./styles/entity-modals.css"></style>