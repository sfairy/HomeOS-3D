<template>
  <!-- 根容器 -->
  <div class="ms-root">
    <!-- 头部：非嵌入模式展示标题 -->
    <div v-if="!embedded" class="ms-header">
      <div class="ms-header-left">
        <Music class="w-3.5 h-3.5 msp-icon" />
        <span class="ms-title">{{ '影音场景' }}</span>
      </div>
    </div>

    <div class="ms-body">
      <ApiQueryState
        :loading="presetsLoading"
        :error="presetsLoadError"
        error-title="影音场景加载失败"
        tone="pink"
        degraded-message="正在使用内置场景预设"
        :degraded="presetsDegraded"
        @retry="loadPresets"
      >
        <!-- 场景按钮网格：点击应用对应影音场景 -->
        <div class="ms-scenes">
          <button
            v-for="sc in localizedSceneList"
            :key="sc.id"
            class="ms-scene"
            :class="{ 'ms-scene--active': activeScene === sc.id }"
            :disabled="busy"
            @click="applyScene(sc.id)"
          >
            <component :is="sceneIcons[sc.id]" class="w-4 h-4" />
            <span>{{ sc.label }}</span>
          </button>
        </div>

        <div v-if="lastResult" class="ms-result">
          <span class="text-[12px] msp-result-text">{{ lastResult }}</span>
        </div>

        <!-- 多房间同步分组 -->
        <div class="ms-group">
          <div class="ms-group-title">{{ '多房间同步' }}</div>
          <div v-if="syncPresets.length" class="ms-presets">
            <button
              v-for="preset in syncPresets"
              :key="preset.id"
              class="ms-preset"
              :disabled="busy"
              @click="applySyncPreset(preset)"
            >
              {{ preset.label }}
            </button>
            <button
              class="ms-preset ms-preset--ghost"
              :disabled="busy || selected.length < 2"
              @click="saveSyncPreset"
            >
              {{ '保存当前' }}
            </button>
          </div>
          <div class="ms-players">
            <label v-for="p in players" :key="p.entity_id" class="ms-player">
              <input type="checkbox" :value="p.entity_id" v-model="selected" />
              <span>{{ p.name }}</span>
            </label>
            <div v-if="players.length === 0" class="text-[12px] text-white/15">
              {{ '未发现媒体播放器' }}
            </div>
          </div>
          <div class="ms-group-actions" v-if="players.length">
            <button
              class="ms-btn ms-btn--primary"
              :disabled="busy || selected.length < 2"
              @click="groupSync"
            >
              {{ '同步播放' }}
            </button>
            <button
              class="ms-btn ms-btn--ghost"
              :disabled="busy || selected.length === 0"
              @click="unjoin"
            >
              {{ '解除分组' }}
            </button>
          </div>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
import { readLocalStorage, writeLocalStorageJson } from '@/utils/core/local-storage.util'
/**
 * 影音场景联动面板 MediaScenePanel
 *
 * 所属模块：frontend/widgets/media
 * 职责：提供影音场景一键应用（观影/音乐/派对/睡眠/关闭），
 *       以及多房间媒体分组同步播放（join/unjoin）。
 * API:
 *   GET  /system/media/scene/presets
 *      POST /system/media/scene { preset, mediaPlayers?, lights? }
 *      POST /system/media/group/sync { players }
 *      POST /system/media/group/unjoin { players }
 */
import { ref, computed, onMounted } from 'vue'
import { Music, Film, Disc3, PartyPopper, Moon, Power, Gamepad2, Sunrise } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import {
  applyMediaScene,
  fetchMediaScenePresets,
  syncMediaGroup,
  unjoinMediaGroup,
} from '@/services/api/media'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

/**
 * 组件 Props。
 * @property {boolean} embedded - 是否嵌入模式（隐藏头部），默认 false
 * @property {Object} config - 微件配置对象，默认空对象
 * @property {boolean} panelVisible - 面板是否可见，默认 true
 */
defineProps({
  embedded: { type: Boolean, default: false },
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
})

// 实体状态仓库（读取 light. / media_player. 实体）
const es = useEntitiesStore()
// UI 仓库（通知 / 打开播放器 / 弹窗输入）
const chrome = useChromeStore()
// 操作进行中标志（防重入）
const busy = ref(false)
const activeScene = ref(null)
const lastResult = ref('')
const selected = ref([])
const sceneList = ref([])
const presetsLoading = ref(true)
const presetsLoadError = ref('')
const presetsDegraded = ref(false)
// localStorage key：保存用户自定义同步预设
const SYNC_PRESET_KEY = 'homeos_media_sync_presets'

