<!--
  媒体库：Music Assistant / MoviePilot 连接配置（layout.mediaConfig）、连通性测试、
  点歌、播放器列表与 MoviePilot 入库列表。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="media"
    icon-key="media"
    accent="var(--hos-color-accent)"
    layout="single"
  >
    <template #actions>
      <SettingsPendingSaveAction
        :pending="dirty ? 1 : 0"
        :saving="saving"
        pending-label="媒体连接未保存"
        save-text="保存连接配置"
        saving-text="保存中…"
        @save="saveConfig"
        @cancel="resetDraft"
      />
      <button type="button" class="settings-btn-ghost" :disabled="loading" @click="load">
        <RefreshCw :class="['w-4 h-4', loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
    </template>

    <div v-if="error" class="settings-note-box settings-note-box--danger">{{ error }}</div>

    <SettingsCard full static>
      <p class="font-semibold">{{ '连接配置' }}</p>
      <p class="mt-1 text-xs opacity-60">
        {{ '这里是 MoviePilot / Music Assistant 的唯一定义处：顶栏「影视」Tab、图片代理、入库通知都读这份配置。令牌保存后不回显；留空表示沿用已保存的令牌。测试使用的是已保存的配置。' }}
      </p>

      <div class="settings-form-grid settings-form-grid--2 mt-3">
        <div class="flex min-w-0 flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-semibold">{{ 'Music Assistant' }}</p>
            <span class="text-xs opacity-60">{{ stored.maToken ? '令牌已保存' : '未保存令牌' }}</span>
          </div>
          <label class="settings-form-label">{{ '地址' }}</label>
          <input
            v-model="draft.maUrl"
            class="settings-field"
            type="url"
            autocomplete="off"
            placeholder="http://192.168.1.10:8095"
          />
          <label class="settings-form-label">{{ '长期令牌' }}</label>
          <input
            v-model="draft.maToken"
            class="settings-field"
            type="password"
            autocomplete="new-password"
            :placeholder="stored.maToken ? '已保存，留空则不修改' : '未启用鉴权时可留空'"
          />
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="settings-btn-ghost" :disabled="testing" @click="test('ma')">
              测试 Music Assistant
            </button>
            <button
              v-if="stored.maToken"
              type="button"
              class="settings-btn-ghost text-xs"
              :disabled="saving"
              @click="markClear('maToken')"
            >
              {{ cleared.maToken ? '已标记清除（保存后生效）' : '清除已保存令牌' }}
            </button>
          </div>
        </div>

        <div class="flex min-w-0 flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-semibold">{{ 'MoviePilot' }}</p>
            <span class="text-xs opacity-60">{{ stored.mpToken ? '令牌已保存' : '未保存令牌' }}</span>
          </div>
          <label class="settings-form-label">{{ '地址' }}</label>
          <input
            v-model="draft.mpUrl"
            class="settings-field"
            type="url"
            autocomplete="off"
            placeholder="http://192.168.1.10:3000"
          />
          <label class="settings-form-label">{{ '令牌' }}</label>
          <input
            v-model="draft.mpToken"
            class="settings-field"
            type="password"
            autocomplete="new-password"
            :placeholder="stored.mpToken ? '已保存，留空则不修改' : '未启用鉴权时可留空'"
          />
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="settings-btn-ghost" :disabled="testing" @click="test('mp')">
              测试 MoviePilot
            </button>
            <button
              v-if="stored.mpToken"
              type="button"
              class="settings-btn-ghost text-xs"
              :disabled="saving"
              @click="markClear('mpToken')"
            >
              {{ cleared.mpToken ? '已标记清除（保存后生效）' : '清除已保存令牌' }}
            </button>
          </div>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-end gap-3">
        <div class="w-48">
          <label class="settings-form-label mb-1.5">{{ '入库轮询间隔（秒）' }}</label>
          <input
            v-model.number="draft.arrivalIntervalSeconds"
            class="settings-field"
            type="number"
            min="30"
            max="3600"
            step="10"
          />
        </div>
        <p class="text-xs opacity-60">{{ '允许 30–3600 秒，默认 90 秒；保存后立刻补跑一次轮询，让新间隔生效。' }}</p>
      </div>
    </SettingsCard>

    <SettingsCard full static extra-class="mt-3">
      <p class="font-semibold">{{ '点歌' }}</p>
      <p class="mt-1 text-xs opacity-60">
        {{ '只在搜索结果唯一命中时提交播放；同名多首会返回候选，不替你猜。目标音箱取「设备画像 → 房间默认播放设备」。' }}
      </p>

      <div class="settings-form-grid settings-form-grid--2 mt-3">
        <div>
          <label class="settings-form-label mb-1.5">{{ '歌名' }}</label>
          <input
            v-model="song.track"
            class="settings-field"
            type="text"
            autocomplete="off"
            placeholder="如：稻香"
            @keydown.enter.prevent="play"
          />
        </div>
        <div>
          <label class="settings-form-label mb-1.5">{{ '歌手（可选）' }}</label>
          <input
            v-model="song.artist"
            class="settings-field"
            type="text"
            autocomplete="off"
            placeholder="如：周杰伦"
            @keydown.enter.prevent="play"
          />
        </div>
      </div>

      <div class="mt-2 flex flex-wrap items-end gap-3">
        <div class="w-56">
          <label class="settings-form-label mb-1.5">{{ '房间（可选）' }}</label>
          <HosSelect v-model="song.areaId" variant="settings" block :searchable="false">
            <option value="">{{ '不指定（全屋唯一音箱时自动选）' }}</option>
            <option v-for="area in areas" :key="area.areaId" :value="area.areaId">{{ area.name }}</option>
          </HosSelect>
        </div>
        <button type="button" class="settings-btn-accent" :disabled="playing || !song.track.trim()" @click="play">
          {{ playing ? '提交中…' : '播放' }}
        </button>
        <button type="button" class="settings-btn-ghost" :disabled="searching || !song.track.trim()" @click="search">
          {{ searching ? '搜索中…' : '仅搜索' }}
        </button>
      </div>

      <p v-if="songResult" class="mt-2 text-sm" :class="songOk ? 'opacity-80' : 'text-amber-400'">
        {{ songResult }}
      </p>
      <ul v-if="candidates.length" class="mt-2 text-sm opacity-80">
        <li v-for="(line, index) in candidates" :key="`${line}-${index}`">· {{ line }}</li>
      </ul>
    </SettingsCard>

    <SettingsCard full static extra-class="mt-3">
      <p class="font-semibold">{{ 'Music Assistant 播放器' }}</p>
      <p v-if="playersMessage" class="mt-1 text-xs text-amber-400">{{ playersMessage }}</p>
      <ul v-if="players.length" class="mt-2 text-sm opacity-80">
        <li v-for="player in players" :key="player.playerId">
          · {{ player.name }}（{{ player.type || 'unknown' }}）{{ player.available ? '' : ' · 不可用' }}
        </li>
      </ul>
      <p v-else-if="!playersMessage" class="mt-2 text-sm opacity-70">{{ '暂无播放器' }}</p>
    </SettingsCard>

    <SettingsCard full static extra-class="mt-3">
      <div class="flex items-center justify-between gap-3">
        <p class="font-semibold">{{ '最近入库' }}</p>
        <button type="button" class="settings-btn-ghost" :disabled="polling" @click="poll">
          {{ polling ? '轮询中…' : '立即轮询' }}
        </button>
      </div>
      <ul v-if="arrivals.length" class="mt-2 text-sm opacity-80">
        <li v-for="item in arrivals" :key="item.id">
          · {{ item.title }}{{ item.season ? ` ${item.season}` : '' }}
          <span v-if="!item.notifiedAt" class="opacity-60">（待通知）</span>
        </li>
      </ul>
      <p v-else class="mt-2 text-sm opacity-70">{{ '暂无入库记录' }}</p>
    </SettingsCard>
  </SettingsPageShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import SettingsPageShell from '@/features/settings/components/shell/SettingsPageShell.vue'
