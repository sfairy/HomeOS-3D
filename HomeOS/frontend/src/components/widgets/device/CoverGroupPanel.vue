<!--
  CoverGroupPanel.vue / components/widgets/device
  窗帘/遮盖分组控制：按房间聚合 cover 域设备，支持全开/全关/停止快捷按钮、
  单设备位置滑块百分比与独立 open/close/stop 操作，slider 样式实时跟随百分比。
  Props: 无显式入参；由 useWidgetDeviceGroups('cover.') 推断分组
  依赖：composables: useWidgetDeviceGroups 自动分组
                      + useDeviceGroupRoomLabels 房名本地化；
        Pinia: useEntitiesStore 实时属性（position/state）
              + useChromeStore；
        utils: progress-bar.util sliderTrackStyle 滑块轨道色渐变。
        lucide: ArrowUpFromLine / Square / ArrowDownToLine 图标。
  注意：position 为 null/undefined 时滑块禁用；logger 记录错误但不中断渲染。
-->
<template>
  <div class="cg-root">
    <div class="cg-header">
      <div class="cg-header-left">
        <ArrowUpFromLine
          :class="['w-3.5 h-3.5', totalOpen > 0 ? 'cg-icon-active' : 'cg-icon-idle']"
        />
        <span class="cg-title">{{ '窗帘组' }}</span>
      </div>
      <div class="cg-header-right">
        <span class="cg-summary">{{ `${totalOpen}/${totalCovers} 打开` }}</span>
      </div>
    </div>

    <div class="cg-body">
      <VEmptyState
        v-if="groups.length === 0"
        compact
        tone="neutral"
        icon="🪟"
        :title="'未发现窗帘设备'"
      />

      <template v-else>
        <div class="cg-global">
          <button class="cg-global-btn" :title="'全部打开'" @click="batchAction('open_cover')">
            <ArrowUpFromLine class="w-3.5 h-3.5" />
            <span>{{ '全部打开' }}</span>
          </button>
          <button
            class="cg-global-btn cg-global-btn--stop"
            :title="'全部停止'"
            @click="batchAction('stop_cover')"
          >
            <Square class="w-3 h-3 fill-current" />
            <span>{{ '全停' }}</span>
          </button>
          <button class="cg-global-btn" :title="'全部关闭'" @click="batchAction('close_cover')">
            <ArrowDownToLine class="w-3.5 h-3.5" />
            <span>{{ '全部关闭' }}</span>
          </button>
        </div>

        <div v-for="group in groups" :key="group.label" class="cg-group">
          <div class="cg-group-header">
            <span class="cg-group-label">{{ group.label }}</span>
            <div class="cg-group-actions">
              <button
                class="cg-group-btn"
                :title="'打开'"
                @click="batchAction('open_cover', group.covers)"
              >
                {{ '开' }}
              </button>
              <button
                class="cg-group-btn"
                :title="'停止'"
                @click="batchAction('stop_cover', group.covers)"
              >
                {{ '停' }}
              </button>
              <button
                class="cg-group-btn"
                :title="'关闭'"
                @click="batchAction('close_cover', group.covers)"
              >
                {{ '关' }}
              </button>
            </div>
          </div>

          <div v-for="cover in group.covers" :key="cover.entity_id" class="cg-cover-item">
            <div class="cg-cover-info">
              <div :class="['cg-cover-dot', cover.isOpen ? 'cg-dot--open' : 'cg-dot--closed']" />
              <span class="cg-cover-name">{{ cover.name }}</span>
            </div>
            <div class="cg-cover-actions">
              <button
                type="button"
                class="cg-cover-btn"
                :title="'打开'"
                @click="coverAction(cover, 'open_cover')"
              >
                开
              </button>
              <button
                type="button"
                class="cg-cover-btn"
                :title="'停止'"
                @click="coverAction(cover, 'stop_cover')"
              >
                停
              </button>
              <button
                type="button"
                class="cg-cover-btn"
                :title="'关闭'"
                @click="coverAction(cover, 'close_cover')"
              >
                关
              </button>
            </div>
            <div class="cg-cover-controls">
              <span class="cg-cover-pos">{{
                displayPosition(cover) >= 0 ? displayPosition(cover) + '%' : '--'
              }}</span>
              <input
                v-if="cover.hasPosition"
                type="range"
                min="0"
                max="100"
                step="5"
                :value="displayPosition(cover) >= 0 ? displayPosition(cover) : 0"
                class="cg-slider slider-range"
                :style="
                  sliderTrackStyle({
                    value: displayPosition(cover) >= 0 ? displayPosition(cover) : 0,
                    min: 0,
                    max: 100,
                    variant: 'blue',
                  })
                "
                @input="onPositionInput(cover, parseInt($event.target.value))"
              />
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * @file CoverGroupPanel.vue
 * @module widgets/device
 * @description 窗帘组控制面板：按房间自动分组 cover.* 实体，提供全部开/关、
 *              分组批量操作、单个窗帘开/停/关及位置滑块控制。
 * @dependencies
 *  - vue: computed/onUnmounted/reactive 响应式与生命周期
 *  - @lucide/vue: ArrowUpFromLine / Square / ArrowDownToLine 图标
 *  - @/stores/entities.store: 实体状态与 HA 服务调用
 *  - @/stores/chrome.store: 全局通知
 *  - @/utils/core/logger: 日志
 *  - @/utils/core/error-message: 错误信息提取
 */