/**
 * 应用内置场景预设（API 失败时降级使用）。
 * 场景：movie / music / party / gaming / morning / sleep / off，opensPlayer 标记是否需要打开播放器面板。
 */
function applyBuiltinPresets() {
  sceneList.value = ['movie', 'music', 'party', 'gaming', 'morning', 'sleep', 'off'].map(
    (id) => ({
      id,
      opensPlayer: id !== 'sleep' && id !== 'off' && id !== 'morning',
      label: presetLabels.value[id] || id,
    }),
  )
}

/**
 * 从 API 加载场景预设。失败时降级为内置预设并标记 presetsDegraded。
 * @returns {Promise<void>}
 */
async function loadPresets() {
  presetsLoading.value = true
  presetsLoadError.value = ''
  presetsDegraded.value = false
  try {
    const { data } = await fetchMediaScenePresets()
    sceneList.value = (data?.presets || []).map((p) => ({
      ...p,
      label: presetLabels.value[p.id] || p.label || p.id,
    }))
    if (!sceneList.value.length) applyBuiltinPresets()
  } catch (e) {
    presetsDegraded.value = true
    applyBuiltinPresets()
    void e
  } finally {
    presetsLoading.value = false
  }
}

/**
 * 内置多房间同步预设：全屋 / 客厅+卧室 / 一层。
 * match 函数用于按播放器名称匹配所属预设。
 */
const builtinSyncPresets = computed(() => [
  { id: 'all', label: '全屋', match: () => true },
  {
    id: 'living-bedroom',
    label: '客厅+卧室',
    match: (name) => /客厅|卧室|living|bedroom/i.test(name),
  },
  { id: 'main-floor', label: '一层', match: (name) => /一层|一楼|1f|ground/i.test(name) },
])

// 用户自定义同步预设（持久化到 localStorage）
const customSyncPresets = ref([])

/** 合并内置 + 自定义同步预设列表。 */
const syncPresets = computed(() => [...builtinSyncPresets.value, ...customSyncPresets.value])

/**
 * 场景 ID 到中文标签的映射表。
 */
const presetLabels = computed(() => ({
  movie: '观影',
  music: '音乐',
  party: '派对',
  gaming: '游戏',
  morning: '晨间',
  sleep: '睡眠',
  off: '关闭',
}))

/**
 * 本地化场景列表：使用 presetLabels 覆盖每个场景的 label。
 */
const localizedSceneList = computed(() =>
  sceneList.value.map((s) => ({
    ...s,
    label: presetLabels.value[s.id] || s.label || s.id,
  })),
)

// 场景 ID 到图标组件的映射
const sceneIcons = {
  movie: Film,
  music: Disc3,
  party: PartyPopper,
  gaming: Gamepad2,
  morning: Sunrise,
  sleep: Moon,
  off: Power,
}

/**
 * 计算可用的 media_player 实体列表（排除 unavailable）。
 * 依赖 es.getDomainEpoch 触发响应式刷新。
 * @returns {Array<{entity_id: string, name: string}>} 播放器列表
 */
const players = computed(() => {
  void es.getDomainEpoch('media_player')
  const list = []
  for (const [key, entity] of Object.entries(es.entities)) {
    if (!key.startsWith('media_player.')) continue
    if (!entity || entity.state === 'unavailable') continue
    list.push({ entity_id: key, name: getEntityDisplayName(key, entity) })
  }
  return list
})

/**
 * 解析参与场景应用的播放器列表：优先使用勾选项，无勾选时使用全部可用播放器。
 * @returns {string[]} 播放器 entity_id 列表
 */
function resolveMediaPlayers() {
  if (selected.value.length) return [...selected.value]
  return players.value.map((p) => p.entity_id)
}

/**
 * 应用场景后按需打开播放器面板（sleep / off 场景不打开）。
 * @param {string} preset - 场景 ID
 * @param {string[]} playerIds - 参与播放器列表
 */
function openPlayerForScene(preset, playerIds) {
  const meta = sceneList.value.find((s) => s.id === preset)
  if (!meta?.opensPlayer || !playerIds?.length) return
  chrome.openMediaPlayer(playerIds[0])
}