import SettingsCard from '@/features/settings/components/shell/SettingsCard.vue'
import SettingsPendingSaveAction from '@/features/settings/shared/SettingsPendingSaveAction.vue'
import HosSelect from '@/domain/entity/components/entity-select/HosSelect.vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useLayoutStore } from '@/domain/layout/store'
import { useRegisterSettingsTabPending } from '@/features/settings/kernel/pending.internals'
import {
  listMediaArrivals,
  listMusicPlayers,
  playMusic,
  pollMediaArrivals,
  searchMusic,
  testMediaConnection,
} from '@/domain/api/media'
import { listHaAreas } from '@/domain/api/ha'
import { getApiErrorMessage } from '@/kernel/utils/core'

defineProps({ activeTab: { type: String, default: 'media' } })

const chrome = useChromeStore()
const layout = useLayoutStore()
const loading = ref(false)
const testing = ref(false)
const polling = ref(false)
const saving = ref(false)
const playing = ref(false)
const searching = ref(false)
const error = ref('')
const players = ref([])
const playersMessage = ref('')
const arrivals = ref([])
const areas = ref([])

/** 草稿：令牌输入框始终从空开始，避免把已保存的令牌回显到页面上 */
const draft = reactive({ maUrl: '', mpUrl: '', maToken: '', mpToken: '', arrivalIntervalSeconds: 90 })
/** 已保存令牌的存在性（GET 时后端只回脱敏占位符，无法还原明文） */
const stored = reactive({ maToken: false, mpToken: false })
/** 已标记「保存后清除」的令牌（清除必须显式声明，空串语义是「沿用」） */
const cleared = reactive({ maToken: false, mpToken: false })
const baseline = ref('')

