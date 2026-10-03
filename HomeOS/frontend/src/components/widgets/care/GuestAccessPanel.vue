<!--
  GuestAccessPanel.vue / components/widgets/care
  访客临时密码面板：关爱中心访客通行子页签，负责新建临时门锁密码（可指定
  槽位、小时数、自填密码或留空随机）、列表展示密码有效期、单条撤销与批量续期。
  Props: embedded 嵌入 Hub 时隐藏独立标题头
  依赖：Pinia — useEntitiesStore 过滤 lock 域设备下拉 + useChromeStore 通知中心；
        services/api/system GET/POST/DELETE guest/passes 接口；
        composables/widget/useScheduledPoll 定时刷新；HosSelect 门锁选择器。
  注意：expiringSoon 阈值由 frontend-config 控制；续期默认追加 24 小时。
-->
<template>
  <div class="ga-root">
    <div class="ga-header" :class="{ 'ga-header--embedded': embedded }">
      <div v-if="!embedded" class="ga-header-left">
        <KeyRound class="w-3.5 h-3.5 ga-icon" />
        <span class="ga-title">{{ '访客通行' }}</span>
      </div>
      <div class="ga-header-actions">
        <button
          v-if="expiringSoonCount > 0"
          class="ga-batch"
          :disabled="busy"
          @click="extendExpiring"
        >
          {{ `续期${expiringSoonCount}` }}
        </button>
        <button
          type="button"
          class="ga-add"
          :aria-label="creating ? '关闭新建表单' : '新建临时密码'"
          @click="creating = !creating"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div class="ga-body">
      <!-- 新建表单 -->
      <div v-if="creating" class="ga-form">
        <input v-model="form.name" :placeholder="'访客姓名'" class="ga-input" />
        <HosSelect variant="inline" trigger-class="ga-input" v-model="form.lockEntityId">
          <option value="" disabled>{{ '选择门锁' }}</option>
          <option v-for="l in locks" :key="l.entity_id" :value="l.entity_id">{{ l.name }}</option>
        </HosSelect>
        <div class="ga-form-row">
          <label class="ga-mini-field">
            <span>{{ '有效(小时)' }}</span>
            <input
              v-model.number="form.durationHours"
              type="number"
              min="1"
              max="168"
              class="ga-input ga-input--sm"
            />
          </label>
          <label class="ga-mini-field">
            <span>{{ '指定密码(可选)' }}</span>
            <input v-model="form.code" :placeholder="'留空随机'" class="ga-input ga-input--sm" />
          </label>
        </div>
        <div class="ga-form-actions">
          <button
            class="ga-btn ga-btn--primary"
            :disabled="busy || !form.name || !form.lockEntityId"
            @click="createPass"
          >
            {{ '生成密码' }}
          </button>
          <button class="ga-btn ga-btn--ghost" @click="creating = false">{{ '取消' }}</button>
        </div>
      </div>

      <ApiQueryState
        :loading="loading"
        :error="loadError"
        tone="indigo"
        error-title="访客密码加载失败"
        @retry="fetchPasses"
      >
        <VEmptyState
          v-if="passes.length === 0 && !creating"
          compact
          tone="indigo"
          icon="🔑"
          :title="'暂无临时密码'"
        />

        <div v-else class="ga-list">
          <div v-for="p in passes" :key="p.id" class="ga-pass">
            <div class="ga-pass-info">
              <span class="ga-pass-name">{{ p.name }}</span>
              <span class="ga-pass-meta">
                槽位 {{ p.slot }} · {{ p.codeMasked }} · 至 {{ formatShortDateTimeOrDash(p.expiresAt) }}
                <span v-if="isExpiringSoon(p.expiresAt)" class="ga-expire-warn">{{
                  '即将过期'
                }}</span>
              </span>
            </div>
            <button
              v-if="isExpiringSoon(p.expiresAt)"
              class="ga-extend"
              :disabled="busy"
              :title="'续期 24h'"
              @click="extendOne(p.id)"
            >
              +24h
            </button>
            <button
              type="button"
              class="ga-revoke"
              :disabled="busy"
              :aria-label="'撤销临时密码'"
              @click="revoke(p.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * @file GuestAccessPanel.vue
 * @module widgets/care
 * @description 访客临时密码面板：展示与创建/删除访客临时门锁密码，支持续期即将过期的密码。
 * API: GET    /system/guest/passes
 *      POST   /system/guest/passes { name, lockEntityId, durationHours, code? }
 *      DELETE /system/guest/passes/:id
 * @dependencies
 *  - vue: ref/reactive/computed/onMounted 响应式与生命周期
 *  - @lucide/vue: KeyRound / Plus / Trash2 图标
 *  - @/components/common/base/HosSelect.vue: 下拉选择
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/composables/widget/useScheduledPoll: 定时轮询
 *  - @/services/api/system: 访客通行接口
 *  - @/utils/format/locale-format.util: 本地时间格式化
 *  - @/utils/core/error-message: 错误信息提取
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { ref, reactive, computed, onMounted } from 'vue'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import { KeyRound, Plus, Trash2 } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'

