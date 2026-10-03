<template>
  <!-- LinkageHubCard 联动中心卡片：展示联动相关的卡片式信息 -->
  <article
    class="linkage-hub-card interactive-press"
    :data-orch-item-id="item.id"
    :class="{
      'linkage-hub-card--success': successPulse,
      'linkage-hub-card--locate': highlighted,
    }"
  >
    <div class="linkage-hub-card__head">
      <div class="linkage-hub-card__icon" aria-hidden="true">
        <component :is="icon" class="w-4 h-4" />
      </div>
      <div class="linkage-hub-card__meta">
        <span class="linkage-hub-card__name" :title="item.name">{{ item.name }}</span>
        <div class="linkage-hub-card__badges">
          <OrchestratorItemBadges
            v-if="kind !== 'template'"
            :item="item"
            :sync-status-map="syncStatusMap"
            :show-enabled="showEnabled"
            ha-label="HA"
            :show-local="true"
          />
          <span v-if="hasGeekGraph" class="linkage-hub-card__geek-badge">{{
            '图'
          }}</span>
          <template v-else-if="kind === 'template'">
            <span class="list-page__tag linkage-hub-card__type" :title="resolvedTypeLabel">{{
              resolvedTypeShortLabel
            }}</span>
            <span
              v-if="item.stubYaml || item.needsAttention"
              class="list-page__tag list-page__tag--warn"
              >{{ item.stubYaml ? '需补全' : '片段' }}</span
            >
            <span
              v-if="syncStatusMap[item.id]?.drift"
              class="list-page__tag list-page__tag--warn"
              >{{ '漂移' }}</span
            >
            <span v-if="item.yamlSource" class="list-page__tag list-page__tag--muted">{{
              yamlSourceLabel(item.yamlSource)
            }}</span>
          </template>
        </div>
      </div>
    </div>
    <div class="linkage-hub-card__actions">
      <button
        type="button"
        class="list-page__btn list-page__btn--primary linkage-hub-card__primary interactive-press"
        :disabled="actionLoading || (!editOnly && !canAction)"
        :title="editOnly ? primaryLabel : disabledReason || primaryLabel"
        @click="onPrimary"
      >
        <Loader2 v-if="actionLoading" class="w-3.5 h-3.5 animate-spin" />
        {{ actionLoading ? `${primaryLabel}中…` : primaryLabel }}
      </button>
      <button
        ref="moreBtnRef"
        type="button"
        class="linkage-hub-card__more"
        :aria-label="'更多操作'"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        @click.stop="toggleMenu"
      >
        <MoreHorizontal class="w-4 h-4" />
      </button>
    </div>
    <Teleport v-if="menuOpen" :to="menuTeleportTo">
      <div class="linkage-hub-card__menu-portal">
        <div class="linkage-hub-card__menu-backdrop" aria-hidden="true" @click="menuOpen = false" />
        <div
          ref="menuRef"
          class="linkage-hub-card__menu-pop"
          role="menu"
          :style="menuStyle"
          @click.stop
        >
          <button type="button" class="linkage-hub-card__menu-item" role="menuitem" @click="onEdit">
            {{ '编辑' }}
          </button>
          <button
            v-if="showToggle"
            type="button"
            class="linkage-hub-card__menu-item"
            role="menuitem"
            @click="emit('toggle')"
          >
            {{ item.enabled ? '禁用' : '启用' }}
          </button>
          <router-link
            :to="settingsRoute"
            class="linkage-hub-card__menu-item linkage-hub-card__menu-item--link"
            role="menuitem"
            @click="menuOpen = false"
          >
            {{ '在设置中打开' }}
          </router-link>
          <button
            v-if="canDelete"
            type="button"
            class="linkage-hub-card__menu-item linkage-hub-card__menu-item--danger"
            role="menuitem"
            @click="onDelete"
          >
            {{ '删除' }}
          </button>
        </div>
      </div>
    </Teleport>
  </article>
</template>

