/**
 * 媒体播放列表组件 MediaPlaylistWidget
 *
 * 职责：展示与控制 HA media_player 的播放队列，支持刷新、查看当前曲目、开始播放与下一首；
 *       支持两种展示形态（widget 微件 / settings 设置面板），通过 variant 切换。
 * 依赖：
 *   - vue (ref/computed/onMounted/watch)
 *   - @/components/common/base/HosSelect 下拉选择器
 *   - @/components/common/ApiQueryState 加载/错误状态容器
 *   - @/stores/entities.store、@/stores/chrome.store
 *   - @/services/api/media（fetchMediaPlaylist / nextMediaPlaylist / startMediaPlaylist）
 *   - @/utils/core/error-message、@/services/notify、@/utils/entity/derived.util
 */
<template>
  <div :class="['media-playlist', variant === 'settings' && 'media-playlist--settings']">
    <!-- 微件模式头部：标题与刷新按钮 -->
    <header v-if="variant === 'widget'" class="media-playlist__head">
      <h3>{{ '播放列表' }}</h3>
      <button
        type="button"
        class="media-playlist__refresh"
        :disabled="loading"
        @click="loadPlaylist"
      >
        {{ '刷新' }}
      </button>
    </header>
    <!-- 设置模式工具栏：仅刷新按钮 -->
    <div v-else class="media-playlist__toolbar">
      <button
        type="button"
        class="media-playlist__refresh media-playlist__refresh--settings"
        :disabled="loading"
        @click="loadPlaylist"
      >
        {{ '刷新' }}
      </button>
    </div>

    <!-- 播放器选择字段 -->
    <label class="media-playlist__field">
      <span class="media-playlist__field-label">{{ '播放器' }}</span>
      <HosSelect v-model="selectedPlayer" @change="loadPlaylist">
        <option value="">{{ '选择媒体播放器' }}</option>
        <option v-for="p in players" :key="p.entity_id" :value="p.entity_id">{{ p.name }}</option>
      </HosSelect>
    </label>

    <VEmptyState v-if="!players.length" compact tone="violet" :title="'未发现可用媒体播放器'" />

    <ApiQueryState
      v-else
      :loading="loading"
      :error="loadError"
      error-title="播放列表加载失败"
      tone="violet"
      @retry="loadPlaylist"
    >
      <template v-if="selectedPlayer">
        <!-- 正在播放：当前曲目与序号 -->
        <div v-if="playlist" class="media-playlist__now">
          <span class="media-playlist__label">{{ '正在播放' }}</span>
          <span>{{ currentTitle }}</span>
          <span class="media-playlist__muted"
            >{{ playlist.index + 1 }} / {{ playlist.items.length }}</span
          >
        </div>
        <VEmptyState v-else-if="!playlist" compact tone="violet" :title="'暂无活跃播放列表'" />

        <!-- 曲目列表：高亮当前播放项 -->
        <ul v-if="playlist?.items?.length" class="media-playlist__list">
          <li
            v-for="(item, idx) in playlist.items"
            :key="idx"
            :class="{ 'media-playlist__item--active': idx === playlist.index }"
          >
            {{ item.title || item.mediaContentId || `曲目 ${idx + 1}` }}
          </li>
        </ul>

        <!-- 操作按钮：开始播放 / 下一首 -->
        <div class="media-playlist__actions">
          <button
            type="button"
            :class="['media-playlist__btn', variant === 'settings' && 'settings-btn-accent']"
            :disabled="busy || !selectedPlayer"
            @click="startPlaylist"
          >
            {{ '开始播放' }}
          </button>
          <button
            type="button"
            :class="[
              'media-playlist__btn',
              'media-playlist__btn--ghost',
              variant === 'settings' && 'settings-btn-ghost',
            ]"
            :disabled="busy || !playlist"
            @click="nextTrack"
          >
            {{ '下一首' }}
          </button>
        </div>
      </template>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * 职责：实现 PlaylistWidget 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { fetchMediaPlaylist, nextMediaPlaylist, startMediaPlaylist } from '@/services/api/media'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

/**
 * 组件 Props。
 * @property {string} variant - 展示形态，'widget' 微件 / 'settings' 设置面板，默认 'widget'
 * @property {Object} config - 微件配置对象，默认空对象
 * @property {boolean} panelVisible - 面板是否可见（影响懒加载时机），默认 true
 */