/** 点歌表单与结果 */
const song = reactive({ track: '', artist: '', areaId: '' })
const songResult = ref('')
const songOk = ref(true)
const candidates = ref([])

/** 与后端 CONFIG_MASK_PLACEHOLDER 对齐 */
const MASK = '••••••••'

function snapshot() {
  return JSON.stringify([
    draft.maUrl.trim(),
    draft.mpUrl.trim(),
    draft.maToken.trim(),
    draft.mpToken.trim(),
    Number(draft.arrivalIntervalSeconds) || 0,
    cleared.maToken,
    cleared.mpToken,
  ])
}

const dirty = computed(() => snapshot() !== baseline.value)

function readConfig() {
  const config = layout.layoutConfig?.mediaConfig || {}
  draft.maUrl = typeof config.maUrl === 'string' ? config.maUrl : ''
  draft.mpUrl = typeof config.mpUrl === 'string' ? config.mpUrl : ''
  draft.maToken = ''
  draft.mpToken = ''
  draft.arrivalIntervalSeconds = Number(config.arrivalIntervalSeconds) || 90
  stored.maToken = Boolean(config.maToken)
  stored.mpToken = Boolean(config.mpToken)
  cleared.maToken = false
  cleared.mpToken = false
  baseline.value = snapshot()
}

function resetDraft() {
  readConfig()
}

function markClear(key) {
  cleared[key] = !cleared[key]
}

/** 间隔夹紧到后端允许区间，避免「填了 5 秒但其实按 30 秒跑」的误解 */
function clampInterval() {
  const raw = Number(draft.arrivalIntervalSeconds)
  draft.arrivalIntervalSeconds = Number.isFinite(raw) ? Math.max(30, Math.min(3600, Math.round(raw))) : 90
}

async function saveConfig() {
  if (!layout.isConfigLoaded) {
    chrome.notify('布局尚未加载完成，请稍后再保存', 'warning')
    return
  }
  saving.value = true
  try {
    clampInterval()
    const previous = layout.layoutConfig?.mediaConfig || {}
    const clears = [cleared.maToken ? 'maToken' : '', cleared.mpToken ? 'mpToken' : ''].filter(Boolean)
    // 令牌留空时不覆盖：后端会沿用库中已保存的令牌（脱敏占位符同样按「沿用」处理）；
    // 真要清空必须走 clearTokens，否则「留空」和「清除」无法区分。
    layout.layoutConfig.mediaConfig = {
      ...previous,
      maUrl: draft.maUrl.trim(),
      mpUrl: draft.mpUrl.trim(),
      arrivalIntervalSeconds: draft.arrivalIntervalSeconds,
      ...(draft.maToken.trim() ? { maToken: draft.maToken.trim() } : {}),
      ...(draft.mpToken.trim() ? { mpToken: draft.mpToken.trim() } : {}),
      ...(clears.length ? { clearTokens: clears } : { clearTokens: [] }),
    }
    const ok = await layout.saveLayout(true)
    if (!ok) return
    applyInMemoryAfterSave()
    readConfig()
    maskInMemoryTokens()
    chrome.notify('媒体连接配置已保存', 'success')
    await load()
    schedulePollRefresh()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '保存媒体配置失败'), 'error')
  } finally {
    saving.value = false
  }
}

/**
 * 保存成功后把内存里的 mediaConfig 收敛到「服务端此刻的真实状态」。
 *
 * 不清掉 `clearTokens` 与已被清除的令牌，UI 会拿内存里的旧值算出「令牌已保存」，
 * 而库里其实已经是空串——用户点完清除、保存，界面却还显示令牌在。
 */
function applyInMemoryAfterSave() {
  const config = layout.layoutConfig?.mediaConfig
  if (!config) return
  delete config.clearTokens
  if (cleared.maToken) delete config.maToken
  if (cleared.mpToken) delete config.mpToken
}

/**
 * 保存成功后把令牌换成脱敏占位符。
 *
 * layoutConfig 是全局共享的活对象：留着明文，之后任何一个面板保存布局都会把令牌再
 * 上传一次，而且明文会一直躺在浏览器内存里。占位符回写由后端 `merge_layout_secrets_on_save`
 * 按「沿用已保存值」处理，语义等价（与智能管家的 apiKey 处理一致）。
 */
