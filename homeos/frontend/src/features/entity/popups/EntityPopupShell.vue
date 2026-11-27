/** * 实体弹窗通用外壳 * 基于 AnchoredPopupShell 封装锚点定位、强调色与滑动关闭 */
<template>
  <AnchoredPopupShell
    v-if="entity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="width"
    :height="height"
    :inner-class="innerClasses"
    close-class="popup-close-btn"
    inner-swipe-close
    pointer-on-inner
    :inner-style="shellStyle"
    :aria-label="entityAriaLabel"
    @close="$emit('close')"
  >
    <slot />
  </AnchoredPopupShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import AnchoredPopupShell from '@/features/entity/popups/AnchoredPopupShell.vue'
import { useEntityPopupAnchor } from '@/domain/entity/popup/use-entity-popup-anchor'
import { entityDomainColor } from '@/kernel/index'
import { getEntityDisplayName } from '@/domain/entity/derived'
import { hexToRgbChannels } from '@/kernel/ui/color'

const props = defineProps({
  entity: { type: Object, default: null },
  xPct: { type: [Number, String], default: 50 },
  yPct: { type: [Number, String], default: 50 },
  anchorX: { type: Number, default: null },
  anchorY: { type: Number, default: null },
  width: { type: Number, default: 320 },
  height: { type: Number, default: 300 },
  accent: { type: String, default: '' },
  accentRgb: { type: String, default: '' },
  shellClass: { type: String, default: '' },
})

defineEmits(['close'])

const { useAnchor, anchorStyle, popupClass } = useEntityPopupAnchor(
  props,
  () => props.width,
  () => props.height,
)

const entityAriaLabel = computed(() => {
  const entity = props.entity
  const entityId = entity?.entity_id || ''
  const name = getEntityDisplayName(entityId, entity) || entityId
  return name ? String(name) : '实体控制'
})

const innerClasses = computed(() => {
  const classes = ['popup-shell']
  if (props.shellClass) classes.push(props.shellClass)
  return classes
})

const shellStyle = computed(() => {
  const domain = getEntityDomain(props.entity?.entity_id)
  const accent = props.accent || entityDomainColor(domain)
  return {
    width: `${props.width}px`,
    '--hos-color-accent': accent,
    '--hos-color-accent-rgb': props.accentRgb || hexToRgbChannels(accent),
  }
})

defineExpose({ useAnchor, anchorStyle, popupClass })
</script>

<style>
@import '@/kernel/ui/popup-base.css';
@import '@/app/popup-entities.css';
</style>
