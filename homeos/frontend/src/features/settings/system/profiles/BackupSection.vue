<!--
组件：BackupSection.vue
所属模块：frontend / src / views / settings / system / profiles
职责：档案备份区段。支持导出/导入布局备份、应用配置备份，管理服务端备份文件
      （下载/导入/删除/恢复/立即备份），展示备份摘要与自动备份状态。数据由 useProfilesSection 注入。
关键依赖：
  - SettingsCard / SettingsFlowBand：卡片与流程
  - HosSelect：备份类型选择
  - useProfilesSection：注入备份相关状态与方法
数据来源：useProfilesSection() 返回的 backupSummary / backupFiles / exportBundleBackup 等
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
          {{ '完整备份包 — 搬迁或升级前推荐整包备份，一次恢复除数据库外的全部组态（默认不含用户账号与数据库）。' }}
        </p>

        <div v-if="isAdmin" class="pb-auto-backup">
          <div class="pb-auto-backup__row">
            <div class="pb-auto-backup__info">
              <p class="pb-auto-backup__title">
                <Clock class="w-3.5 h-3.5" /> {{ '定时自动备份' }}
              </p>
              <p class="pb-auto-backup__desc">
                {{
                  '每天 02:30（北京时间）在服务器 backups/ 目录生成完整备份包。超出保留天数的历史包会自动删除。'
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

        <div class="pb-bundle-groups">
          <div class="pb-bundle-group">
            <p class="pb-bundle-group__label">
              <HardDrive class="w-3 h-3" /> {{ '本地文件' }}
            </p>
            <div class="pb-bundle-group__actions">
              <button
                type="button"
                class="settings-btn-accent text-xs"
                :disabled="bundleExporting"
                @click="exportBundleBackup"
              >
                <Download class="w-3.5 h-3.5" />
                {{ bundleExporting ? '导出中…' : '导出到本地' }}
              </button>
              <button type="button" class="settings-btn-ghost text-xs" @click="openImport('bundle')">
                <Upload class="w-3.5 h-3.5" /> {{ '从本地还原' }}
              </button>
            </div>
          </div>

          <div v-if="isAdmin" class="pb-bundle-group">
            <p class="pb-bundle-group__label">
              <Server class="w-3 h-3" /> {{ '服务器目录 (backups/)' }}
            </p>
            <div class="pb-bundle-group__actions">
              <button
                type="button"
                class="settings-btn-accent text-xs"
                :disabled="backupRunNowLoading || !!backupFileActionName || backupImportLoading"
                @click="runBackupNow"
              >
                <Loader2 v-if="backupRunNowLoading" class="w-3.5 h-3.5 animate-spin" />
                <Save v-else class="w-3.5 h-3.5" />
                {{ '备份到服务器' }}
              </button>
              <button
                type="button"
                class="settings-btn-ghost text-xs"
                :disabled="backupImportLoading || !!backupFileActionName"
                @click="pickLocalBackupFile"
              >
                <Loader2 v-if="backupImportLoading" class="w-3.5 h-3.5 animate-spin" />
                <Upload v-else class="w-3.5 h-3.5" />
                {{ '上传到服务器' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isAdmin" class="pb-server-files">
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
          {{ '尚无快照；点击「备份到服务器」或「上传到服务器」。' }}
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
                :disabled="!!backupFileActionName || backupImportLoading"
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
                :disabled="!!backupFileActionName || backupImportLoading"
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
                :disabled="!!backupFileActionName || backupImportLoading"
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

    <SettingsCard v-if="isAdmin" static class="mt-4">
      <p class="text-xs font-bold ps-label mb-1">{{ '备份与恢复' }}</p>
      <p class="text-[12px] pb-desc mb-3">
        {{
          '对齐 0.7.1 加密业务备份：含 HA 连接（Token）、仪表盘、户型与素材；不含账号与激活密钥。密码加密，恢复自动保留本机回退副本。'
        }}
      </p>
      <div class="pb-bundle-group__actions">
        <button type="button" class="settings-btn-accent text-xs" @click="openEncryptedBackupDialog">
          <Archive class="w-3.5 h-3.5" />
          {{ '打开备份与恢复' }}
        </button>
      </div>
      <BackupRestoreDialog ref="encryptedBackupDialogRef" />
    </SettingsCard>

    <SettingsCard static class="mt-4">
      <p class="text-[12px] mb-3 pb-desc">{{ '按级别单独导出 / 还原：' }}</p>

      <div class="backup-tier-grid">
        <article class="backup-tier-card backup-tier-card--ui">
          <header class="backup-tier-card__head">
            <span class="backup-tier-card__level">{{ '① UI 布局' }}</span>
            <div class="backup-tier-card__actions">
              <button
                type="button"
                class="settings-btn-accent text-[12px] py-1.5 px-2"
                @click="exportBackup"
              >
                {{ '导出' }}
              </button>
              <button
                type="button"
                class="settings-btn-ghost text-[12px] py-1.5 px-2"
                @click="openImport('ui')"
              >
                {{ '导入' }}
              </button>
            </div>
          </header>
          <p class="backup-tier-card__desc">
            {{ '各终端显示方案（布局配置），不含自动化与用户' }}
          </p>
          <div v-if="backupSummaryLoading" class="profiles-inline-loading">
            <Loader2 class="w-3 h-3 animate-spin shrink-0" />
            <span>{{ '加载方案清单…' }}</span>
          </div>
          <p v-else-if="backupSummary?.ui" class="backup-tier-card__meta">
            {{ '{n} 个显示方案'.replace('{n}', String(backupSummary.ui.count ?? 0)) }}
          </p>
        </article>

        <article class="backup-tier-card backup-tier-card--sys">
          <header class="backup-tier-card__head">
            <span class="backup-tier-card__level">{{ '② 系统参数' }}</span>
            <div class="backup-tier-card__actions">
              <button
                type="button"
                class="settings-btn-ghost text-[12px] py-1.5 px-2"
                :disabled="appConfigExporting"
                @click="exportAppConfig"
              >
                {{ appConfigExporting ? '导出中…' : '导出' }}
              </button>
              <button
                type="button"
                class="settings-btn-ghost text-[12px] py-1.5 px-2"
                @click="openImport('appconfig')"
              >
                {{ '导入' }}
              </button>
            </div>
          </header>
          <p class="backup-tier-card__desc">
            {{ '系统配置（安防阈值、能源、通知回调、终端方案绑定等）' }}
          </p>
          <div v-if="backupSummary?.appConfig" class="backup-tier-card__chips">
            <span class="backup-tier-card__meta">
              {{
                '{n} 个参数分区'.replace(
                  '{n}',
                  String(backupSummary.appConfig.sectionCount ?? 0),
                )
              }}
            </span>
            <span
              v-for="sec in (backupSummary.appConfig.sections || []).slice(0, 8)"
              :key="sec.section"
              class="backup-tier-card__chip"
            >
              {{ sec.section }} {{ sec.fieldCount }}
            </span>
          </div>
        </article>
      </div>

      <div class="settings-deploy-notes">
        <div class="settings-deploy-note settings-deploy-note--indigo">
          <div class="settings-deploy-note__icon">
            <Download class="w-4 h-4" />
          </div>
          <div class="settings-deploy-note__body">
            <p class="settings-deploy-note__title">{{ '建议备份范围' }}</p>
            <p class="settings-deploy-note__text">
              {{
                '「UI 布局」仅含户型图引用与面板组态（图片与图标文件需另拷贝）。搬迁或升级前建议导出完整备份包。用户账号默认不随完整还原导入；事件历史、能耗时序等请另行备份数据库。'
              }}
            </p>
          </div>
        </div>
        <div class="settings-deploy-note settings-deploy-note--amber">
          <div class="settings-deploy-note__icon">
            <Info class="w-4 h-4" />
          </div>
          <div class="settings-deploy-note__body">
            <p class="settings-deploy-note__title">{{ '不含内容' }}</p>
            <p class="settings-deploy-note__text">
              {{
                '用户密码、事件历史（切片仅可导出不可还原）、能源/环境时序、HA 本体与户型图/图标文件。'
              }}
            </p>
          </div>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  Download,
  Upload,
  Info,
  Loader2,
  Layers,
  Settings,
  Package,
  HardDrive,
  Server,
  Save,
  Clock,
  Archive,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import BackupRestoreDialog from '@/components/backup/BackupRestoreDialog.vue'
import { useProfilesSection } from './useProfilesSection'

const {
  isAdmin,
  bundleExporting,
  exportBundleBackup,
  openImport,
  backupSummaryLoading,
  backupSummary,
  exportBackup,
  appConfigExporting,
  exportAppConfig,
  backupRunNowLoading,
  backupFiles,
  backupFilesLoading,
  backupFileActionName,
  backupFileActionKind,
  backupImportLoading,
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
  pickLocalBackupFile,
} = useProfilesSection([
  'isAdmin',
  'bundleExporting',
  'exportBundleBackup',
  'openImport',
  'backupSummaryLoading',
  'backupSummary',
  'exportBackup',
  'appConfigExporting',
  'exportAppConfig',
  'backupRunNowLoading',
  'backupFiles',
  'backupFilesLoading',
  'backupFileActionName',
  'backupFileActionKind',
  'backupImportLoading',
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
  'pickLocalBackupFile',
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
  return n > 0 ? `完整备份 · ${n} 份快照` : '完整备份 · 分级导出'
})

const backupFlowSteps = computed(() => [
  { label: 'UI 布局', meta: '各终端布局', icon: Layers, tone: 'in' },
  { label: '系统参数', meta: '阈值/回调', icon: Settings, tone: 'mid' },
  { label: '完整备份包', meta: '单文件', icon: Package, tone: 'exec' },
  { label: '还原/导入', meta: '整包或分级', icon: Upload, tone: 'out' },
])

const encryptedBackupDialogRef = ref(null)
function openEncryptedBackupDialog() {
  encryptedBackupDialogRef.value?.open?.()
}
</script>

<style scoped src="./styles/profiles-theme.css"></style>
