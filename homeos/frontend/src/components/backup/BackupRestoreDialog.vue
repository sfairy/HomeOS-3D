<!--
组件：BackupRestoreDialog.vue
职责：对齐 HA Bridge 0.7.1「备份与恢复」弹窗（创建 / 恢复双 Tab、密码加密 .habackup）。
-->
<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
  <dialog
    ref="dialogRef"
    class="hos-backup-dialog"
    aria-labelledby="hos-backup-title"
    @cancel="onCancel"
    @close="onClose"
  >
    <div class="hos-backup-dialog__heading">
      <div>
        <span>BACKUP &amp; RESTORE</span>
        <h2 id="hos-backup-title">备份与恢复</h2>
      </div>
      <button
        type="button"
        class="hos-backup-dialog__close"
        aria-label="关闭备份与恢复"
        :disabled="busy"
        @click="close"
      >
        ×
      </button>
    </div>

    <div class="hos-backup-dialog__body">
      <div class="hos-backup-dialog__guide">
        <p>备份已保存的 HA 连接（含 Token）、仪表盘、户型和素材，不含账号及激活密钥。</p>
        <p>请先登录并激活，恢复保留当前账号和授权。</p>
        <p>备份使用密码加密，密码遗失无法恢复。低版本程序不能恢复高版本备份。</p>
        <p>恢复会覆盖业务数据，自动保留本机回退副本，中控需重新配对。</p>
      </div>

      <div class="hos-backup-dialog__tabs" role="tablist" aria-label="备份或恢复">
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'export' }"
          :aria-selected="tab === 'export'"
          :disabled="busy"
          @click="switchTab('export')"
        >
          创建备份
        </button>
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'restore' }"
          :aria-selected="tab === 'restore'"
          :disabled="busy"
          @click="switchTab('restore')"
        >
          恢复备份
        </button>
      </div>

      <form v-show="tab === 'export'" class="hos-backup-dialog__form" @submit.prevent="runExport">
        <label>
          备份密码
          <input
            v-model="exportPassword"
            type="password"
            required
            minlength="8"
            maxlength="128"
            autocomplete="new-password"
            placeholder="至少 8 个字符"
            :disabled="busy"
          />
        </label>
        <label>
          确认备份密码
          <input
            v-model="exportPasswordConfirm"
            type="password"
            required
            minlength="8"
            maxlength="128"
            autocomplete="new-password"
            placeholder="再次输入备份密码"
            :disabled="busy"
          />
        </label>
        <small>请先保存编辑器修改。备份文件上限 512 MB。</small>
        <div class="hos-backup-dialog__actions">
          <button type="submit" class="primary" :disabled="busy">下载加密备份</button>
        </div>
      </form>

      <form
        v-show="tab === 'restore' && !ticket"
        class="hos-backup-dialog__form"
        @submit.prevent="runInspect"
      >
        <label>
          备份文件
          <input
            ref="fileInputRef"
            type="file"
            accept=".habackup"
            required
            :disabled="busy"
            @change="onFileChange"
          />
        </label>
        <label>
          备份密码
          <input
            v-model="restorePassword"
            type="password"
            required
            minlength="8"
            maxlength="128"
            autocomplete="off"
            placeholder="输入创建此备份时设置的密码"
            :disabled="busy"
            @input="invalidateTicket"
          />
        </label>
        <div class="hos-backup-dialog__actions">
          <button type="submit" :disabled="busy">检查备份文件</button>
        </div>
      </form>

      <form
        v-show="tab === 'restore' && !!ticket"
        class="hos-backup-dialog__form"
        @submit.prevent="runRestore"
      >
        <div class="hos-backup-dialog__preview">{{ preview }}</div>
        <label>
          当前管理员密码
          <input
            v-model="adminPassword"
            type="password"
            required
            maxlength="128"
            autocomplete="current-password"
            placeholder="输入当前安装的登录密码"
            :disabled="busy"
          />
        </label>
        <label class="hos-backup-dialog__confirm">
          <input v-model="confirmOverwrite" type="checkbox" required :disabled="busy" />
          <span>已了解：恢复会覆盖业务数据及未保存修改，中控需重新配对。</span>
        </label>
        <div class="hos-backup-dialog__actions">
          <button type="submit" class="primary" :disabled="busy || !confirmOverwrite">
            确认覆盖并恢复
          </button>
        </div>
      </form>

      <p
        v-if="message"
        class="hos-backup-dialog__message"
        :class="messageTone"
        role="status"
        aria-live="polite"
      >
        {{ message }}
      </p>
    </div>
  </dialog>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import {
  cancelEncryptedBackupJob,
  exportEncryptedBusinessBackup,
  inspectEncryptedBusinessBackup,
  restoreEncryptedBusinessBackup,
} from '@/services/api/backups'
import { downloadBlob } from '@/utils/core/misc.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

