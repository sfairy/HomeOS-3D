<!--
  房间默认播放设备：点歌选音箱、开电视选 Apple TV / 电视。

  从 SettingsDeviceProfilesPanel 拆出：默认设备的增删改与那份表单互不依赖画像列表，
  合在一起会把面板文件推到 800 行以上。房间 / 播放器 / 电视候选由父组件传入。
-->
<template>
  <SettingsCard full static extra-class="dp-card">
    <SettingsCardIntro
      :icon="Speaker"
      eyebrow="房间快捷入口"
      title="房间默认播放设备"
      :description="'点歌时用来选目标音箱；「客厅默认开电视」时用来选 Apple TV / 电视。同一房间每种用途只能有一条。'"
    >
      <template v-if="editing" #actions>
        <span class="dp-badge dp-badge--warn">编辑中 · {{ areaLabel(editing.areaId) }}</span>
      </template>
    </SettingsCardIntro>

    <div class="dp-form-grid">
      <div class="dp-field">
        <label class="settings-form-label">{{ '房间' }}</label>
        <HosSelect v-model="form.areaId" variant="settings" block :searchable="false" :disabled="!!editing">
          <option v-for="area in areas" :key="area.areaId" :value="area.areaId">{{ area.name }}</option>
          <option v-if="!areas.length" value="">{{ '（没有可用房间，先在「房间配置」同步 HA 区域）' }}</option>
        </HosSelect>
      </div>

      <div class="dp-field">
        <label class="settings-form-label">{{ '用途' }}</label>
        <HosSelect v-model="form.kind" variant="settings" block :searchable="false" :disabled="!!editing">
          <option v-for="kind in DEFAULT_MEDIA_KINDS" :key="kind" :value="kind">{{ KIND_LABELS[kind] }}</option>
        </HosSelect>
      </div>

      <div class="dp-field">
        <label class="settings-form-label">
          {{ form.kind === 'speaker' ? 'Music Assistant 播放器' : '电视 / Apple TV 实体' }}
        </label>
        <template v-if="form.kind === 'speaker'">
          <HosSelect v-model="form.maPlayerId" variant="settings" block>
            <option value="">{{ '选择播放器…' }}</option>
            <option v-for="player in maPlayers" :key="player.playerId" :value="player.playerId">
              {{ player.name }}{{ player.available ? '' : ' · 不可用' }}
            </option>
          </HosSelect>
          <p v-if="!maPlayers.length" class="dp-inline-hint">
            {{ '读不到播放器：先在「媒体与入库」填好 Music Assistant 地址与令牌并保存。' }}
          </p>
        </template>
        <template v-else>
          <HosSelect v-model="form.entityId" variant="settings" block :searchable="false">
            <option value="">{{ '选择电视 / Apple TV…' }}</option>
            <option v-for="item in entityOptions" :key="item.entityId" :value="item.entityId">
              {{ item.name }}{{ item.available ? '' : ' · 不在线' }} · {{ KIND_LABELS[item.kind] || item.kind }}
            </option>
          </HosSelect>
          <p v-if="!entityOptions.length" class="dp-inline-hint">
            {{ '没有可选的电视：先在上方把电视 / Apple TV 的类型确认好。' }}
          </p>
        </template>
      </div>
    </div>

    <div class="dp-form-actions">
      <button type="button" class="settings-btn-accent" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : editing ? '保存修改' : '保存默认设备' }}
      </button>
      <button v-if="editing" type="button" class="settings-btn-ghost" @click="cancelEdit">{{ '取消编辑' }}</button>
      <span v-if="rows.length" class="dp-form-actions__status">
        <span class="dp-form-actions__dot" />
        {{ `已配置 ${rows.length} 条` }}
      </span>
    </div>

    <ul v-if="rows.length" class="dp-defaults">
      <li v-for="row in rows" :key="row.id" class="dp-default">
        <span class="dp-default__orb" aria-hidden="true">
          <component :is="row.kind === 'speaker' ? Speaker : Tv" />
        </span>

        <div class="dp-default__main">
          <p class="dp-default__room">{{ areaLabel(row.areaId) }}</p>
          <p class="dp-default__meta">
            <span>{{ KIND_LABELS[row.kind] || row.kind }}</span>
            <span class="dp-default__id" :title="row.entityId || row.maPlayerId">
              {{ row.entityId || row.maPlayerId || '目标缺失' }}
            </span>
          </p>
        </div>

        <span
          class="dp-default__target"
          :class="{ 'dp-default__target--off': !row.available }"
          :title="row.available ? row.name : '目标当前不可用：检查设备是否在线或类型是否已确认'"
        >
          <span class="dp-default__dot" />
          <span class="dp-default__target-name">
            {{ row.available ? row.name || '未命名目标' : `${row.name || '目标缺失'} · 不可用` }}
          </span>
        </span>

        <div class="dp-default__actions">
          <button type="button" class="settings-btn-ghost settings-btn--sm" @click="startEdit(row)">
            <Pencil class="w-3.5 h-3.5" />
            {{ '编辑' }}
          </button>
          <button
            type="button"
            class="settings-btn-ghost settings-btn--sm dp-btn-delete"
            :disabled="deleting === row.id"
            @click="remove(row)"
          >
            <Trash class="w-3.5 h-3.5" />
            {{ '删除' }}
          </button>
        </div>
      </li>
    </ul>

    <div v-else class="dp-empty">
      <span class="dp-empty__icon" aria-hidden="true"><Speaker /></span>
      <div class="dp-empty__body">
        <p class="dp-empty__title">{{ '还没有配置房间默认设备' }}</p>
        <p class="dp-empty__desc">
          {{ '配置后，语音点歌与「在电视上打开某个应用」才不需要每次指定房间。' }}
        </p>
      </div>
    </div>
  </SettingsCard>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Pencil, Speaker, Trash, Tv } from '@lucide/vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { useChromeStore } from '@/stores/chrome.store'