<script setup>
/**
 * LinkageHubCard - 联动中心卡片组件
 * 功能特性：
 * - 展示联动相关信息
 * - 卡片式布局
 * - 用于联动中心页面
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Sparkles, Zap, FileCode, Boxes, Loader2, MoreHorizontal } from '@lucide/vue'
import OrchestratorItemBadges from '@/components/common/list-page/OrchestratorItemBadges.vue'
import { yamlSourceLabel } from '@/utils/template/entity-context.util'
import { templateEntityTypeLabel } from '@/utils/template/entity-slot-labels.util'
import { inferTemplateEntityType } from '@homeos/shared'
import {
  buildDropdownFixedStyle,
  rectToDropdownPosition,
  viewportPointToPopupAnchor,
  measureDropdownFitWidth,
} from '@/utils/ui/popup-position-dropdown.util'
import { itemHasGeekGraph } from '@/composables/orchestrator/linkage-hub.types'
import { useExclusiveDropdown } from '@/composables/ui/useExclusiveDropdown'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { getTeleportContainerSize } from '@/utils/ui/popup-position-shared.util'

const props = defineProps({
  item: { type: Object, required: true },
  kind: { type: String, default: 'scene' },
  syncStatusMap: { type: Object, default: () => ({}) },
  actionLoading: { type: Boolean, default: false },
  canAction: { type: Boolean, default: true },
  disabledReason: { type: String, default: '' },
  primaryLabel: { type: String, default: '执行' },
  showEnabled: { type: Boolean, default: false },
  showToggle: { type: Boolean, default: false },
  settingsRoute: { type: [String, Object], required: true },
  successPulse: { type: Boolean, default: false },
  highlighted: { type: Boolean, default: false },
  editOnly: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: true },
})

const emit = defineEmits(['primary', 'edit', 'toggle', 'delete'])

const menuOpen = ref(false)
useExclusiveDropdown(menuOpen)
const menuRef = ref(null)
const moreBtnRef = ref(null)
const menuStyle = ref({ visibility: 'hidden' })
const { teleportTarget: menuTeleportTo, refreshShellTeleport } = useShellTeleportTarget()
const MENU_MIN_WIDTH = 120
const MENU_MAX_WIDTH = 240

const iconMap = {
  scene: Sparkles,
  automation: Zap,
  script: FileCode,
  template: Boxes,
}
const icon = computed(() => iconMap[props.kind] || Sparkles)
const hasGeekGraph = computed(() => itemHasGeekGraph(props.item))

/** 占位 stub 被误标为洗衣机等时，按名称/YAML 纠正展示类型 */
const resolvedTypeKey = computed(() => {
  const item = props.item
  let type = String(item?.type || '')
  if (item?.stubYaml || item?.yamlComplete === false || item?.needsAttention) {
    const inferred = inferTemplateEntityType(String(item?.yaml || ''), {
      // 不传 storedType，强制按 YAML/名称重推断，纠正历史误标
      uniqueId: String(item?.haConfigId || item?.uniqueId || ''),
      entName: String(item?.name || ''),
    })
    if (inferred) type = inferred
  }
  return type
})

const resolvedTypeLabel = computed(() => templateEntityTypeLabel(resolvedTypeKey.value))

/** 卡片宽度有限，用短标签；完整名放 title */
const CARD_TYPE_SHORT = {
  trigger_sensor: '⚡ 触发传感器',
  yaml_import: '📄 YAML',
  washing_machine: '👕 洗衣机',
  water_heater: '♨ 热水器',
  air_conditioner: '❄ 空调',
  air_purifier: '🌬 净化器',
  humidifier_ha: '💧 加湿器',
  water_purifier: '💧 净水机',
  water_dispenser: '🚰 管线机',
  robot_vacuum: '🧹 扫地机',
  smart_curtain: '🪟 窗帘',
  smart_lock: '🔐 门锁',
  smart_plug: '🔌 插座',
  range_hood: '🔥 油烟机',
  refrigerator: '🧊 冰箱',
  dishwasher: '🍽 洗碗机',
  dryer: '👖 烘干机',
  microwave: '📡 微波',
  oven: '🍳 烤箱',
  rice_cooker: '🍚 电饭煲',
  ceiling_fan: '🪭 风扇',
  dehumidifier: '💨 除湿',
  fresh_air: '🌿 新风',
  floor_heating: '🔥 地暖',
  tv: '📺 电视',
}

const resolvedTypeShortLabel = computed(
  () => CARD_TYPE_SHORT[resolvedTypeKey.value] || resolvedTypeLabel.value,
)

function toggleMenu() {
  refreshShellTeleport()
  menuOpen.value = !menuOpen.value
}

function updateMenuPosition() {
  const anchor = moreBtnRef.value
  if (!menuOpen.value || !anchor) {
    menuStyle.value = { visibility: 'hidden' }
    return
  }
  const rect = anchor.getBoundingClientRect()
  const itemCount = 2 + (props.showToggle ? 1 : 0) + (props.canDelete ? 1 : 0)
  const estimatedHeight = itemCount * 40 + 12
  const { cw } = getTeleportContainerSize()
  const maxW = Math.min(MENU_MAX_WIDTH, Math.max(MENU_MIN_WIDTH, cw - 16))
  const menuWidth = measureDropdownFitWidth(menuRef.value, {
    minWidth: MENU_MIN_WIDTH,
    maxWidth: maxW,
  })
  const pos = rectToDropdownPosition(rect, 6, menuWidth, {
    estimatedHeight,
    margin: 8,
  })
  const { anchorX: anchorRight } = viewportPointToPopupAnchor(rect.right, rect.top)
  let left = Math.max(8, anchorRight - menuWidth)
  if (left + menuWidth > cw - 8) left = Math.max(8, cw - 8 - menuWidth)
  const baseStyle = buildDropdownFixedStyle({ ...pos, left, width: menuWidth })
  menuStyle.value = {
    ...baseStyle,
    left: `${left}px`,
    width: `${menuWidth}px`,
  }
}

watch(menuOpen, (open) => {
  if (open) {
    nextTick(() => {
      updateMenuPosition()
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(updateMenuPosition)
      }
    })
  }
})

function onPrimary() {
  emit('primary')
}

function onEdit() {
  menuOpen.value = false
  emit('edit')
}

function onDelete() {
  menuOpen.value = false
  emit('delete')
}

function onScrollOrResize() {
  if (menuOpen.value) updateMenuPosition()
}

onMounted(() => {
  window.addEventListener('resize', onScrollOrResize)
  window.addEventListener('scroll', onScrollOrResize, true)
})
onUnmounted(() => {
  window.removeEventListener('resize', onScrollOrResize)
  window.removeEventListener('scroll', onScrollOrResize, true)
})
</script>

<style scoped src="./styles/linkage.css"></style>
