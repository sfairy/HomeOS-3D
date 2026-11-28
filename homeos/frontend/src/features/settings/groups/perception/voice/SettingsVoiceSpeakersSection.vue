<!--
  语音终端接入区段：配对码 → 已终端列表（唤醒词权限 / 默认推送接收人 / 吊销）。

  这里的「终端」是**能自己发 HTTP 请求的设备**（ESP32 / 自研网关 / 树莓派），
  不是小米、天猫这类成品音箱：后者只会连厂商云，无法把语音发到本机。成品音箱
  仍然可以当播报喇叭用（「播报输出」），这两件事别混。

  口径（对齐参考实现的管理端）：
  - 配对码只在生成那一次显示，10 分钟有效；不落任何前端存储。
  - 权限与接收人都是**逐台**终端的：可以一个有加词权限、一个没有。
  - 「默认推送接收人」为空 = 语音里说「发到手机上」就推给发言人本人。
-->
<template>
  <div class="settings-hub-section voice-speakers">
    <SettingsCard static>
      <SettingsSectionHead
        title="语音终端接入"
        description="给能主动访问本机的语音终端（ESP32 / 自研网关 / 树莓派）发配对码。小米、天猫等成品音箱不在此列 —— 它们只连厂商云，请改用「播报输出」当喇叭。"
      />

      <div class="vs-actions">
        <button type="button" class="vs-btn vs-btn--primary" :disabled="pairing" @click="createCode">
          {{ pairing ? '生成中…' : pendingCode ? '重新生成配对码' : '生成配对码' }}
        </button>
        <button v-if="devices.length" type="button" class="vs-btn" :disabled="loading" @click="load">
          刷新
        </button>
      </div>

      <div v-if="pendingCode" class="vs-code">
        <div class="vs-code__head">
          <span class="vs-code__label">一次性配对码</span>
          <span class="vs-code__badge" :class="{ 'vs-code__badge--expired': codeExpired }">
            {{ codeExpired ? '已失效，请重新生成' : expiryText }}
          </span>
        </div>

        <div class="vs-code__value-row">
          <code class="vs-code__value">{{ pendingCode.pairingCode }}</code>
          <button
            type="button"
            class="vs-btn vs-code__copy"
            :disabled="codeExpired"
            @click="copyCode"
          >
            {{ copyLabel }}
          </button>
        </div>

        <ol class="vs-steps">
          <li>把这个码填到语音终端（ESP32 / 网关）的配置里。</li>
          <li>终端调 <code>POST /agent/voice-devices/pair</code> 换设备凭证。</li>
          <li>配对成功后本列表会自动出现这台终端。</li>
        </ol>

        <div class="vs-code__foot">
          <button
            type="button"
            class="vs-btn vs-btn--ghost"
            :disabled="simulating || codeExpired"
            @click="simulatePairing"
          >
            {{ simulating ? '模拟中…' : '没有硬件？本机模拟配对' }}
          </button>
          <span class="vs-hint">仅调试用：会创建一条真实授权，测完点「吊销」清掉。</span>
        </div>
        <p v-if="simulateTip" class="vs-note vs-note--ok">{{ simulateTip }}</p>
      </div>

      <p v-if="error" class="vs-error">{{ error }}</p>

      <div v-if="!devices.length && !loading" class="vs-empty">暂无已接入的语音终端。</div>

      <ul v-else class="vs-list">
        <li v-for="device in devices" :key="device.id" class="vs-item">
          <div class="vs-item__head">
            <div>
              <div class="vs-item__title">{{ device.voiceDeviceId || '未命名终端' }}</div>
              <div class="vs-item__meta">
                网关 {{ device.voiceGatewayId || '—' }} · 成员 {{ device.memberName || '—' }}
                <span v-if="device.lastUsedAt"> · 最近使用 {{ formatTime(device.lastUsedAt) }}</span>
              </div>
            </div>
            <button type="button" class="vs-btn vs-btn--danger" @click="revoke(device)">吊销</button>
          </div>

          <label class="vs-field" :class="{ 'vs-field--muted': wakeSource !== 'gateway' }">
            <input
              type="checkbox"
              :checked="device.allowVoiceWakeWordAdd"
              :disabled="wakeSource !== 'gateway'"
              @change="toggleWakeWord(device, ($event.target as HTMLInputElement).checked)"
            />
            <span>允许这台终端通过语音添加唤醒词</span>
          </label>
          <p v-if="wakeSource !== 'gateway'" class="vs-hint">
            需要先配置语音网关：语音加词要以网关返回的词表为准，否则确认后也无法落地。
          </p>

          <!--
            默认接收人只在「有多个账号」时才有意义：单账号下候选人只有一个，勾不勾都是
            同一个自己，这块 UI 只是噪音。多账号（后续一期）加进来后自动重新出现。
          -->
          <div v-if="members.length > 1" class="vs-field vs-field--stack">
            <span class="vs-field__label">默认手机推送接收人</span>
            <div class="vs-members">
              <label v-for="member in members" :key="member.id" class="vs-member">
                <input
                  type="checkbox"
                  :checked="device.notifyMemberIds.includes(member.id)"
                  @change="toggleMember(device, member.id, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ member.displayName || member.username }}</span>
              </label>
            </div>
            <p class="vs-hint">
              不勾选时，语音里说「发到手机上」会推给说话的那位成员本人。
            </p>
          </div>
          <p v-else class="vs-hint">
            本机只有一个账号，语音里说「发到手机上」会直接推给这个账号的设备。
          </p>
        </li>
      </ul>
    </SettingsCard>

    <!--
      唤醒词：真源在语音网关，本机只是镜像。
      网关未配置（503）时不显示编辑框 —— 在这里写只会改到镜像、和网关越走越远，
      此时唤醒词仍然在「语音交互 → 唤醒词」里编辑（那是本机保存路径）。
    -->
    <SettingsCard static class="vs-wake">
      <SettingsSectionHead
        title="唤醒词"
        description="词表由语音网关识别，这里修改会直接同步到网关。"
      />
      <template v-if="wakeSource === 'gateway'">
        <p class="vs-hint">
          已使用 {{ wakeWords.length }} / 10 个唤醒词 · 版本 {{ wakeVersion }}
        </p>
        <textarea
          v-model="wakeText"
          class="vs-textarea"
          rows="2"
          placeholder="用逗号或空格分隔，每个最多 20 个字符"
        />
        <div class="vs-actions">
          <button type="button" class="vs-btn vs-btn--primary" :disabled="wakeSaving" @click="saveWakeWords">
            {{ wakeSaving ? '保存中…' : '保存到网关' }}
          </button>
          <button type="button" class="vs-btn" :disabled="wakeSaving" @click="reloadWakeWords">
            重新读取
          </button>
          <span v-if="wakeTip" class="vs-hint">{{ wakeTip }}</span>
        </div>
        <p v-if="wakeError" class="vs-error">{{ wakeError }}</p>
      </template>
      <p v-else class="vs-hint">
        语音网关未配置，当前词表只保存在本机。请在「语音交互」把交互方式设为「唤醒词」后，
        在同页「唤醒词」里编辑；配好网关后这块会改为直接写网关。
      </p>
    </SettingsCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SettingsCard from '@/features/settings/shell/SettingsCard.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import {
  createVoicePairing,
  fetchHouseholdMembers,
  fetchVoiceDevices,
  fetchWakeWords,
  pairVoiceDevice,
  replaceWakeWords,
  revokeVoiceDevice,
  setVoiceNotifyMembers,
  setVoiceWakeWordPermission,
  type HouseholdMember,
  type VoiceDeviceGrant,
  type VoicePairingCode,
} from '@/domain/api/voice-devices'
import { getApiErrorMessage } from '@/kernel/core/error-message'
import { logger } from '@/kernel/core/logger'
import './settings-voice-speakers-section.css'