import { computed, onUnmounted, reactive } from 'vue'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { ArrowUpFromLine, Square, ArrowDownToLine } from '@lucide/vue'

import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useWidgetDeviceGroups } from '@/composables/entity/useWidgetDeviceGroups'
import { sliderTrackStyle } from '@/utils/ui/progress-bar.util'
import {
  inferDeviceGroupRoom,
  useDeviceGroupRoomLabels,
} from '@/composables/entity/useDeviceGroupRooms'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
})

const es = useEntitiesStore()
const chrome = useChromeStore()
const { labelForGroupKey } = useDeviceGroupRoomLabels()

const ROOM_OTHER = 'other'
const inferRoom = (entityId, name) => inferDeviceGroupRoom(entityId, name, ROOM_OTHER)

function localizeRoomLabel(g) {
  if (g.configured) return g.label
  return labelForGroupKey(g.label)
}

const { groups: rawGroups } = useWidgetDeviceGroups('cover.', inferRoom)

function buildCover(entityId) {
  const entity = es.entities[entityId]
  if (!entity || entity.state === 'unavailable') return null
  const name = getEntityDisplayName(entityId, entity)
  const pos = entity.attributes?.current_position
  const hasPosition = (entity.attributes?.supported_features & 4) !== 0
  return {
    entity_id: entityId,
    name,
    isOpen: entity.state === 'open' || (pos != null && pos > 0),
    position: pos != null ? pos : -1,
    hasPosition,
  }
}

const groups = computed(() => {
  void es.getDomainEpoch('cover')

  const configuredIds = Array.isArray(props.config?.coverEntityIds)
    ? props.config.coverEntityIds.filter(Boolean)
    : []
  if (configuredIds.length > 0) {
    const covers = configuredIds.map(buildCover).filter(Boolean)
    return covers.length ? [{ roomKey: null, label: '已配置窗帘', configured: true, covers }] : []
  }

  const built = rawGroups.value
    .map((g) => ({
      roomKey: g.configured ? null : g.label,
      label: localizeRoomLabel(g),
      configured: g.configured,
      covers: g.entityIds.map(buildCover).filter(Boolean),
    }))
    .filter((g) => g.covers.length > 0)

  return built.sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    if (a.roomKey === ROOM_OTHER) return 1
    if (b.roomKey === ROOM_OTHER) return -1
    return 0
  })
})

const totalCovers = computed(() => groups.value.reduce((s, g) => s + g.covers.length, 0))
const totalOpen = computed(() => {
  let count = 0
  for (const g of groups.value) {
    for (const c of g.covers) {
      if (c.isOpen) count++
    }
  }
  return count
})

async function batchAction(action, covers) {
  const targets = covers || groups.value.flatMap((g) => g.covers)
  let failCount = 0
  for (const cover of targets) {
    try {
      await es.callService('cover', action, cover.entity_id)
    } catch (e) {
      failCount += 1
      logger.error(`窗帘批量操作失败 [${cover.entity_id}]:`, e)
    }
  }
  if (failCount > 0) {
    chrome.notify(
      failCount === targets.length
        ? '窗帘批量操作失败'
        : `窗帘批量操作部分失败（${failCount}/${targets.length}）`,
      'error',
    )
  }
}

const positionTimers = {}
const optimisticPositions = reactive({})

function displayPosition(cover) {
  const pending = optimisticPositions[cover.entity_id]
  if (pending != null) return pending
  return cover.position
}

async function coverAction(cover, action) {
  try {
    await es.callService('cover', action, cover.entity_id)
  } catch (e) {
    logger.error(`窗帘操作失败 [${cover.entity_id}]:`, e)
    chrome.notify(getApiErrorMessage(e, '窗帘操作失败'), 'error')
  }
}

function onPositionInput(cover, pos) {
  optimisticPositions[cover.entity_id] = pos
  setCoverPosition(cover, pos)
}

async function setCoverPosition(cover, pos) {
  if (positionTimers[cover.entity_id]) clearTimeout(positionTimers[cover.entity_id])
  positionTimers[cover.entity_id] = setTimeout(async () => {
    delete positionTimers[cover.entity_id]
    try {
      await es.callService('cover', 'set_cover_position', cover.entity_id, { position: pos })
    } catch (e) {
      logger.error(`窗帘位置设置失败 [${cover.entity_id}]:`, e)
      chrome.notify(getApiErrorMessage(e, '窗帘位置设置失败'), 'error')
    }
  }, 300)
}

onUnmounted(() => {
  for (const id of Object.keys(positionTimers)) {
    clearTimeout(positionTimers[id])
    delete positionTimers[id]
  }
})
</script>

<style scoped src="./styles/CoverGroupPanel.css"></style>
