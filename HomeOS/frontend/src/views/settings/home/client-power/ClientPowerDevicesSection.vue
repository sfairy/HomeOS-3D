<!--
组件：ClientPowerDevicesSection.vue
所属模块：frontend / src / views / settings / home / client-power
职责：充放电策略区段。展示已配置终端列表，每台终端含设备类型/在线状态/电量条/规格 chip、
      充电器 Switch 实体绑定、低/高/应急电量阈值、峰谷错峰与人来亮屏开关，并提供保存。
      本机 ID 与已配置终端不一致时，人来亮屏旁提示单机回退或请从待配对添加。
关键依赖：
  - SettingsCard / SettingsCardIntro：卡片与头部
  - EntityInput：充电器 Switch 实体输入
  - ClientPowerBatteryBar：电量条
  - lucide 图标
数据来源：父级透传的 config / pending / 各类派生函数
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/ClientPowerDevicesSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Loader2, Monitor, Plus, PlugZap, Save, Smartphone, Tablet, Trash2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import ClientPowerBatteryBar from './ClientPowerBatteryBar.vue'

// 入参：配置/待配对/加载保存状态/统计数/各类派生函数（实时行/设备类型/标题/校验/电量/规格）
defineProps({
  config: { type: Object, required: true },
  pending: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  policyCount: { type: Number, default: 0 },
  enabledCount: { type: Number, default: 0 },
  clientLiveRow: { type: Function, required: true },
  deviceKindForClient: { type: Function, required: true },
  clientCardTitle: { type: Function, required: true },
  clientNeedsSwitch: { type: Function, required: true },
  clientThresholdInvalid: { type: Function, required: true },
  batteryState: { type: Function, required: true },
  batteryPercent: { type: Function, required: true },
  specChips: { type: Function, required: true },
  removeClient: { type: Function, required: true },
  addEmptyClient: { type: Function, required: true },
  addClientFromPending: { type: Function, required: true },
  save: { type: Function, required: true },
  presenceWakeLocalHint: { type: String, default: '' },
})
</script>

