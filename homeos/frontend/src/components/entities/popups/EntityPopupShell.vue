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

<script setup>
import { computed } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import AnchoredPopupShell from '@/components/entities/popups/AnchoredPopupShell.vue'
import { useEntityPopupAnchor } from '@/composables/entity/useEntityPopupAnchor'
import { entityDomainColor } from '@/shared/constants/entity-domain-meta'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { hexToRgbChannels } from '@/shared/utils/ui/color.util'

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
    '--accent': accent,
    '--accent-rgb': props.accentRgb || hexToRgbChannels(accent),
  }
})

defineExpose({ useAnchor, anchorStyle, popupClass })
</script>

<style>
@import '@/assets/styles/popup-base.css';
@import '@/assets/styles/popup-entities.css';
</style>