function maskInMemoryTokens() {
  const config = layout.layoutConfig?.mediaConfig
  if (!config) return
  if (config.maToken) config.maToken = MASK
  if (config.mpToken) config.mpToken = MASK
}

/**
 * 间隔改动由后台轮询器在**下一轮**读取，正在 sleep 的那一轮仍按旧值。
 * 保存后补一次手动轮询，让新配置立刻见效（也让用户马上看到是否配通）。
 */
let pollTimer = null
function schedulePollRefresh() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(() => {
    pollTimer = null
    void poll(true)
  }, 800)
}

async function load() {
  loading.value = true
  error.value = ''
  playersMessage.value = ''
  try {
    // 原来这三处都 `catch(() => 空数组)`：后端回了 message（未配置地址 / 令牌被拒）也
    // 被吞成「暂无」，用户只看到空列表，完全不知道是没配还是配错了。
    const [playerRes, arrivalRes, areaRes] = await Promise.all([
      listMusicPlayers().catch((e) => ({ data: { items: [], message: getApiErrorMessage(e, '读取播放器失败') } })),
      listMediaArrivals(30).catch(() => ({ data: { items: [] } })),
      listHaAreas().catch(() => ({ data: { items: [] } })),
    ])
    players.value = playerRes.data?.items || []
    playersMessage.value = playerRes.data?.success === false ? String(playerRes.data?.message || '') : ''
    arrivals.value = arrivalRes.data?.items || []
    areas.value = areaRes.data?.items || []
    if (song.areaId && !areas.value.some((a) => a.areaId === song.areaId)) song.areaId = ''
  } catch (e) {
    error.value = getApiErrorMessage(e, '读取媒体信息失败')
  } finally {
    loading.value = false
  }
}

async function test(kind) {
  testing.value = true
  try {
    const { data } = await testMediaConnection(kind)
    const message = data?.message || (data?.success ? '连接正常' : '连接失败')
    chrome.notify(message, data?.success ? 'success' : 'error')
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '连接测试失败'), 'error')
  } finally {
    testing.value = false
  }
}

async function poll(silent = false) {
  polling.value = true
  try {
    const { data } = await pollMediaArrivals()
    if (!silent || data?.added) {
      chrome.notify(
        data?.success
          ? data?.message || `新增 ${data.added} 条，通知 ${data.notified} 条`
          : data?.message || '轮询失败',
        data?.success ? 'info' : 'error',
      )
    }
    await load()
  } catch (e) {
    if (!silent) chrome.notify(getApiErrorMessage(e, '轮询失败'), 'error')
  } finally {
    polling.value = false
  }
}

async function search() {
  searching.value = true
  songResult.value = ''
  candidates.value = []
  try {
    const { data } = await searchMusic(song.track.trim(), 'track', 10)
    if (data?.success === false) {
      songOk.value = false
      songResult.value = String(data?.message || '搜索失败')
      return
    }
    const items = data?.items || []
    candidates.value = items.map((item) => {
      const artist = item.artists?.length ? ` — ${item.artists.map((a) => a.name).join(' / ')}` : ''
      return `${item.name}${artist}`
    })
    songOk.value = candidates.value.length > 0
    songResult.value = candidates.value.length
      ? `命中 ${candidates.value.length} 个结果（同名多首时不会自动播放）`
      : '没有搜到结果'
  } catch (e) {
    songOk.value = false
    songResult.value = getApiErrorMessage(e, '搜索失败')
  } finally {
    searching.value = false
  }
}

/** 点歌候选有两种形状：同名歌曲是 `{name, uri}`，多台音箱时是 playerId 字符串 */
function candidateLines(items) {
  return (items || [])
    .map((item) => {
      if (typeof item === 'string') return `音箱：${item}`
      return String(item?.name || item?.uri || '')
    })
    .filter(Boolean)
}

async function play() {
  if (!song.track.trim()) return
  playing.value = true
  songResult.value = ''
  candidates.value = []
  try {
    const { data } = await playMusic(song.artist.trim(), song.track.trim(), song.areaId)
    songOk.value = Boolean(data?.success)
    songResult.value = data?.success
      ? `已提交到「${data.playerId || '默认音箱'}」：${data.track?.name || song.track.trim()}`
      : String(data?.message || '播放失败')
    candidates.value = candidateLines(data?.candidates)
  } catch (e) {
    songOk.value = false
    songResult.value = getApiErrorMessage(e, '播放失败')
  } finally {
    playing.value = false
  }
}

// 布局在面板挂载后才加载完成 / 切换方案时，重新同步草稿基线
watch(
  () => layout.isConfigLoaded,
  (loaded) => {
    if (loaded) readConfig()
  },
)

useRegisterSettingsTabPending('media', () => dirty.value, resetDraft)

readConfig()
onMounted(load)
</script>