const props = defineProps({
  /** 未保存/保存中时禁止导出；设置页默认允许。 */
  canExport: {
    type: Function,
    default: null,
  },
})

const MAX_BACKUP_BYTES = 512 * 1024 * 1024

const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending
const dialogRef = ref(null)
const fileInputRef = ref(null)
const tab = ref('export')
const busy = ref(false)
const message = ref('')
const messageTone = ref('')
const exportPassword = ref('')
const exportPasswordConfirm = ref('')
const restorePassword = ref('')
const adminPassword = ref('')
const confirmOverwrite = ref(false)
const file = ref(null)
const ticket = ref('')
const preview = ref('')
let generation = 0

function setMessage(text, tone = '') {
  message.value = text
  messageTone.value = tone
}

async function clearTicket() {
  const current = ticket.value
  ticket.value = ''
  preview.value = ''
  confirmOverwrite.value = false
  adminPassword.value = ''
  if (current) {
    try {
      await cancelEncryptedBackupJob(current)
    } catch {
      /* ignore */
    }
  }
}

async function invalidateTicket() {
  if (busy.value) return
  await clearTicket()
  setMessage('')
}

async function switchTab(next) {
  if (busy.value || tab.value === next) return
  await clearTicket()
  tab.value = next
  setMessage('')
}

function onFileChange(event) {
  file.value = event?.target?.files?.[0] || null
  void invalidateTicket()
}

function onCancel(event) {
  if (busy.value) event.preventDefault()
}

async function onClose() {
  generation += 1
  await clearTicket()
  exportPassword.value = ''
  exportPasswordConfirm.value = ''
  restorePassword.value = ''
  file.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
  setMessage('')
}

function open() {
  generation += 1
  tab.value = 'export'
  setMessage('')
  dialogRef.value?.showModal()
}

function close() {
  if (!busy.value) dialogRef.value?.close()
}

async function runExport() {
  if (busy.value) return
  if (typeof props.canExport === 'function' && !props.canExport()) {
    return setMessage(
      '当前有未保存或正在保存的修改，请先关闭窗口并保存，再创建备份。',
      'error',
    )
  }
  if (exportPassword.value.length < 8) {
    return setMessage('备份密码至少 8 个字符。', 'error')
  }
  if (exportPassword.value !== exportPasswordConfirm.value) {
    return setMessage('两次输入的备份密码不一致。', 'error')
  }
  busy.value = true
  setMessage('正在加密备份，请稍候…')
  try {
    const response = await exportEncryptedBusinessBackup(exportPassword.value)
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data])
    if (blob.type?.includes('application/json') || blob.size < 256) {
      try {
        const text = await blob.text()
        const payload = JSON.parse(text)
        throw new Error(payload?.detail || payload?.message || '加密备份失败')
      } catch (error) {
        if (error instanceof SyntaxError) {
          /* treat as binary */
        } else {
          throw error
        }
      }
    }
    const disposition = response.headers?.['content-disposition'] || ''
    const matched = String(disposition).match(/filename="?([^";]+)"?/)
    downloadBlob(blob, matched?.[1] || 'HomeOS.habackup')
    exportPassword.value = ''
    exportPasswordConfirm.value = ''
    setMessage('备份已生成并开始下载，请妥善保存文件和备份密码。', 'success')
  } catch (error) {
    setMessage(getApiErrorMessage(error, '加密备份失败'), 'error')
  } finally {
    busy.value = false
  }
}

async function runInspect() {
  if (busy.value) return
  if (!file.value) return setMessage('请选择备份文件。', 'error')
  if (file.value.size > MAX_BACKUP_BYTES) {
    return setMessage('备份文件不能超过 512 MB。', 'error')
  }
  if (restorePassword.value.length < 8) {
    return setMessage('请输入创建此备份时设置的密码。', 'error')
  }
  busy.value = true
  const requestGeneration = generation
  setMessage('正在解密并检查备份，当前数据不会修改…')
  try {
    await clearTicket()
    const { data } = await inspectEncryptedBusinessBackup(file.value, restorePassword.value)
    if (requestGeneration !== generation || !dialogRef.value?.open) {
      await clearTicket()
      return
    }
    ticket.value = data.ticket || ''
    const created = data.createdAt ? new Date(data.createdAt) : null
    const expiresMinutes = Math.max(
      1,
      Math.round(Number(data.expiresIn || 600) / 60),
    )
    preview.value = [
      `HomeOS ${data.version || ''} · ${
        created && !Number.isNaN(created.getTime()) ? created.toLocaleString() : data.createdAt || ''
      }`,
      `${data.projects || 0} 个仪表盘 · ${data.connections || 0} 个 HA 连接 · ${data.files || 0} 个文件 · ${data.pairings || 0} 个中控配置`,
    ].join('\n')
    restorePassword.value = ''
    setMessage(
      `检查通过。请在 ${expiresMinutes} 分钟内确认恢复；当前业务数据将被整体覆盖。`,
      'success',
    )
  } catch (error) {
    setMessage(getApiErrorMessage(error, '检查备份失败'), 'error')
  } finally {
    busy.value = false
  }
}

