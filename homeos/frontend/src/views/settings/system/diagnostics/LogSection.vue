<!--
组件：LogSection.vue
所属模块：frontend / src / views / settings / system / diagnostics
职责：诊断日志区段。展示系统诊断快照（diag），支持复制、下载 txt、查看 traceId 与同步错误、
      跳转至联动器排查。数据由 useDiagnosticsSection 注入。
关键依赖：
  - SettingsCard / SettingsCardIntro：卡片容器
  - useDiagnosticsSection：从诊断上下文注入 diag / copyDiag / downloadDiagTxt 等
  - LINKAGE_HUB_ROUTES：联动器跳转
数据来源：useDiagnosticsSection() 返回的 diag 快照
-->
<template>
  <!-- Tab：诊断导出 -->
  <div class="settings-hub-section diag-page">
    <template v-if="diag?.copyText">
      <div class="diag-export-shell">
        <div class="diag-export-banner">
          <div class="diag-export-banner__main">
            <div class="diag-export-banner__orb">
              <FileText class="w-9 h-9" />
              <span class="diag-export-banner__orb-ring" aria-hidden="true" />
            </div>
            <div class="diag-export-banner__copy">
              <p class="diag-hero-eyebrow diag-hero-eyebrow--warn">{{ '运维诊断包' }}</p>
              <h3 class="diag-export-banner__title">{{ '一键复制 · 排障存档' }}</h3>
              <p class="diag-export-banner__desc">
                {{ '聚合 HA、实体、缓存、资源与联动同步状态，适合粘贴到工单备注' }}
              </p>
              <div class="diag-export-banner__meta">
                <span>{{ '生成于 ' }}{{ diagExportTimestamp }}</span>
                <span v-if="pageTraceId" class="diag-export-banner__trace">
                  Trace <code>{{ pageTraceId }}</code>
                </span>
              </div>
            </div>
          </div>
          <div class="diag-export-banner__actions">
            <button
              type="button"
              class="diag-action-btn diag-action-btn--primary"
              @click="copyDiag"
            >
              <Copy class="w-5 h-5" /> {{ '复制诊断' }}
            </button>
            <button type="button" class="diag-action-btn" @click="downloadDiagTxt">
              <Download class="w-5 h-5" /> {{ '下载 TXT' }}
            </button>
          </div>
        </div>

        <div class="diag-export-snapshot">
          <div
            v-for="field in diagExportFields"
            :key="field.key"
            :class="['diag-export-field', field.tone && `diag-export-field--${field.tone}`]"
          >
            <span class="diag-export-field__k">{{ field.label }}</span>
            <span :class="['diag-export-field__v', field.mono && 'font-mono']">{{
              field.value
            }}</span>
          </div>
        </div>

        <div v-if="diagExportSyncErrors.length" class="diag-export-errors">
          <div class="diag-export-errors__head">
            <AlertTriangle class="w-5 h-5 shrink-0" />
            <span>{{ 'HA 联动同步近期异常' }}（{{ diagExportSyncErrors.length }}）</span>
          </div>
          <ul class="diag-export-errors__list">
            <li v-for="(err, i) in diagExportSyncErrors" :key="i">
              <span class="diag-export-errors__scope">{{ err.scope }}</span>
              <span class="diag-export-errors__msg">{{ err.message }}</span>
            </li>
          </ul>
          <RouterLink :to="SETTINGS_ROUTES.homeMode()" class="diag-export-errors__link">
            {{ '前往家庭模式排查' }} →
          </RouterLink>
        </div>

        <div class="diag-export-preview">
          <div class="diag-export-preview__head">
            <span class="diag-export-preview__title">{{ '诊断文本预览' }}</span>
            <span class="diag-export-preview__badge">{{ diagExportLineCount }} {{ '行' }}</span>
          </div>
          <pre class="diag-export-preview__body">{{ diag.copyText }}</pre>
        </div>

        <div class="diag-export-guides">
          <article v-for="guide in diagExportGuides" :key="guide.id" class="diag-export-guide">
            <div class="diag-export-guide__icon" :style="{ '--guide-accent': guide.accent }">
              <component :is="guide.icon" class="w-6 h-6" />
            </div>
            <div class="diag-export-guide__body">
              <h4 class="diag-export-guide__title">{{ guide.title }}</h4>
              <p class="diag-export-guide__desc">{{ guide.desc }}</p>
              <div v-if="guide.codes?.length" class="diag-export-guide__codes">
                <code v-for="code in guide.codes" :key="code">{{ code }}</code>
              </div>
              <RouterLink v-if="guide.linkTo" :to="guide.linkTo" class="diag-export-guide__link">
                <Link2 class="w-4 h-4" /> {{ guide.linkLabel }}
              </RouterLink>
            </div>
          </article>
        </div>
      </div>
    </template>

    <SettingsCard v-else-if="loading" full extra-class="diag-metrics-loading-card">
      <div class="diag-metrics-loading">
        <RefreshCw class="w-8 h-8 animate-spin dl-icon-info-soft" />
        <p>{{ '正在生成诊断文本…' }}</p>
      </div>
    </SettingsCard>

    <SettingsCard v-else full>
      <SettingsCardIntro
        :icon="FileText"
        icon-class="dl-icon-info"
        orb-class="dl-orb-info"
        :title="'暂无诊断数据'"
        :description="'需管理员权限；请点击页头刷新后重试'"
      />
      <button
        type="button"
        class="diag-action-btn diag-action-btn--primary mt-4"
        :disabled="loading"
        @click="fetchAll"
      >
        <RefreshCw :class="['w-5 h-5', loading && 'animate-spin']" /> {{ '重新加载' }}
      </button>
    </SettingsCard>
  </div>
</template>

<script setup>
import { RefreshCw, Copy, FileText, AlertTriangle, Download, Link2 } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import { useDiagnosticsSection } from './useDiagnosticsSection'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const {
  diag,
  loading,
  fetchAll,
  copyDiag,
  downloadDiagTxt,
  diagExportTimestamp,
  pageTraceId,
  diagExportFields,
  diagExportSyncErrors,
  diagExportLineCount,
  diagExportGuides,
} = useDiagnosticsSection([
  'diag',
  'loading',
  'fetchAll',
  'copyDiag',
  'downloadDiagTxt',
  'diagExportTimestamp',
  'pageTraceId',
  'diagExportFields',
  'diagExportSyncErrors',
  'diagExportLineCount',
  'diagExportGuides',
])
</script>

<style scoped src="./styles/diagnostics-theme.css"></style>
