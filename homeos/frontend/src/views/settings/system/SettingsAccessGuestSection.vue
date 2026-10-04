<!--
组件：SettingsAccessGuestSection.vue
所属模块：frontend / src / views / settings / system
职责：访客访问区段。配置访客链接时长与可见实体范围，生成/复制临时访问链接，展示有效期与预设。
defineModel：
  - guestHours：访客链接有效期（小时）
  - guestRestrictionsStr：可见实体范围
Props：
  - guestHourPresets：时长预设
  - guestGenerating / guestShareUrl / guestExpiresAt：生成状态与链接
  - guestPresetLabel / formatGuestExpiry：标签与有效期格式化
Emits：
  - create / copy：生成/复制链接
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程
  - @lucide/vue 的 Clock / Filter / Link2 / Loader2 / Copy / Monitor / KeyRound
数据来源：父级透传的访客链接状态
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard extra-class="access-guest-card" static>
      <p class="access-guest-restart-hint">
        {{
          '此处生成的是大屏访客分享链接（受限会话）。门锁临时密码请在浮动图层「门锁中心」管理，已加密持久化，服务重启后仍会按期自动撤销。'
        }}
      </p>

      <SettingsFlowBand
        :steps="guestFlowSteps"
        class="access-guest-flow-band"
        band-class="access-guest-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="访客流程"
        :collapsed-summary="guestFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'有效时长'"
            :value="`${guestHours}h`"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'分享链接'"
            :value="guestShareUrl ? '已生成' : '待生成'"
            :tone="guestShareUrl ? 'emerald' : 'amber'"
            :val-tone="guestShareUrl ? 'emerald' : 'amber'"
          />
        </template>
      </SettingsFlowBand>

      <div class="access-guest-presets mt-2.5">
        <p class="access-guest-presets__label">{{ '有效时长' }}</p>
        <div class="access-guest-presets__grid">
          <button
            v-for="h in guestHourPresets"
            :key="h"
            type="button"
            :class="['access-guest-preset', guestHours === h && 'access-guest-preset--active']"
            @click="guestHours = h"
          >
            {{ guestPresetLabel(h) }}
          </button>
        </div>
      </div>

      <div class="settings-form-grid--2 grid gap-3 mt-4">
        <div>
          <label class="settings-form-label mb-1.5">{{ '自定义小时（1–168）' }}</label>
          <input
            v-model.number="guestHours"
            type="number"
            min="1"
            max="168"
            class="settings-field"
          />
        </div>
        <div>
          <label class="settings-form-label mb-1.5">{{ '实体 ACL 前缀' }}</label>
          <input
            v-model="guestRestrictionsStr"
            placeholder="逗号分隔，如 camera.doorbell；留空=不可见实体"
            class="settings-field font-mono text-xs"
          />
        </div>
      </div>

      <button
        type="button"
        class="settings-btn-accent mt-4"
        :disabled="guestGenerating"
        @click="$emit('create')"
      >
        <Loader2 v-if="guestGenerating" class="w-4 h-4 animate-spin" />
        <Link2 v-else class="w-4 h-4" />
        {{ guestGenerating ? '生成中…' : '生成分享链接' }}
      </button>

      <Transition name="access-expand">
        <div v-if="guestShareUrl" class="access-guest-result mt-4">
          <div class="access-guest-result__head">
            <div>
              <span class="access-guest-result__badge">{{ '链接已生成' }}</span>
              <p v-if="guestExpiresAt" class="access-guest-result__expiry">
                {{ `有效期至 ${formatGuestExpiry(guestExpiresAt)}` }}
              </p>
            </div>
            <button type="button" class="access-guest-copy-btn" @click="$emit('copy')">
              <Copy class="w-3.5 h-3.5" /> {{ '复制链接' }}
            </button>
          </div>
          <code class="access-guest-result__code">{{ guestShareUrl }}</code>
          <p class="access-guest-result__hint">
            {{ '短码链接（不含长 JWT），同 Wi‑Fi 分享；访客仅可查看受限大屏' }}
          </p>
        </div>
      </Transition>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import { Clock, Filter, Link2, Loader2, Copy, Monitor, KeyRound } from '@lucide/vue'

const props = defineProps({
  guestHourPresets: { type: Array, default: () => [] },
  guestGenerating: Boolean,
  guestShareUrl: { type: String, default: '' },
  guestExpiresAt: { type: [String, Number, Date], default: null },
  guestPresetLabel: { type: Function, required: true },
  formatGuestExpiry: { type: Function, required: true },
})

defineEmits(['create', 'copy'])

const guestHours = defineModel('guestHours', { type: Number, default: 24 })
const guestRestrictionsStr = defineModel('guestRestrictionsStr', { type: String, default: '' })

const guestFlowSummary = computed(
  () => `${guestHours.value}h · ${props.guestShareUrl ? '已生成' : '待生成'}`,
)

const guestFlowSteps = computed(() => [
  { label: '设置时长', meta: `${guestHours.value}h`, icon: Clock, tone: 'in' },
  {
    label: '可见范围',
    meta: guestRestrictionsStr.value?.trim() ? '有限实体' : '默认受限',
    icon: Filter,
    tone: 'sky',
  },
  {
    label: '生成链接',
    meta: props.guestShareUrl ? '已生成' : '待生成',
    icon: Link2,
    tone: props.guestShareUrl ? 'mid' : 'secondary',
  },
  { label: '短码兑换', meta: '同网分享', icon: KeyRound, tone: 'exec' },
  { label: '只读大屏', meta: '分享会话', icon: Monitor, tone: 'out' },
])
</script>

<style src="./styles/SettingsAccessGuestSection.css"></style>