defineProps({
  variant: { type: String, default: 'widget' },
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
})

// 实体状态仓库（读取 media_player 实体列表）
const es = useEntitiesStore()
// UI 仓库（通知 / 打开播放器）
const chrome = useChromeStore()
// 列表加载中
const loading = ref(false)
const loadError = ref('')
const busy = ref(false)
const selectedPlayer = ref('')
const playlist = ref(null)

/**
 * 计算可用的 media_player 实体列表（排除 unavailable）。
 * @returns {Array<{entity_id: string, name: string}>} 播放器列表
 */
const players = computed(() => {
  const list = []
  for (const [key, entity] of Object.entries(es.entities)) {
    if (!key.startsWith('media_player.')) continue
    if (!entity || entity.state === 'unavailable') continue
    list.push({
      entity_id: key,
      name: getEntityDisplayName(key, entity),
    })
  }
  return list
})

/**
 * 当前播放曲目标题，缺失时返回占位符 "—"。
 * @returns {string} 当前曲目标题
 */
const currentTitle = computed(() => {
  if (!playlist.value?.items?.length) return '—'
  const item = playlist.value.items[playlist.value.index]
  return item?.title || item?.mediaContentId || '—'
})

/**
 * 构造默认播放项。优先使用实体的 media_content_id / media_title；
 * 缺失时返回随机音乐占位项。
 * @returns {Array<{mediaContentId: string, mediaContentType: string, title: string}>} 默认播放项
 */
function buildDefaultItems() {
  const entity = es.entities[selectedPlayer.value]
  const title = entity?.attributes?.media_title
  const contentId = entity?.attributes?.media_content_id
  const contentType = entity?.attributes?.media_content_type || 'music'
  if (contentId) {
    return [{ mediaContentId: contentId, mediaContentType: contentType, title: title || contentId }]
  }
  return [{ mediaContentId: 'random://music', mediaContentType: 'music', title: '随机音乐' }]
}

/**
 * 加载指定播放器的播放列表。未选择播放器时清空状态。
 * 失败时设置 loadError 并静默通知。
 * @returns {Promise<void>}
 */
async function loadPlaylist() {
  if (!selectedPlayer.value) {
    playlist.value = null
    loadError.value = ''
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await fetchMediaPlaylist(selectedPlayer.value)
    playlist.value = data || null
  } catch (e) {
    playlist.value = null
    loadError.value = getApiErrorMessage(e, '加载失败')
    notifyError(e, '加载失败', { silent: true })
  } finally {
    loading.value = false
  }
}

/**
 * 开始播放：构造默认项并调用 startMediaPlaylist，成功后刷新列表。
 * 失败时通过 chrome.notify 提示错误。
 * @returns {Promise<void>}
 */
async function startPlaylist() {
  if (!selectedPlayer.value) return
  busy.value = true
  try {
    const items = buildDefaultItems()
    const { data } = await startMediaPlaylist({
      player: selectedPlayer.value,
      items,
    })
    if (data?.ok) {
      chrome.notify('播放列表已开始', 'success')
      await loadPlaylist()
    } else {
      chrome.notify(data?.reason || data?.error || '启动失败', 'warning')
    }
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '启动失败'), 'error')
  } finally {
    busy.value = false
  }
}

/**
 * 切换下一首：调用 nextMediaPlaylist，成功后刷新列表。
 * @returns {Promise<void>}
 */
async function nextTrack() {
  if (!selectedPlayer.value) return
  busy.value = true
  try {
    const { data } = await nextMediaPlaylist(selectedPlayer.value)
    if (data?.ok) {
      chrome.notify('已切换下一首', 'success')
      await loadPlaylist()
    } else {
      chrome.notify(data?.reason || data?.error || '切换失败', 'warning')
    }
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '切换失败'), 'error')
  } finally {
    busy.value = false
  }
}

/**
 * 自动选中第一个可用播放器并触发列表加载（onMounted 与 players 变化时调用）。
 */
function pickFirstPlayer() {
  if (selectedPlayer.value || !players.value.length) return
  selectedPlayer.value = players.value[0].entity_id
  void loadPlaylist()
}

// 挂载时尝试选中首个播放器
onMounted(pickFirstPlayer)

// 播放器列表变化时再次尝试选中首个
watch(players, () => {
  pickFirstPlayer()
})
</script>

<style scoped src="./styles/PlaylistWidget.css"></style>
