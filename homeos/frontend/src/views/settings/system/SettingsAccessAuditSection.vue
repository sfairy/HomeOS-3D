<!--
组件：SettingsAccessAuditSection.vue
所属模块：frontend / src / views / settings / system
职责：审计日志区段。展示配置审计与登录审计记录，支持按用户/实体过滤与分页。
defineModel：
  - auditUserFilter / auditEntityFilter：审计过滤词
Props：
  - auditSuccessCount / auditFailCount：审计成功/失败数
  - auditLogs / loginAudits：审计与登录日志列表
  - loginAuditLoading / loginAuditError / loginAuditPage / loginAuditTotalPages：登录审计分页
  - auditUserOptions：用户过滤选项
  - auditLoading / auditPage / auditTotalPages：审计分页
  - queryAudit / goAuditPage / onAuditEntityPick / formatAuditTime / goLoginAuditPage：审计操作
关键依赖：
  - SettingsCard / SettingsCardIntro / SettingsSectionHead：卡片容器
  - SearchableSelect / EntityInput：过滤选择
  - ApiQueryState：加载态
  - useEntitiesStore：实体显示名
数据来源：父级透传的审计日志与分页方法
-->
<template>
  <div class="settings-hub-section access-audit-hub">
    <SettingsCard static extra-class="!py-4 !px-5">
      <SettingsCardIntro
        :icon="ScrollText"
        icon-class="aa-icon-accent"
        orb-class="aa-orb-accent"
        eyebrow="访问与审计"
        :description="'设备控制命令与登录尝试记录，仅 admin 可见。'"
      />
      <div class="access-audit-kpi mt-4">
        <div class="access-audit-kpi__item">
          <div class="access-audit-kpi__icon access-audit-kpi__icon--ok">
            <CheckCircle2 class="w-5 h-5" />
          </div>
          <div>
            <div class="access-audit-kpi__val aa-text-success">{{ auditSuccessCount }}</div>
            <div class="access-audit-kpi__lbl">{{ '本页成功' }}</div>
          </div>
        </div>
        <div class="access-audit-kpi__item">
          <div class="access-audit-kpi__icon access-audit-kpi__icon--fail">
            <XCircle class="w-5 h-5" />
          </div>
          <div>
            <div class="access-audit-kpi__val aa-text-danger">{{ auditFailCount }}</div>
            <div class="access-audit-kpi__lbl">{{ '本页失败' }}</div>
          </div>
        </div>
        <div class="access-audit-kpi__item">
          <div class="access-audit-kpi__icon access-audit-kpi__icon--total">
            <ScrollText class="w-5 h-5" />
          </div>
          <div>
            <div class="access-audit-kpi__val aa-text-accent">{{ auditLogCount }}</div>
            <div class="access-audit-kpi__lbl">{{ '本页记录' }}</div>
          </div>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard full static extra-class="access-audit-card">
      <SettingsSectionHead
        :title="'命令审计'"
        :description="'经 /services/call 的设备控制记录'"
        bordered
      />

      <div class="access-audit-filters mt-4">
        <div class="access-audit-filter-cell">
          <label class="settings-form-label mb-1">{{ '用户' }}</label>
          <SearchableSelect
            v-model="auditUserFilter"
            :options="auditUserOptions"
            :placeholder="'选择或输入用户名'"
            @select="queryAudit"
          />
        </div>
        <div class="access-audit-filter-cell">
          <label class="settings-form-label mb-1">{{ '实体' }}</label>
          <EntityInput
            v-model="auditEntityFilter"
            :placeholder="'选择或输入 entity_id'"
            input-class="font-mono text-xs"
            @update:model-value="onAuditEntityPick"
          />
        </div>
        <button type="button" class="settings-btn-ghost shrink-0 self-end" @click="queryAudit">
          {{ '查询' }}
        </button>
      </div>

      <div
        v-if="auditLoading"
        class="settings-premium-empty settings-premium-empty--indigo access-audit-state"
      >
        <Loader2 class="settings-premium-empty__icon animate-spin" />
        <p class="settings-premium-empty__title">{{ '加载审计记录…' }}</p>
      </div>
      <div
        v-else-if="auditLogCount === 0"
        class="settings-premium-empty settings-premium-empty--indigo access-audit-state"
      >
        <ScrollText class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">{{ '暂无审计记录' }}</p>
        <p class="settings-premium-empty__desc">{{ '设备控制命令执行后将在此显示' }}</p>
        <div class="settings-premium-empty__actions">
          <button type="button" class="settings-premium-empty__btn" @click="queryAudit">
            {{ '刷新查询' }}
          </button>
        </div>
      </div>
      <div v-else class="access-audit-table-wrap mt-4">
        <table class="access-audit-table">
          <thead>
            <tr>
              <th>{{ '时间' }}</th>
              <th>{{ '用户' }}</th>
              <th>{{ '服务' }}</th>
              <th>{{ '实体名' }}</th>
              <th>{{ '实体ID' }}</th>
              <th>{{ '结果' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in safeAuditLogs" :key="row.id">
              <td class="access-audit-table__time">{{ formatAuditTime(row.createdAt) }}</td>
              <td>
                <span class="access-audit-table__user">{{ row.username || '—' }}</span>
                <span class="access-audit-table__role">{{ row.role }}</span>
              </td>
              <td class="font-mono text-[12px] whitespace-nowrap">
                {{ row.domain }}.{{ row.service }}
              </td>
              <td class="access-audit-table__entity-name" :title="resolveEntityName(row.entityId)">
                {{ resolveEntityName(row.entityId) }}
              </td>
              <td class="font-mono text-[12px] access-audit-table__entity" :title="row.entityId">
                {{ row.entityId || '—' }}
              </td>
              <td>
                <span
                  :class="[
                    'access-audit-badge',
                    row.success ? 'access-audit-badge--ok' : 'access-audit-badge--fail',
                  ]"
                >
                  {{ row.success ? '成功' : '失败' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer v-if="auditTotalPages > 1" class="access-audit-pager">
        <button
          type="button"
          class="settings-btn-ghost"
          :disabled="auditLoading || auditPage <= 1"
          @click="goAuditPage(auditPage - 1)"
        >
          {{ '上一页' }}
        </button>
        <span class="access-audit-pager__label">{{ auditPage }} / {{ auditTotalPages }}</span>
        <button
          type="button"
          class="settings-btn-ghost"
          :disabled="auditLoading || auditPage >= auditTotalPages"
          @click="goAuditPage(auditPage + 1)"
        >
          {{ '下一页' }}
        </button>
      </footer>
    </SettingsCard>

    <SettingsCard full static extra-class="access-audit-card">
      <SettingsSectionHead
        :title="'登录审计'"
        :description="'系统登录尝试记录（成功/失败/锁定）'"
        bordered
      />
      <ApiQueryState
        :loading="loginAuditLoading"
        :error="loginAuditError"
        error-title="登录审计加载失败"
        tone="indigo"
        @retry="goLoginAuditPage(loginAuditPage)"
      >
        <div
          v-if="loginAuditCount === 0"
          class="settings-premium-empty settings-premium-empty--indigo access-audit-state mt-4"
        >
          <CheckCircle2 class="settings-premium-empty__icon" />
          <p class="settings-premium-empty__title">{{ '暂无登录记录' }}</p>
          <p class="settings-premium-empty__desc">{{ '登录尝试（成功或失败）将记录在此' }}</p>
        </div>
        <div v-else class="access-audit-table-wrap mt-4">
          <table class="access-audit-table">
            <thead>
              <tr>
                <th>{{ '时间' }}</th>
                <th>{{ '用户' }}</th>
                <th>{{ 'IP' }}</th>
                <th>{{ '结果' }}</th>
                <th>{{ '说明' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in safeLoginAudits" :key="row.id">
                <td class="access-audit-table__time">{{ formatAuditTime(row.createdAt) }}</td>
                <td>
                  <span class="access-audit-table__user">{{ row.username || '—' }}</span>
                </td>
                <td class="font-mono text-[12px]">{{ row.ip || '—' }}</td>
                <td>
                  <span
                    :class="[
                      'access-audit-badge',
                      row.success ? 'access-audit-badge--ok' : 'access-audit-badge--fail',
                    ]"
                  >
                    {{ row.success ? '成功' : '失败' }}
                  </span>
                </td>
                <td class="text-[12px] aa-text-tertiary">{{ row.reason || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer
          v-if="loginAuditTotalPages > 1 && !loginAuditLoading"
          class="access-audit-pager mt-4"
        >
          <button
            type="button"
            class="settings-btn-ghost"
            :disabled="loginAuditPage <= 1"
            @click="goLoginAuditPage(loginAuditPage - 1)"
          >
            {{ '上一页' }}
          </button>
          <span class="access-audit-pager__label"
            >{{ loginAuditPage }} / {{ loginAuditTotalPages }}</span
          >
          <button
            type="button"
            class="settings-btn-ghost"
            :disabled="loginAuditPage >= loginAuditTotalPages"
            @click="goLoginAuditPage(loginAuditPage + 1)"
          >
            {{ '下一页' }}
          </button>
        </footer>
      </ApiQueryState>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SearchableSelect from '@/components/common/base/SearchableSelect.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { Loader2, CheckCircle2, XCircle, ScrollText } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  auditSuccessCount: { type: Number, default: 0 },
  auditFailCount: { type: Number, default: 0 },
  auditLogs: { type: Array, default: () => [] },
  loginAudits: { type: Array, default: () => [] },
  loginAuditLoading: Boolean,
  loginAuditError: { type: String, default: '' },
  loginAuditPage: { type: Number, default: 1 },
  loginAuditTotalPages: { type: Number, default: 1 },
  goLoginAuditPage: { type: Function, default: () => {} },
  auditUserOptions: { type: Array, default: () => [] },
  auditLoading: Boolean,
  auditPage: { type: Number, default: 1 },
  auditTotalPages: { type: Number, default: 1 },
  queryAudit: { type: Function, required: true },
  goAuditPage: { type: Function, required: true },
  onAuditEntityPick: { type: Function, required: true },
  formatAuditTime: { type: Function, required: true },
})

const auditUserFilter = defineModel('auditUserFilter', { type: String, default: '' })
const auditEntityFilter = defineModel('auditEntityFilter', { type: String, default: '' })

const entitiesStore = useEntitiesStore()

const safeAuditLogs = computed(() => (Array.isArray(props.auditLogs) ? props.auditLogs : []))
const safeLoginAudits = computed(() => (Array.isArray(props.loginAudits) ? props.loginAudits : []))
const auditLogCount = computed(() => safeAuditLogs.value.length)
const loginAuditCount = computed(() => safeLoginAudits.value.length)

/** 根据 entity_id 解析友好名称；实体已离线/不存在时回退为 ID 后缀或原文 */
function resolveEntityName(entityId) {
  const id = entityId == null ? '' : String(entityId)
  if (!id) return '—'
  return getEntityDisplayName(id, entitiesStore.getEntity(id)) || id
}
</script>

<style src="./styles/SettingsAccessAuditSection.css"></style>
