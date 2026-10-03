<!--
  LockManagementPanel.vue / components/widgets/security
  门锁管理面板：安防 Hub 下统一展示所有 lock 域设备，支持一键全部上锁/解锁、
  单个门切换开关、最近锁定/解锁事件日志时间线。
  Props: embedded 嵌入态时隐藏独立标题头与全局徽章
  依赖：Pinia — useEntitiesStore 取 lock 域实体状态 + useChromeStore；
        utils: locale-format.util formatLocaleTime 事件时间；
        derived.util getEntityDisplayName 展示名；
        notify 错误通知；
        lucide: Lock / Unlock / Clock 图标；
        通过 HA callService lock/unlock 服务调用操作实体。
  注意：anyUnlocked 时顶部徽章与全局按钮高亮；事件日志来自 entitiesStore 历史记录。
-->
<template>
  <div class="lm-root">
    <div v-if="!embedded" class="lm-header">
      <div class="lm-header-left">
        <Lock :class="['w-3.5 h-3.5', anyUnlocked ? 'lm-icon-warn' : 'lm-icon-ok']" />
        <span class="lm-title">{{ '门锁管理' }}</span>
      </div>
      <div class="lm-header-right">
        <span v-if="anyUnlocked" class="lm-badge lm-badge--warn">{{
          `${unlockedCount} 未锁`
        }}</span>
        <span v-else class="lm-badge lm-badge--ok">{{ '全部锁定' }}</span>
      </div>
    </div>

    <div class="lm-body">
      <VEmptyState
        v-if="locks.length === 0"
        compact
        tone="rose"
        icon="🔒"
        :title="'未发现门锁设备'"
      />

      <template v-else>
        <!-- 全部操作按钮 -->
        <div class="lm-global-actions">
          <button class="lm-action-btn lm-action-btn--lock" :disabled="locking" @click="lockAll">
            <Lock class="w-3.5 h-3.5" />
            <span>{{ '全部上锁' }}</span>
          </button>
          <button
            class="lm-action-btn lm-action-btn--unlock"
            :disabled="locking"
            @click="unlockAll"
          >
            <Unlock class="w-3.5 h-3.5" />
            <span>{{ '全部解锁' }}</span>
          </button>
        </div>

        <!-- 单个门锁卡片 -->
        <div v-for="lock in locks" :key="lock.entity_id" class="lm-lock-card">
          <div class="lm-lock-info">
            <div :class="['lm-lock-dot', lock.isLocked ? 'lm-dot--locked' : 'lm-dot--unlocked']" />
            <div class="lm-lock-detail">
              <span class="lm-lock-name">{{ lock.name }}</span>
              <span class="lm-lock-room" v-if="lock.room">{{ lock.room }}</span>
            </div>
          </div>
          <div class="lm-lock-actions">
            <span
              :class="['lm-lock-state', lock.isLocked ? 'lm-state-locked' : 'lm-state-unlocked']"
            >
              {{ lock.isLocked ? '锁定' : '未锁' }}
            </span>
            <button
              type="button"
              :class="['lm-toggle-btn', lock.isLocked ? 'lm-toggle--unlock' : 'lm-toggle--lock']"
              :aria-label="lock.isLocked ? `解锁 ${lock.name}` : `上锁 ${lock.name}`"
              @click="toggleLock(lock)"
            >
              <Unlock v-if="lock.isLocked" class="w-3 h-3" />
              <Lock v-else class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- 门锁事件日志 -->
        <div v-if="lockEvents.length > 0" class="lm-events">
          <div class="lm-events-title">
            <Clock class="w-3 h-3 lm-clock-icon" />
            <span>{{ '最近记录' }}</span>
          </div>
          <div v-for="(event, idx) in lockEvents" :key="idx" class="lm-event-item">
            <div :class="['lm-event-dot', event.isLock ? 'lm-event--lock' : 'lm-event--unlock']" />
            <span class="lm-event-name">{{ event.lockName }}</span>
            <span class="lm-event-action">{{ event.isLock ? '上锁' : '解锁' }}</span>
            <span class="lm-event-time">{{ event.time }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * 门锁管理面板
 *
 * 功能：
 * 1. 全屋门锁状态一览
 * 2. 一键全部上锁/解锁
 * 3. 单个门锁独立控制
 * 4. 最近门锁操作记录
 *
 * 从 entitiesStore 扫描所有 lock.* 实体
 * 事件日志由 WebSocket 推送的 entity 状态变更派生
 */
import { ref, computed, reactive } from 'vue'
import { Lock, Unlock, Clock } from '@lucide/vue'

import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

defineProps({
  embedded: { type: Boolean, default: false },
})

const es = useEntitiesStore()
const chrome = useChromeStore()

const locking = ref(false)

// 门锁事件记录缓冲区
const eventLog = reactive([])
const MAX_EVENTS = 20

const locks = computed(() => {
  void es.getDomainEpoch('lock')
  const result = []
  const entities = es.entities
  for (const [entityId, entity] of Object.entries(entities)) {
    if (!entity || !entityId.startsWith('lock.')) continue
    if (entity.state === 'unavailable') continue

    const name = getEntityDisplayName(entityId, entity)
    const room = entity.attributes?.room || inferRoom(entityId, name)

    result.push({
      entity_id: entityId,
      name,
      room,
      isLocked: entity.state === 'locked',
      state: entity.state,
    })
  }
  return result
})

const unlockedCount = computed(() => locks.value.filter((l) => !l.isLocked).length)
const anyUnlocked = computed(() => unlockedCount.value > 0)

const lockEvents = computed(() => {
  return eventLog.slice(0, 10)
})

function inferRoom(entityId, name) {
  const keywords = [
    '大门',
    '入户',
    '玄关',
    '卧室',
    '主卧',
    '次卧',
    '儿童房',
    '书房',
    '阳台',
    '后门',
    '车库',
    '前门',
    '后院',
  ]
  for (const kw of keywords) {
    if (entityId.includes(kw) || name.includes(kw)) return kw
  }
  return null
}

function addEvent(lockName, isLock) {
  const now = new Date()
  const time = formatLocaleTime(now, { hour: '2-digit', minute: '2-digit' })
  eventLog.unshift({ lockName, isLock, time })
  if (eventLog.length > MAX_EVENTS) eventLog.length = MAX_EVENTS
}

async function toggleLock(lock) {
  // 解锁为高危操作（墙面误触即开门），上锁为安全方向直接执行
  if (lock.isLocked) {
    const ok = await chrome.confirm(
      `确定解锁「${lock.name}」？解锁后门将可直接打开。`,
      '解锁确认',
      { type: 'danger', confirmText: '确认解锁' },
    )
    if (!ok) return
  }
  try {
    const service = lock.isLocked ? 'unlock' : 'lock'
    await es.callService('lock', service, lock.entity_id)
    addEvent(lock.name, service === 'lock')
  } catch (e) {
    notifyError(e, '门锁操作')
  }
}

async function lockAll() {
  locking.value = true
  try {
    for (const lock of locks.value) {
      if (!lock.isLocked) {
        await es.callService('lock', 'lock', lock.entity_id)
      }
    }
  } catch (e) {
    notifyError(e, '全部上锁')
  } finally {
    locking.value = false
  }
}

async function unlockAll() {
  const targets = locks.value.filter((l) => l.isLocked)
  if (!targets.length) return
  const ok = await chrome.confirm(
    `确定解锁全部 ${targets.length} 把门锁？解锁后所有门将可直接打开。`,
    '全部解锁确认',
    { type: 'danger', confirmText: '全部解锁' },
  )
  if (!ok) return
  locking.value = true
  try {
    for (const lock of targets) {
      await es.callService('lock', 'unlock', lock.entity_id)
    }
  } catch (e) {
    notifyError(e, '全部解锁')
  } finally {
    locking.value = false
  }
}
</script>

<style scoped src="./styles/LockManagementPanel.css"></style>