/** 「本机模拟配对」用的假终端 id：固定值便于在列表里一眼认出并吊销。 */
const SIMULATE_GATEWAY_ID = 'gw-local-test'
const SIMULATE_DEVICE_ID = 'spk-local-test'

const devices = ref<VoiceDeviceGrant[]>([])
const members = ref<HouseholdMember[]>([])
const pendingCode = ref<VoicePairingCode | null>(null)
const loading = ref(false)
const pairing = ref(false)
const error = ref('')
const simulating = ref(false)
const simulateTip = ref('')
/** 每秒推进一次：配对码的剩余时间要真的在走，否则「10 分钟后失效」是句死文案。 */
const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
/** 生成配对码后轮询设备列表的定时器（配对成功即停）。 */
let pairPollTimer: ReturnType<typeof setInterval> | null = null

const codeExpired = computed(() => {
  const expiresAt = pendingCode.value?.expiresAt
  if (!expiresAt) return false
  const ts = new Date(expiresAt).getTime()
  return Number.isFinite(ts) && ts <= now.value
})

const expiryText = computed(() => {
  const expiresAt = pendingCode.value?.expiresAt
  if (!expiresAt) return '10 分钟内'
  const ts = new Date(expiresAt).getTime()
  if (!Number.isFinite(ts)) return '10 分钟内'
  const left = Math.floor((ts - now.value) / 1000)
  if (left <= 0) return '已过期'
  const minutes = Math.floor(left / 60)
  const seconds = left % 60
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒后失效` : `${seconds} 秒后失效`
})

function stopPairPolling() {
  if (pairPollTimer !== null) {
    clearInterval(pairPollTimer)
    pairPollTimer = null
  }
}

/**
 * 生成配对码后开始轮询。
 *
 * 配对发生在**终端侧**，本页收不到任何事件；不轮询的话用户配完盯着「暂无已接入的终端」
 * 会以为失败了，只能自己刷新页面。用 `pendingCode.id` 匹配 —— `pair` 消费的是同一行，
 * 配对成功后 grant id 不变。
 */
function startPairPolling() {
  stopPairPolling()
  pairPollTimer = setInterval(async () => {
    const code = pendingCode.value
    if (!code) {
      stopPairPolling()
      return
    }
    if (codeExpired.value) {
      stopPairPolling()
      return
    }
    try {
      const res = await fetchVoiceDevices()
      const list: VoiceDeviceGrant[] = Array.isArray(res.data) ? res.data : []
      if (list.some((item) => item.id === code.id)) {
        devices.value = list
        pendingCode.value = null
        stopPairPolling()
      }
    } catch {
      // 轮询失败不打扰用户：下一轮再试，真正的错误留给「刷新」按钮暴露。
    }
  }, 4000)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [deviceRes, memberRes] = await Promise.all([fetchVoiceDevices(), fetchHouseholdMembers()])
    devices.value = Array.isArray(deviceRes.data) ? deviceRes.data : []
    members.value = Array.isArray(memberRes.data)
      ? memberRes.data.filter((item: HouseholdMember) => item.isActive !== false)
      : []
    await reloadWakeWords()
  } catch (err) {
    error.value = getApiErrorMessage(err, '语音终端列表加载失败')
    logger.warn('语音终端列表加载失败', err)
  } finally {
    loading.value = false
  }
}

async function createCode() {
  pairing.value = true
  simulateTip.value = ''
  error.value = ''
  try {
    const res = await createVoicePairing()
    pendingCode.value = res.data
    startPairPolling()
  } catch (err) {
    error.value = getApiErrorMessage(err, '配对码生成失败')
  } finally {
    pairing.value = false
  }
}

/** 复制按钮的临时文案：显示 1.5 秒后回到「复制」，避免在布局里多塞一行提示。 */
const copyLabel = ref('复制')
let copyTimer: ReturnType<typeof setTimeout> | null = null

function flashCopyLabel(text: string) {
  copyLabel.value = text
  if (copyTimer !== null) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyLabel.value = '复制'
    copyTimer = null
  }, 1500)
}

async function copyCode() {
  const code = pendingCode.value?.pairingCode
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    flashCopyLabel('已复制')
  } catch {
    // 剪贴板在非安全上下文不可用：让用户手动选中即可，不当作错误
    // （码本身设了 `user-select: all`，点一下就整段选中）。
    flashCopyLabel('请手动复制')
  }
}

/**
 * 本机模拟配对：用当前配对码当场兑换一次，验证「发码 → 换凭证 → 列表出现」整条链路。
 *
 * 走的是**真实**接口，创建的是一条**真实**的设备授权（它会出现在列表里、可以调
 * `/voice-chat`、也可以点「吊销」清掉）。所以它不是 mock，只是替你在本机扮演了
 * 那台还不存在的终端 —— 用假 id（`gw-local-test` / `spk-local-test`）便于识别和清理。
 */
async function simulatePairing() {
  const code = pendingCode.value?.pairingCode
  if (!code || codeExpired.value) return
  simulating.value = true
  simulateTip.value = ''
  error.value = ''
  try {
    await pairVoiceDevice(code, SIMULATE_GATEWAY_ID, SIMULATE_DEVICE_ID)
    simulateTip.value = '兑换成功，已创建一条真实授权。列表刷新后可在下方看到并吊销。'
    pendingCode.value = null
    stopPairPolling()
    await load()
  } catch (err) {
    error.value = getApiErrorMessage(err, '模拟配对失败')
  } finally {
    simulating.value = false
  }
}

async function toggleWakeWord(device: VoiceDeviceGrant, allowed: boolean) {
  try {
    await setVoiceWakeWordPermission(device.id, allowed)
    device.allowVoiceWakeWordAdd = allowed
  } catch (err) {
    error.value = getApiErrorMessage(err, '权限保存失败')
    await load()
  }
}

async function toggleMember(device: VoiceDeviceGrant, memberId: string, checked: boolean) {
  const next = checked
    ? [...new Set([...device.notifyMemberIds, memberId])]
    : device.notifyMemberIds.filter((id) => id !== memberId)
  try {
    const res = await setVoiceNotifyMembers(device.id, next)
    device.notifyMemberIds = res.data.notifyMemberIds
  } catch (err) {
    error.value = getApiErrorMessage(err, '接收人保存失败')
    await load()
  }
}

async function revoke(device: VoiceDeviceGrant) {
  try {
    await revokeVoiceDevice(device.id)
    devices.value = devices.value.filter((item) => item.id !== device.id)
  } catch (err) {
    error.value = getApiErrorMessage(err, '吊销失败')
  }
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

onMounted(() => {
  now.value = Date.now()
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  void load()
})

onUnmounted(() => {
  if (clockTimer !== null) {
    clearInterval(clockTimer)
    clockTimer = null
  }
  if (copyTimer !== null) {
    clearTimeout(copyTimer)
    copyTimer = null
  }
  stopPairPolling()
})

// ── 唤醒词（网关为真源）────────────────────────────────────
const wakeWords = ref<string[]>([])
const wakeVersion = ref(0)
/** `gateway` = 直读网关；`local` = 网关未配置，只有本机镜像。 */
const wakeSource = ref<'local' | 'gateway'>('local')
const wakeText = ref('')
const wakeSaving = ref(false)
const wakeError = ref('')
const wakeTip = ref('')

function splitWords(text: string): string[] {
  return text
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function reloadWakeWords() {
  wakeError.value = ''
  wakeTip.value = ''
  try {
    const res = await fetchWakeWords()
    wakeWords.value = res.data.words || []
    wakeVersion.value = res.data.version || 0
    wakeSource.value = res.data.source === 'local' ? 'local' : 'gateway'
    wakeText.value = wakeWords.value.join('，')
  } catch (err) {
    // 读失败不改 `wakeSource`：上一次是网关就还是网关，只是这次没读到。
    wakeError.value = getApiErrorMessage(err, '唤醒词读取失败')
  }
}

async function saveWakeWords() {
  const words = splitWords(wakeText.value)
  if (!words.length) {
    wakeError.value = '至少保留一个唤醒词。'
    return
  }
  wakeSaving.value = true
  wakeError.value = ''
  wakeTip.value = ''
  try {
    // 带 expectedVersion：期间别处改过词表时服务端返回 409，提示刷新而不是覆盖。
    const res = await replaceWakeWords(words, wakeVersion.value)
    wakeWords.value = res.data.words || []
    wakeVersion.value = res.data.version || 0
    wakeText.value = wakeWords.value.join('，')
    wakeTip.value = '已保存到网关'
  } catch (err) {
    wakeError.value = getApiErrorMessage(err, '唤醒词保存失败')
    // 409 = 词表已被别处修改：重新读一次，让用户看到最新版本再决定。
    if (String((err as { apiErrorCode?: string })?.apiErrorCode || '').includes('CONFLICT')) {
      await reloadWakeWords()
    }
  } finally {
    wakeSaving.value = false
  }
}
</script>
