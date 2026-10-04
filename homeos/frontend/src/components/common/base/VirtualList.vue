/**
 * @file VirtualList.vue
 * @module components/common/base
 * @description 固定行高虚拟列表组件，基于 @vueuse/core 的 useVirtualList 实现。
 *  - itemGap：行间距计入步长（stride = itemHeight + itemGap），避免滚到底部高度抖动；
 *  - virtualThreshold：条目数不超过该值时全量渲染，规避小列表固定行高误差导致的底部闪烁。
 *  依赖：vue（toRef/computed）、@vueuse/core useVirtualList。
 */
<template>
  <div
    v-bind="isVirtual ? containerProps : staticContainerProps"
    :class="[
      'virtual-list',
      isVirtual ? 'virtual-list--virtual' : 'virtual-list--static',
      containerClass,
    ]"
    :style="rootStyle"
  >
    <!-- 虚拟模式：使用 useVirtualList 提供的 wrapper 与 list -->
    <template v-if="isVirtual">
      <div v-bind="wrapperProps">
        <div
          v-for="{ data, index } in list"
          :key="getKey(data, index)"
          class="virtual-list__stride"
          :style="{ height: `${stride}px` }"
        >
          <div class="virtual-list__item" :style="{ height: `${itemHeight}px` }">
            <slot :item="data" :index="index" />
          </div>
        </div>
      </div>
    </template>
    <!-- 静态模式：直接渲染全部条目，适用于少量数据 -->
    <template v-else>
      <div
        v-for="(data, index) in items"
        :key="getKey(data, index)"
        class="virtual-list__item virtual-list__item--static"
      >
        <slot :item="data" :index="index" />
      </div>
    </template>
    <!-- 空数据时展示 empty 插槽 -->
    <slot v-if="!items.length" name="empty" />
  </div>
</template>

<script setup>
/**
 * 职责：实现 VirtualList 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { toRef, computed } from 'vue'
import { useVirtualList } from '@vueuse/core'

const props = defineProps({
  /** 全部条目列表 */
  items: { type: Array, default: () => [] },
  /** 单行高度（像素） */
  itemHeight: { type: Number, default: 56 },
  /** 行间距（px），虚拟步长 = itemHeight + itemGap */
  itemGap: { type: Number, default: 0 },
  /** 预渲染行数（视口外上下各渲染的行数） */
  overscan: { type: Number, default: 8 },
  /** 容器自定义类名 */
  containerClass: { type: String, default: '' },
  /** 条目数不超过该值时直接渲染全部，避免固定行高误差导致底部闪烁 */
  virtualThreshold: { type: Number, default: 80 },
  /** 自定义 key 生成函数；不传时优先使用 entity_id，否则用 index */
  itemKey: { type: Function, default: null },
})

const itemsRef = toRef(props, 'items')
// 虚拟步长：行高 + 行间距，作为每行占位高度
const stride = computed(() => props.itemHeight + props.itemGap)
// 是否启用虚拟滚动：条目数超过阈值时启用
const isVirtual = computed(() => props.items.length > props.virtualThreshold)

const { list, containerProps, wrapperProps } = useVirtualList(itemsRef, {
  itemHeight: props.itemHeight + props.itemGap,
  overscan: props.overscan,
})

// 静态模式下不附加额外 class，避免与 useVirtualList 的 containerProps 冲突
const staticContainerProps = { class: '' }

// 根样式：虚拟模式 gap 为 0（间距已计入 stride），静态模式用 CSS gap 控制行间距
const rootStyle = computed(() => {
  if (isVirtual.value) return { gap: 0 }
  return props.itemGap > 0 ? { gap: `${props.itemGap}px` } : undefined
})

/**
 * 生成条目 key：优先使用自定义函数，其次取 entity_id，最后回退到 index。
 * @param data 条目数据
 * @param index 条目索引
 * @returns key 值
 */
function getKey(data, index) {
  if (props.itemKey) return props.itemKey(data, index)
  return data && typeof data === 'object' && 'entity_id' in data ? data.entity_id : index
}
</script>

<style scoped>
.virtual-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.virtual-list--static {
  display: flex;
  flex-direction: column;
}

.virtual-list--virtual {
  display: block;
}

.virtual-list__stride {
  box-sizing: border-box;
  overflow: hidden;
}

.virtual-list__item {
  box-sizing: border-box;
  overflow: hidden;
}

.virtual-list__item--static {
  flex-shrink: 0;
}
</style>