import {
  createGuestPass,
  deleteGuestPass,
  extendGuestPass,
  extendGuestPassesBatch,
  fetchGuestPasses,
} from '@/services/api/system'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { formatShortDateTimeOrDash } from '@/utils/format/locale-format.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getGuestPassConfig } from '@/utils/config/frontend-config'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

defineProps({
  embedded: { type: Boolean, default: false },
})

const es = useEntitiesStore()
const chrome = useChromeStore()
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const creating = ref(false)
const passes = ref([])
const form = reactive({
  name: '',
  lockEntityId: '',
  durationHours: getGuestPassConfig().defaultHours,
  code: '',
})

const expiringSoonCount = computed(
  () => passes.value.filter((p) => isExpiringSoon(p.expiresAt)).length,
)

const locks = computed(() => {
  const list = []
  for (const [key, entity] of Object.entries(es.entities)) {
    if (!key.startsWith('lock.')) continue
    if (!entity || entity.state === 'unavailable') continue
    list.push({ entity_id: key, name: getEntityDisplayName(key, entity) })
  }
  return list
})


function isExpiringSoon(iso) {
  if (!iso) return false
  const diff = new Date(iso).getTime() - Date.now()
  return diff > 0 && diff < 2 * 60 * 60 * 1000
}

async function fetchPasses() {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await fetchGuestPasses()
    passes.value = Array.isArray(data) ? data : []
  } catch (e) {
    passes.value = []
    loadError.value = getApiErrorMessage(e, '加载失败')
  } finally {
    loading.value = false
  }
}

async function createPass() {
  const hours = Number(form.durationHours)
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
    chrome.notify('有效时长需在 1–168 小时之间', 'warning')
    return
  }
  busy.value = true
  try {
    const { data } = await createGuestPass({
      name: form.name,
      lockEntityId: form.lockEntityId,
      durationHours: hours,
      code: form.code || undefined,
    })
    const plain = data?.code ? String(data.code) : ''
    chrome.notify(plain ? `临时密码已生成：${plain}` : '临时密码已生成', 'success')
    creating.value = false
    form.name = ''
    form.code = ''
    await fetchPasses()
  } catch (e) {
    chrome.notify(e?.response?.status === 403 ? '需要管理员权限' : '生成失败', 'error')
  } finally {
    busy.value = false
  }
}

async function extendOne(id) {
  const extendH = getGuestPassConfig().extendHours
  busy.value = true
  try {
    await extendGuestPass(id, extendH)
    chrome.notify(`已续期 ${extendH} 小时`, 'success')
    await fetchPasses()
  } catch {
    chrome.notify('续期失败', 'error')
  } finally {
    busy.value = false
  }
}

async function extendExpiring() {
  const ids = passes.value.filter((p) => isExpiringSoon(p.expiresAt)).map((p) => p.id)
  if (!ids.length) return
  busy.value = true
  try {
    const extendH = getGuestPassConfig().extendHours
    await extendGuestPassesBatch(ids, extendH)
    chrome.notify(`已批量续期 ${ids.length} 个密码`, 'success')
    await fetchPasses()
  } catch {
    chrome.notify('批量续期失败', 'error')
  } finally {
    busy.value = false
  }
}

async function revoke(id) {
  const ok = await chrome.confirm('确定撤销该临时密码？门锁上对应槽位将被清除。', '撤销确认')
  if (!ok) return
  busy.value = true
  try {
    await deleteGuestPass(id)
    chrome.notify('已撤销', 'success')
    await fetchPasses()
  } catch (e) {
    chrome.notify(e?.response?.status === 403 ? '需要管理员权限' : '撤销失败', 'error')
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  fetchPasses()
})
useScheduledPoll(fetchPasses, 60000, { key: 'widget:GuestAccessPanel' })
</script>

<style scoped src="./styles/GuestAccessPanel.css"></style>