<template>
  <SettingsCard full static extra-class="charge-section-card charge-section-card--devices">
    <SettingsCardIntro
      :icon="PlugZap"
      icon-class="cpd-icon-success"
      orb-class="cpd-orb-success"
      eyebrow="充放电策略"
      :description="'低电打开、高电关闭充电器。同一开关可在屏保时人来亮屏。'"
    >
      <template #desc>
        <p v-if="policyCount" class="charge-section-kicker charge-section-kicker--emerald">
          {{ policyCount }}{{ ' 台已配置' }}
          <span v-if="enabledCount > 0">· {{ enabledCount }}{{ ' 台联动中' }}</span>
        </p>
        <p v-if="presenceWakeLocalHint" class="charge-section-kicker charge-section-kicker--wake-hint">
          {{ presenceWakeLocalHint }}
        </p>
      </template>
    </SettingsCardIntro>

    <div v-if="loading" class="charge-loading">
      <Loader2 class="w-5 h-5 animate-spin opacity-40" />
      <span>{{ '加载策略配置…' }}</span>
    </div>

    <div v-else class="charge-device-list">
      <div v-if="!config.clients.length" class="charge-empty-premium">
        <div class="charge-empty-premium__visual" aria-hidden="true">
          <div class="charge-empty-premium__glow" />
          <PlugZap class="charge-empty-premium__icon" stroke-width="1.5" />
        </div>
        <h4 class="charge-empty-premium__title">{{ '暂无设备策略' }}</h4>
        <p class="charge-empty-premium__desc">
          {{
            pending.length
              ? '待配对终端已就绪，添加后即可绑定充电器与电量阈值。'
              : '从待配对列表添加，或手动新建一台终端。'
          }}
        </p>
        <button
          v-if="pending.length"
          type="button"
          class="charge-empty-premium__link"
          @click="addClientFromPending(pending[0])"
        >
          <Plus class="w-3.5 h-3.5" />
          {{ '添加第一台设备' }}
        </button>
      </div>

      <article
        v-for="(client, idx) in config.clients"
        :key="client.id || idx"
        :class="[
          'charge-device-card',
          client.enabled && 'charge-device-card--on',
          clientNeedsSwitch(client) && 'charge-device-card--warn',
        ]"
      >
        <header class="charge-device-card__head">
          <div class="charge-device-card__identity">
            <div
              :class="[
                'charge-device-card__avatar',
                `charge-device-card__avatar--${deviceKindForClient(client)}`,
                client.enabled && 'charge-device-card__avatar--on',
              ]"
            >
              <Tablet v-if="deviceKindForClient(client) === 'tablet'" class="w-4 h-4" />
              <Smartphone v-else-if="deviceKindForClient(client) === 'phone'" class="w-4 h-4" />
              <Monitor v-else class="w-4 h-4" />
            </div>
            <div class="charge-device-card__meta">
              <h4 class="charge-device-card__name" :title="clientCardTitle(client)">
                {{ clientCardTitle(client) }}
              </h4>
              <p v-if="clientLiveRow(client)" class="charge-device-card__status">
                <span
                  :class="[
                    'charge-online-dot',
                    clientLiveRow(client).online && 'charge-online-dot--on',
                  ]"
                />
                {{ clientLiveRow(client).online ? '在线' : '离线' }}
                <template v-if="batteryState(clientLiveRow(client)).percent != null">
                  · {{ batteryState(clientLiveRow(client)).percent }}%
                  <span
                    v-if="batteryState(clientLiveRow(client)).charging"
                    class="charge-status-charging"
                    >{{ '充电中' }}</span
                  >
                </template>
              </p>
              <p v-else class="charge-device-card__status charge-device-card__status--muted">
                {{ '等待终端上报' }}
              </p>
              <div v-if="specChips(clientLiveRow(client)).length" class="charge-device-card__chips">
                <span
                  v-for="chip in specChips(clientLiveRow(client))"
                  :key="chip.key"
                  :class="[
                    'charge-metric-pill',
                    chip.tone === 'emerald' && 'charge-metric-pill--accent',
                  ]"
                >
                  {{ chip.label }}
                </span>
              </div>
            </div>
          </div>

          <div class="charge-device-card__actions">
            <button
              type="button"
              class="toggle-btn shrink-0"
              :class="{ on: client.enabled }"
              :aria-label="'启用 ' + (client.label || client.id)"
              @click="client.enabled = !client.enabled"
            >
              <div class="toggle-dot" :class="{ on: client.enabled }" />
            </button>
            <button
              type="button"
              class="charge-device-card__remove"
              :aria-label="'删除终端策略'"
              @click="removeClient(idx)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        <ClientPowerBatteryBar
          v-if="batteryPercent(clientLiveRow(client)) != null"
          :percent="batteryPercent(clientLiveRow(client))"
          :charging="batteryState(clientLiveRow(client)).charging"
          :low-percent="client.selfCharge?.lowPercent ?? 20"
          :high-percent="client.selfCharge?.highPercent ?? 80"
        />

        <div class="charge-device-card__fields">
          <label class="charge-field charge-field--entity">
            <span class="charge-field__label">
              {{ '充电器 Switch 实体' }}
              <em v-if="clientNeedsSwitch(client)" class="charge-field__badge">{{ '未绑定' }}</em>
            </span>
            <EntityInput
              v-model="client.chargerSwitchEntityId"
              domain-filter="switch"
              placeholder="switch.xxx"
              :wrapper-class="
                clientNeedsSwitch(client)
                  ? 'charge-entity-input charge-entity-input--warn'
                  : 'charge-entity-input'
              "
              :dropdown-min-width="400"
              :dropdown-max-height="360"
            />
          </label>

          <div class="charge-device-card__thresholds">
            <label class="charge-field charge-field--threshold">
              <span>{{ '低电量 %' }}</span>
              <input
                v-model.number="client.selfCharge.lowPercent"
                type="number"
                min="0"
                max="100"
                :class="[
                  'settings-field text-xs charge-threshold-input',
                  clientThresholdInvalid(client) && 'charge-threshold-input--invalid',
                ]"
                :aria-label="'低于此电量打开充电器'"
              />
            </label>
            <label class="charge-field charge-field--threshold">
              <span>{{ '高电量 %' }}</span>
              <input
                v-model.number="client.selfCharge.highPercent"
                type="number"
                min="0"
                max="100"
                :class="[
                  'settings-field text-xs charge-threshold-input',
                  clientThresholdInvalid(client) && 'charge-threshold-input--invalid',
                ]"
                :aria-label="'达到此电量关闭充电器'"
              />
            </label>
            <label v-if="client.selfCharge.touEnabled" class="charge-field charge-field--threshold">
              <span>{{ '应急充电 %' }}</span>
              <input
                v-model.number="client.selfCharge.criticalPercent"
                type="number"
                min="0"
                max="100"
                class="settings-field text-xs charge-threshold-input"
                :aria-label="'峰段低于此电量仍强制充电'"
              />
            </label>
          </div>
          <p v-if="clientThresholdInvalid(client)" class="charge-device-card__hint">
            {{ '低电量阈值须小于高电量阈值' }}
          </p>

          <div class="charge-device-card__options">
            <div class="charge-option" :class="{ 'charge-option--on': client.selfCharge.touEnabled }">
              <button
                type="button"
                class="toggle-btn shrink-0"
                :class="{ on: client.selfCharge.touEnabled }"
                :aria-label="'峰谷错峰充电'"
                @click="client.selfCharge.touEnabled = !client.selfCharge.touEnabled"
              >
                <div class="toggle-dot" :class="{ on: client.selfCharge.touEnabled }" />
              </button>
              <span class="charge-option__text">
                <strong>{{ '峰谷错峰' }}</strong>
                <small>{{ '高峰暂缓，谷段再充' }}</small>
              </span>
            </div>
            <div
              class="charge-option"
              :class="{ 'charge-option--on': client.presenceWakeEnabled !== false }"
            >
              <button
                type="button"
                class="toggle-btn shrink-0"
                :class="{ on: client.presenceWakeEnabled !== false }"
                :aria-label="'人来亮屏'"
                @click="client.presenceWakeEnabled = client.presenceWakeEnabled === false"
              >
                <div class="toggle-dot" :class="{ on: client.presenceWakeEnabled !== false }" />
              </button>
              <span class="charge-option__text">
                <strong>{{ '人来亮屏' }}</strong>
                <small>{{ '屏保中关→开唤醒' }}</small>
              </span>
            </div>
          </div>
        </div>

        <footer class="charge-device-card__foot">
          <button
            type="button"
            class="charge-device-card__save settings-btn-accent text-xs"
            :disabled="saving || loading"
            @click="save"
          >
            <Loader2 v-if="saving" class="w-3.5 h-3.5 animate-spin" />
            <Save v-else class="w-3.5 h-3.5" />
            {{ saving ? '保存中…' : '保存配置' }}
          </button>
        </footer>
      </article>

      <button type="button" class="charge-add-btn" @click="addEmptyClient">
        <Plus class="w-4 h-4" />
        {{ '添加终端策略' }}
      </button>
    </div>
  </SettingsCard>
</template>

<style scoped src="./styles/client-power.css"></style>
