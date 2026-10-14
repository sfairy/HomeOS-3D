<!--
  档案「备份与恢复」区段（系统设置内唯一入口）。统一全量备份（含数据库）：
  导出/还原加密备份包（.habackup）、服务器全量快照管理、定时自动备份状态。
  数据由 useProfilesSection 注入。
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="backupFlowSteps"
        class="pb-flow-band"
        band-class="pb-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="备份流程"
        :collapsed-summary="backupFlowSummary"
      />

      <div class="settings-note-box mt-2.5 pb-note-box">
        <p class="text-[12px] pb-c-text">
          {{
            '全量备份（含数据库）—— 一键打包整库业务数据（账号、授权、HA 连接与密钥、仪表盘、户型、系统参数）与 data 目录（含素材、3D 场景）。不含操作日志与历史事件数据。适合换机、升级与回滚，还原为原样整体覆盖。'
          }}
        </p>

        <div class="pb-auto-backup">
          <div class="pb-auto-backup__row">
            <div class="pb-auto-backup__info">
              <p class="pb-auto-backup__title">
                <Clock class="w-3.5 h-3.5" /> {{ '定时自动备份' }}
              </p>
              <p class="pb-auto-backup__desc">
                {{
                  '每天 02:30（北京时间）在服务器 backups/ 目录生成全量备份包（含数据库）。超出保留天数的历史包会自动删除。'
                }}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="autoBackup.enabled"
              :aria-label="autoBackup.enabled ? '关闭定时自动备份' : '开启定时自动备份'"
              class="pb-auto-switch"
              :class="{ 'pb-auto-switch--on': autoBackup.enabled }"
              :disabled="autoBackupSaving || autoBackupLoading"
              @click="toggleAutoBackup"
            >
              <span class="pb-auto-switch__knob" />
            </button>
          </div>

          <div v-if="autoBackupLoading" class="profiles-inline-loading">
            <Loader2 class="w-3 h-3 animate-spin shrink-0" />
            <span>{{ '加载自动备份状态…' }}</span>
          </div>
          <div v-else-if="autoBackup.enabled" class="pb-auto-backup__meta">
            <span class="pb-auto-backup__meta-item">
              <span class="pb-auto-backup__meta-label">{{ '保留' }}</span>
              <HosSelect
                :model-value="retainDaysDraft"
                variant="inline"
                class="pb-auto-backup__select"
                :disabled="autoBackupSaving"
                @update:model-value="onRetainDaysChange"
              >
                <option
                  v-for="opt in AUTO_BACKUP_RETAIN_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </HosSelect>
            </span>
            <span class="pb-auto-backup__meta-item">
              <span class="pb-auto-backup__meta-label">{{ '上次执行' }}</span>
              {{ formatBackupTime(autoBackup.lastRunAt) }}
            </span>
            <span class="pb-auto-backup__meta-item">
              <span class="pb-auto-backup__meta-label">{{ '下次执行' }}</span>
              {{ formatBackupTime(autoBackup.nextRunAt) }}
            </span>
            <span
              v-if="autoBackup.lastError"
              class="pb-auto-backup__meta-item pb-auto-backup__meta-item--error"
              :title="autoBackup.lastError"
            >
              <span class="pb-auto-backup__meta-label">{{ '上次失败' }}</span>
              {{ autoBackup.lastError }}
            </span>
          </div>
        </div>

        <div class="pb-bundle-group__actions">
          <button type="button" class="settings-btn-accent text-xs" @click="openEncryptedBackupDialog">
            <Archive class="w-3.5 h-3.5" />
            {{ '打开备份与恢复' }}
          </button>
          <button
            type="button"
            class="settings-btn-ghost text-xs"
            :disabled="backupRunNowLoading || !!backupFileActionName"
            @click="runBackupNow"
          >
            <Loader2 v-if="backupRunNowLoading" class="w-3.5 h-3.5 animate-spin" />
            <Save v-else class="w-3.5 h-3.5" />
            {{ '备份到服务器' }}
          </button>
        </div>
      </div>

      <div class="pb-server-files">
        <div class="pb-server-files__head">
          <p class="text-xs font-bold ps-label">
            {{ '服务器快照' }}
            <span v-if="backupFiles.length" class="ps-desc font-normal">· {{ backupFiles.length }}</span>
          </p>
          <button
            type="button"
            class="settings-btn-ghost text-[12px] py-1 px-2"
            :disabled="backupFilesLoading"
            @click="loadBackupFiles"
          >
            <Loader2 v-if="backupFilesLoading" class="w-3 h-3 animate-spin" />
            {{ '刷新' }}
          </button>
        </div>
        <div v-if="backupFilesLoading && !backupFiles.length" class="profiles-inline-loading">
          <Loader2 class="w-3 h-3 animate-spin shrink-0" />
          <span>{{ '加载备份列表…' }}</span>
        </div>
        <p v-else-if="!backupFiles.length" class="text-[12px] ps-desc">
          {{ '尚无快照；点击「备份到服务器」生成全量备份包。' }}
        </p>
        <ul v-else class="ps-file-list">
          <li v-for="file in backupFiles" :key="file.name" class="ps-file-row">
            <div class="ps-file-row__meta min-w-0">
              <p class="font-mono text-[12px] truncate ps-meta" :title="file.name">
                {{ file.name }}
              </p>
              <p class="text-[12px] ps-desc mt-0.5">
                {{ formatBackupTime(file.mtime) }} · {{ formatBackupSize(file.size) }}
              </p>
            </div>
            <div class="ps-file-row__actions">
              <button
                type="button"
                class="settings-btn-accent text-[12px] py-1 px-2"
                :disabled="!!backupFileActionName"
                @click="restoreBackupFile(file.name)"
              >
                <Loader2
                  v-if="backupFileActionName === file.name && backupFileActionKind === 'restore'"
                  class="w-3 h-3 animate-spin"
                />
                {{ '恢复' }}
              </button>
              <button
                type="button"
                class="settings-btn-ghost text-[12px] py-1 px-2"
                :disabled="!!backupFileActionName"
                @click="exportBackupFile(file.name)"
              >
                <Loader2
                  v-if="backupFileActionName === file.name && backupFileActionKind === 'export'"
                  class="w-3 h-3 animate-spin"
                />
                {{ '下载' }}
              </button>
              <button
                type="button"
                class="settings-btn-ghost text-[12px] py-1 px-2"
                :disabled="!!backupFileActionName"
                @click="deleteBackupFile(file.name)"
              >
                <Loader2
                  v-if="backupFileActionName === file.name && backupFileActionKind === 'delete'"
                  class="w-3 h-3 animate-spin"
                />
                {{ '删除' }}
              </button>
            </div>
          </li>
        </ul>
      </div>
    </SettingsCard>

    <BackupRestoreDialog ref="encryptedBackupDialogRef" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Upload, Loader2, Settings, Package, HardDrive, Save, Clock, Archive } from '@lucide/vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import BackupRestoreDialog from './BackupRestoreDialog.vue'
