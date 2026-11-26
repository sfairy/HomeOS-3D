/** - itemGap：行间距计入步长（stride = itemHeight + itemGap），避免滚到底部高度抖动； */
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
    <template v-else>
      <div
        v-for="(data, index) in items"
        :key="getKey(data, index)"
        class="virtual-list__item virtual-list__item--static"
      >
        <slot :item="data" :index="index" />
      </div>
    </template>
    <slot v-if="!items.length" name="empty" />
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, onBeforeUnmount, ref, shallowRef, watch, type PropType } from 'vue'

const props = defineProps({
  /** 全部条目列表 */
  items: { type: Array as PropType<T[]>, default: () => [] },
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
  itemKey: { type: Function as PropType<((item: T, index: number) => PropertyKey) | null>, default: null },
})

// 虚拟步长：行高 + 行间距，作为每行占位高度
const stride = computed(() => props.itemHeight + props.itemGap)
// 是否启用虚拟滚动：条目数超过阈值时启用
const isVirtual = computed(() => props.items.length > props.virtualThreshold)

// 定高虚拟滚动：只渲染视口内的行（上下各多 overscan 行），外层用 marginTop + height 撑出滚动高度
const containerRef = shallowRef<HTMLElement | null>(null)
const range = ref({ start: 0, end: 0 })

function calculateRange() {
  const el = containerRef.value
  if (!el) return
  const offset = Math.floor(el.scrollTop / stride.value)
  const capacity = Math.ceil(el.clientHeight / stride.value)
  range.value = {
    start: Math.max(0, offset - props.overscan),
    end: Math.min(props.items.length, offset + capacity + props.overscan),
  }
}

const list = computed(() =>
  props.items.slice(range.value.start, range.value.end).map((data, i) => ({ data, index: range.value.start + i })),
)

const containerProps = { ref: containerRef, onScroll: calculateRange, style: { overflowY: 'auto' } }

const wrapperProps = computed(() => {
  const offsetTop = range.value.start * stride.value
  return {
    style: {
      width: '100%',
      height: `${props.items.length * stride.value - offsetTop}px`,
      marginTop: `${offsetTop}px`,
    },
  }
})

let resizeObserver: ResizeObserver | null = null
watch(containerRef, (el) => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!el) return
  resizeObserver = new ResizeObserver(calculateRange)
  resizeObserver.observe(el)
  calculateRange()
})
watch(() => [props.items, stride.value, props.overscan], calculateRange)
onBeforeUnmount(() => resizeObserver?.disconnect())

// 静态模式下不附加额外 class，避免与虚拟模式的 containerProps 冲突
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
function getKey(data: T, index: number): PropertyKey {
  if (props.itemKey) return props.itemKey(data, index)
  return data && typeof data === 'object' && 'entity_id' in data ? (data.entity_id as PropertyKey) : index
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