<!--
组件：HomeModeLogsSection.vue
所属模块：frontend / src / views / settings / automate / home-mode
职责：家庭模式编辑器「运行日志」分区。展示触发记录与最近执行结果，支持「仅当前模式」
      过滤、执行卡片展开查看逐条动作结果，并提供跳转到完整日志页的入口。
关键依赖：
  - formatShortDateTime / homeModeLogSourceLabel：时间与来源文案格式化
  - RouterLink：跳转模式触发日志页
数据来源：父级透传的 triggerLogs / execHistory / activeModeId
-->
<template>
  <div class="hm-panel__section hm-panel__section--fill hm-logs-hub">
    <div v-if="triggerLogs.length || execHistory.length" class="hm-logs-filter">
      <label class="hm-logs-filter__toggle">
        <input v-model="onlyCurrent" type="checkbox" class="hm-logs-filter__input" />
        <span>{{ '仅当前模式' }}</span>
      </label>
      <span v-if="onlyCurrent && activeModeId" class="hm-logs-filter__hint">
        {{ `${filteredTriggerLogs.length + filteredExecHistory.length} 条相关记录` }}
      </span>
    </div>

    <div class="hm-section-body">
      <div v-if="filteredTriggerLogs.length" class="hm-log-block">
        <header class="hm-logs-head">
          <div class="hm-logs-head__main">
            <Clock class="hm-logs-head__icon hm-logs-head__icon--sky" />
            <div>
              <p class="hm-logs-head__eyebrow">{{ '触发记录' }}</p>
              <h4 class="hm-logs-head__title">{{ '模式触发日志' }}</h4>
            </div>
          </div>
          <div class="hm-logs-head__aside">
            <span class="hm-logs-badge">{{ `${filteredTriggerLogs.length} 条` }}</span>
            <RouterLink to="/mode-logs" class="hm-link">{{ '查看全部' }} →</RouterLink>
          </div>
        </header>
        <div class="hm-log-list">
          <article
            v-for="row in filteredTriggerLogs.slice(0, 8)"
            :key="row.id"
            class="hm-log-card hm-log-card--trigger"
          >
            <span class="hm-log-card__source">{{ homeModeLogSourceLabel(row.source) }}</span>
            <div class="hm-log-card__main">
              <span class="hm-log-card__mode">{{ row.modeName }}</span>
              <span class="hm-log-card__reason">{{ row.reason }}</span>
            </div>
            <time class="hm-log-card__time">{{ formatShortDateTime(row.executedAt) }}</time>
          </article>
        </div>
      </div>

      <div v-if="filteredExecHistory.length" class="hm-log-block">
        <header class="hm-logs-head">
          <div class="hm-logs-head__main">
            <History class="hm-logs-head__icon" />
            <div>
              <p class="hm-logs-head__eyebrow">{{ '执行结果' }}</p>
              <h4 class="hm-logs-head__title">{{ '最近执行' }}</h4>
            </div>
          </div>
          <span class="hm-logs-badge">{{ `${filteredExecHistory.length} 条` }}</span>
        </header>
        <div class="hm-log-list">
          <article
            v-for="row in filteredExecHistory.slice(0, 6)"
            :key="row.id"
            :class="[
              'hm-log-card',
              row.success ? 'hm-log-card--ok' : 'hm-log-card--fail',
              expandedLogId === row.id && 'hm-log-card--expanded',
            ]"
          >
            <button
              type="button"
              class="hm-log-card__status-btn"
              :aria-label="row.success ? '执行成功，展开详情' : '执行失败，展开详情'"
              @click="toggleExpand(row.id)"
            >
              <component :is="row.success ? Check : XCircle" class="hm-log-card__status-icon" />
            </button>
            <div class="hm-log-card__main">
              <div class="hm-log-card__top-row">
                <span class="hm-log-card__mode">{{ row.modeName }}</span>
                <span class="hm-log-card__count">{{ `${row.executed}/${row.total}` }}</span>
              </div>
              <span class="hm-log-card__reason">{{
                row.reason || (row.success ? '全部成功' : `失败 ${row.total - row.executed} 个动作`)
              }}</span>
            </div>
            <div class="hm-log-card__right">
              <time class="hm-log-card__time">{{ formatShortDateTime(row.executedAt) }}</time>
              <button
                type="button"
                class="hm-log-card__expand-btn"
                :aria-label="expandedLogId === row.id ? '收起详情' : '展开详情'"
                @click="toggleExpand(row.id)"
              >
                <ChevronDown
                  :class="['hm-log-card__expand-icon', expandedLogId === row.id && 'rotate-180']"
                />
              </button>
            </div>
            <div v-show="expandedLogId === row.id" class="hm-log-card__details">
              <div v-if="row.results?.length" class="hm-log-card__results">
                <div
                  v-for="(res, rIdx) in row.results"
                  :key="rIdx"
                  :class="[
                    'hm-log-result-row',
                    res.success ? 'hm-log-result-row--ok' : 'hm-log-result-row--fail',
                  ]"
                >
                  <component
                    :is="res.success ? Check2 : AlertCircle"
                    class="hm-log-result-row__icon"
                  />
                  <span class="hm-log-result-row__entity">{{
                    res.entity_id || res.domain || '未知动作'
                  }}</span>
                  <span v-if="res.service" class="hm-log-result-row__service"
                    >.{{ res.service }}</span
                  >
                  <span
                    v-if="!res.success && res.error"
                    class="hm-log-result-row__error"
                    :title="res.error"
                  >
                    {{ res.error }}
                  </span>
                </div>
              </div>
              <div v-else class="hm-log-card__no-details">
                {{ row.success ? '执行成功，无详细结果' : '执行失败，但未记录详细错误信息' }}
              </div>
            </div>
          </article>
        </div>
      </div>

      <div v-if="!filteredTriggerLogs.length && !filteredExecHistory.length" class="hm-logs-empty">
        <History class="hm-logs-empty__icon" />
        <p class="hm-logs-empty__title">
          {{ onlyCurrent && activeModeId ? '当前模式暂无运行记录' : '暂无运行记录' }}
        </p>
        <p class="hm-logs-empty__desc">
          {{
            onlyCurrent && activeModeId
              ? '该模式触发或动作执行后将在此显示'
              : '模式触发或动作执行后将在此显示最近记录'
          }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Clock,
  History,
  ChevronDown,
  Check,
  XCircle,
  Check as Check2,
  AlertCircle,
} from '@lucide/vue'
import { formatShortDateTime } from '@/utils/format/locale-format.util'
import { homeModeLogSourceLabel } from '@homeos/shared'

const props = defineProps({
  triggerLogs: { type: Array, default: () => [] },
  execHistory: { type: Array, default: () => [] },
  activeModeId: { type: String, default: '' },
})

const onlyCurrent = ref(true)
const expandedLogId = ref(null)

function toggleExpand(id) {
  expandedLogId.value = expandedLogId.value === id ? null : id
}

function filterByMode(list) {
  if (!onlyCurrent.value || !props.activeModeId) return list
  return list.filter((row) => row.modeId === props.activeModeId)
}

const filteredTriggerLogs = computed(() => filterByMode(props.triggerLogs || []))
const filteredExecHistory = computed(() => filterByMode(props.execHistory || []))
</script>
<style src="./styles/HomeMode.css"></style>