import { useProfilesSection } from './useProfilesSection'

const {
  backupRunNowLoading,
  backupFiles,
  backupFilesLoading,
  backupFileActionName,
  backupFileActionKind,
  autoBackup,
  autoBackupLoading,
  autoBackupSaving,
  toggleAutoBackup,
  setAutoBackupRetainDays,
  formatBackupTime,
  formatBackupSize,
  loadBackupFiles,
  runBackupNow,
  deleteBackupFile,
  restoreBackupFile,
  exportBackupFile,
} = useProfilesSection([
  'backupRunNowLoading',
  'backupFiles',
  'backupFilesLoading',
  'backupFileActionName',
  'backupFileActionKind',
  'autoBackup',
  'autoBackupLoading',
  'autoBackupSaving',
  'toggleAutoBackup',
  'setAutoBackupRetainDays',
  'formatBackupTime',
  'formatBackupSize',
  'loadBackupFiles',
  'runBackupNow',
  'deleteBackupFile',
  'restoreBackupFile',
  'exportBackupFile',
])

const retainDaysDraft = ref(7)
watch(
  () => autoBackup.value?.retainDays,
  (v) => {
    if (v && Number.isFinite(v)) retainDaysDraft.value = v
  },
  { immediate: true },
)

const AUTO_BACKUP_RETAIN_OPTIONS = [
  { value: 1, label: '1 天' },
  { value: 3, label: '3 天' },
  { value: 7, label: '7 天' },
  { value: 14, label: '14 天' },
  { value: 30, label: '30 天' },
]

function onRetainDaysChange(value) {
  const n = Number(value)
  if (Number.isFinite(n) && n !== autoBackup.value?.retainDays) {
    setAutoBackupRetainDays(n)
  }
}

const backupFlowSummary = computed(() => {
  const n = backupFiles.value?.length || 0
  return n > 0 ? `全量备份 · ${n} 份快照` : '全量备份 · 含数据库'
})

const backupFlowSteps = computed(() => [
  { label: '整库快照', meta: '业务数据表', icon: HardDrive, tone: 'in' },
  { label: '素材与密钥', meta: 'data 目录', icon: Settings, tone: 'mid' },
  { label: '加密备份包', meta: '单文件', icon: Package, tone: 'exec' },
  { label: '原样还原', meta: '整库覆盖', icon: Upload, tone: 'out' },
])

const encryptedBackupDialogRef = ref(null)
function openEncryptedBackupDialog() {
  encryptedBackupDialogRef.value?.open?.()
}
</script>

<style scoped src="./styles/profiles-theme.css"></style>