async function runRestore() {
  if (busy.value || !ticket.value || !confirmOverwrite.value) return
  busy.value = true
  setMessage('正在恢复业务数据，请保持窗口打开并等待完成…')
  try {
    await restoreEncryptedBusinessBackup({
      ticket: ticket.value,
      adminPassword: adminPassword.value,
      confirm: true,
    })
    ticket.value = ''
    setMessage('恢复完成，正在重新加载。中控设备请重新配对。', 'success')
    window.location.reload()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '恢复失败'), 'error')
    busy.value = false
  }
}

defineExpose({ open, close })
</script>

<style scoped>
.hos-backup-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(620px, calc(100vw - 40px));
  height: fit-content;
  max-height: calc(100dvh - 40px);
  padding: 0;
  border: 1px solid #3a444c;
  border-radius: 9px;
  color: #e8ecef;
  background: #1a2026;
  box-shadow: 0 30px 100px #00000094;
}
.hos-backup-dialog::backdrop {
  background: #05080bb8;
  backdrop-filter: blur(4px);
}
.hos-backup-dialog__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #303840;
  background: #171d22;
}
.hos-backup-dialog__heading span {
  color: #f2a20d;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.15em;
}
.hos-backup-dialog__heading h2 {
  margin: 5px 0 0;
  font-size: 16px;
  font-weight: 700;
}
.hos-backup-dialog__close {
  width: 32px;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #e8ecef;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
}
.hos-backup-dialog__close:hover {
  background: #ffffff12;
}
.hos-backup-dialog__body {
  max-height: calc(100dvh - 130px);
  overflow-y: auto;
  padding: 20px;
}
.hos-backup-dialog__guide {
  color: #89949d;
  font-size: 11px;
  line-height: 1.7;
}
.hos-backup-dialog__guide p {
  margin: 0 0 7px;
}
.hos-backup-dialog__tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  margin-top: 16px;
  padding: 3px;
  border: 1px solid #343d45;
  border-radius: 4px;
  background: #171d22;
}
.hos-backup-dialog__tabs button {
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 3px;
  color: #7f8a91;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}
.hos-backup-dialog__tabs button:hover {
  color: #dce2e6;
  background: #ffffff0b;
}
.hos-backup-dialog__tabs button.active {
  color: #fff4dc;
  background: #f2a20d29;
  box-shadow: inset 0 0 0 1px #f2a20d7a;
}
.hos-backup-dialog__form {
  display: grid;
  gap: 15px;
  padding: 18px 0 0;
}
.hos-backup-dialog__form label {
  display: grid;
  gap: 7px;
  color: #b7c0c6;
  font-size: 11px;
}
.hos-backup-dialog__form input:not([type='checkbox']) {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid #39434c;
  border-radius: 5px;
  outline: none;
  color: #edf0f2;
  background: #11171c;
  font-size: 12px;
}
.hos-backup-dialog__form input[type='file'] {
  height: auto;
  padding: 8px;
}
.hos-backup-dialog__form input:not([type='checkbox']):focus {
  border-color: #f2a20d;
  box-shadow: 0 0 0 3px rgba(242, 162, 13, 0.12);
}
.hos-backup-dialog__form small {
  color: #89949d;
  font-size: 11px;
}
.hos-backup-dialog__confirm {
  display: flex !important;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.6;
}
.hos-backup-dialog__confirm input {
  flex: none;
  margin: 3px 0 0;
}
.hos-backup-dialog__preview {
  padding: 10px 12px;
  border: 1px solid #35404a;
  border-radius: 5px;
  color: #aeb8bf;
  background: #151b20;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.hos-backup-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.hos-backup-dialog__actions button {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #39434c;
  border-radius: 5px;
  color: #e8ecef;
  background: #232b33;
  font-size: 12px;
  cursor: pointer;
}
.hos-backup-dialog__actions button.primary {
  border-color: #f2a20d;
  color: #1a1204;
  background: #f2a20d;
  font-weight: 700;
}
.hos-backup-dialog__actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.hos-backup-dialog__message {
  margin: 14px 0 0;
  padding: 10px 12px;
  border: 1px solid #35404a;
  border-radius: 5px;
  color: #aeb8bf;
  background: #151b20;
  font-size: 11px;
  line-height: 1.5;
}
.hos-backup-dialog__message.success {
  border-color: #54bd7859;
  color: #91d7a9;
  background: #54bd7812;
}
.hos-backup-dialog__message.error {
  border-color: #e26b6761;
  color: #f1a7a4;
  background: #e26b6712;
}
</style>