/**
 * 应用影音场景：调用 applyMediaScene，附带灯光与播放器，构造结果摘要并通知。
 * 失败（如 403）时回退 activeScene 并提示。
 * @param {string} preset - 场景 ID
 * @returns {Promise<void>}
 */
async function applyScene(preset) {
  busy.value = true
  activeScene.value = preset
  const mediaPlayers = resolveMediaPlayers()
  try {
    const lights = Object.keys(es.entities).filter((k) => k.startsWith('light.'))
    const { data } = await applyMediaScene({ preset, lights, mediaPlayers })
    const label = localizedSceneList.value.find((s) => s.id === preset)?.label || preset
    const states = (data?.playerStates || []).map((p) => {
      const name = getEntityDisplayName(p.entity_id, es.entities[p.entity_id])
      const vol = p.volume_level != null ? ` ${Math.round(p.volume_level * 100)}%` : ''
      const title = p.media_title ? ` · ${p.media_title}` : ''
      return `${name}: ${p.state}${vol}${title}`
    })
    lastResult.value = states.length ? states.join(' | ') : (data?.actions || []).join('，')
    chrome.notify(`已应用「${label}」场景`, 'success')
    openPlayerForScene(preset, data?.players || mediaPlayers)
  } catch (e) {
    chrome.notify(e?.response?.status === 403 ? '需要管理员权限' : '场景应用失败', 'error')
    activeScene.value = null
  } finally {
    busy.value = false
  }
}

/**
 * 从 localStorage 读取自定义同步预设，解析失败时回退为空数组。
 */
function loadCustomSyncPresets() {
  try {
    const raw = readLocalStorage(SYNC_PRESET_KEY)
    customSyncPresets.value = raw ? JSON.parse(raw) : []
  } catch {
    customSyncPresets.value = []
  }
}

/**
 * 将自定义同步预设序列化写入 localStorage。
 */
function persistCustomSyncPresets() {
  writeLocalStorageJson(SYNC_PRESET_KEY, customSyncPresets.value)
}

/**
 * 应用同步预设：勾选预设中的播放器，或按 match 函数匹配名称。
 * 匹配不足 2 台时回退为全部可用播放器。
 * @param {Object} preset - 同步预设
 */
function applySyncPreset(preset) {
  if (preset.players?.length) {
    selected.value = preset.players.filter((id) => es.entities[id])
    return
  }
  const ids = players.value.filter((p) => preset.match(p.name)).map((p) => p.entity_id)
  selected.value = ids.length >= 2 ? ids : players.value.map((p) => p.entity_id)
  if (selected.value.length >= 2) {
    chrome.notify(`已选中 ${selected.value.length} 个播放器`, 'info')
  }
}

/**
 * 保存当前勾选为自定义同步预设（需 >=2 台）。通过 chrome.prompt 输入名称后持久化。
 * @returns {Promise<void>}
 */
async function saveSyncPreset() {
  if (selected.value.length < 2) return
  const label = await chrome.prompt('', {
    title: '保存同步预设',
    label: '预设名称',
    defaultValue: `我的组合 (${selected.value.length} 台)`,
    placeholder: '输入预设名称',
  })
  if (!label?.trim()) return
  const id = `custom-${Date.now()}`
  customSyncPresets.value.push({ id, label: label.trim(), players: [...selected.value] })
  persistCustomSyncPresets()
  chrome.notify('同步预设已保存', 'success')
}

/**
 * 多房间同步播放：调用 syncMediaGroup 加入分组并打开首个播放器面板。
 * @returns {Promise<void>}
 */
async function groupSync() {
  busy.value = true
  try {
    await syncMediaGroup(selected.value)
    chrome.notify('多房间已同步播放', 'success')
    if (selected.value.length) chrome.openMediaPlayer(selected.value[0])
  } catch {
    chrome.notify('同步失败', 'error')
  } finally {
    busy.value = false
  }
}

/**
 * 解除分组：调用 unjoinMediaGroup 让勾选的播放器退出同步组。
 * @returns {Promise<void>}
 */
async function unjoin() {
  busy.value = true
  try {
    await unjoinMediaGroup(selected.value)
    chrome.notify('已解除分组', 'success')
  } catch {
    chrome.notify('操作失败', 'error')
  } finally {
    busy.value = false
  }
}

// 挂载时加载自定义预设与场景预设
onMounted(() => {
  loadCustomSyncPresets()
  void loadPresets()
})
</script>

<style scoped src="./styles/ScenePanel.css"></style>