import {
  deleteDeviceProfileDefault,
  listDeviceProfileDefaults,
  setDeviceProfileDefault,
} from '@/services/api/device-profiles'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'

const props = defineProps({
  areas: { type: Array, default: () => [] },
  maPlayers: { type: Array, default: () => [] },
  /** 画像列表：电视 / Apple TV 候选与"不在线"标注都取它 */
  profiles: { type: Array, default: () => [] },
})

/** 房间默认设备只支持这三类：音箱走 MA 播放器，电视 / Apple TV 走实体 */
const DEFAULT_MEDIA_KINDS = ['speaker', 'apple_tv', 'tv']
const KIND_LABELS = { speaker: '音箱', apple_tv: 'Apple TV', tv: '电视' }

const chrome = useChromeStore()
const rows = ref([])
const saving = ref(false)
const deleting = ref('')
const editing = ref(null)
const form = reactive({ areaId: '', kind: 'speaker', maPlayerId: '', entityId: '' })

const entityOptions = computed(() =>
  props.profiles.filter(
    (item) => item.domain === 'media_player' && item.kind !== 'speaker' && item.kind !== 'receiver',
  ),
)

function areaLabel(areaId) {
  return props.areas.find((item) => item.areaId === areaId)?.name || areaId
}

async function load() {
  try {
    const { data } = await listDeviceProfileDefaults()
    rows.value = data?.items || []
  } catch {
    rows.value = []
  }
  if (!form.areaId) form.areaId = props.areas[0]?.areaId || ''
}

/** 组装请求体；缺目标时提示并返回 null（后端要求 entityId / maPlayerId 恰好一个）。 */
function buildPayload() {
  const payload = { areaId: form.areaId, kind: form.kind }
  if (form.kind === 'speaker') {
    if (!form.maPlayerId) {
      chrome.notify('先选择 Music Assistant 播放器', 'warning')
      return null
    }
    payload.maPlayerId = form.maPlayerId
    return payload
  }
  if (!form.entityId) {
    chrome.notify('先选择要用于开电视的实体', 'warning')
    return null
  }
  payload.entityId = form.entityId
  return payload
}

async function save() {
  if (!form.areaId) {
    chrome.notify('先选择房间（没有房间请先去「房间配置」同步 HA 区域）', 'warning')
    return
  }
  const payload = buildPayload()
  if (!payload) return
  saving.value = true
  try {
    await setDeviceProfileDefault(payload)
    chrome.notify(`已保存 ${areaLabel(form.areaId)} 的默认${KIND_LABELS[form.kind] || '设备'}`, 'success')
    cancelEdit()
    await load()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '保存默认设备失败'), 'error')
  } finally {
    saving.value = false
  }
}

/** 编辑 = 把已有行填回表单；房间 / 用途锁定，避免误改出第二条。 */
function startEdit(row) {
  editing.value = row
  form.areaId = row.areaId
  form.kind = row.kind
  form.maPlayerId = row.maPlayerId || ''
  form.entityId = row.entityId || ''
}

function cancelEdit() {
  editing.value = null
  form.maPlayerId = ''
  form.entityId = ''
}

async function remove(row) {
  deleting.value = row.id
  try {
    await deleteDeviceProfileDefault(row.areaId, row.kind)
    if (editing.value?.id === row.id) cancelEdit()
    await load()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '删除失败'), 'error')
  } finally {
    deleting.value = ''
  }
}

watch(
  () => props.areas.length,
  () => {
    if (!form.areaId) form.areaId = props.areas[0]?.areaId || ''
  },
)

onMounted(load)
</script>
