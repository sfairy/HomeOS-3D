<!--
组件：SettingsAccessSecuritySection.vue
所属模块：frontend / src / views / settings / system
职责：安全区段。通过 OrchTabs 切换锁定（PIN）、MFA、个人偏好（在场身份/勿扰/主题等）子页签，
      展示安全评分与等级，内嵌 SecurityLockSection 与 SecurityMfaSection。
Props：
  - authStore / userInitials / sessionEyebrow：账户信息
  - lockEnabled / securityScore / securityLevelClass / securityLevelLabel：安全评分
  - users / adminCount / userPrefs / presencePersonOptions / isAdmin：成员与偏好
  - pinLength / pinStrength* / isWeakPin / mfaEnabled / mfaQr / authSecuritySaving：PIN/MFA 状态
关键依赖：
  - SettingsCard / SettingsOrchTabs：卡片与子页签
  - SettingsAccessSecurityLockSection / SettingsAccessSecurityMfaSection：锁定与 MFA 子组件
  - HosSelect：偏好选择
数据来源：父级透传的安全状态与偏好
-->
<template>
  <div class="settings-hub-section acc-page">
    <!-- 概览：身份 + 评分 + KPI -->
    <SettingsCard :extra-class="`acc-hero ${lockEnabled ? 'acc-hero--secured' : ''}`" static>
      <div class="acc-hero__top">
        <div class="acc-hero__id">
          <div class="acc-hero__avatar">{{ userInitials }}</div>
          <div class="min-w-0">
            <div class="acc-hero__name-row">
              <h3 class="acc-hero__name">{{ authStore.user || '未登录' }}</h3>
              <span :class="['access-role-badge', `access-role-badge--${authStore.role}`]">{{
                roleMeta(authStore.role).label
              }}</span>
              <span v-if="lockEnabled" class="acc-hero__chip">
                <Lock class="w-3 h-3" />
                {{ '设置锁' }}
              </span>
            </div>
            <p class="acc-hero__meta">{{ sessionEyebrow }}</p>
          </div>
        </div>

        <div class="acc-hero__score" :class="securityLevelClass">
          <div class="acc-hero__ring" :style="{ '--score': securityScore }">
            <span class="acc-hero__ring-val">{{ securityScore }}</span>
          </div>
          <div class="acc-hero__score-copy">
            <span class="acc-hero__score-lbl">{{ '安全评分' }}</span>
            <span class="acc-hero__score-level">{{ securityLevelLabel }}</span>
          </div>
        </div>
      </div>

      <div class="acc-hero__stats">
        <div class="acc-hero-stat acc-hero-stat--members">
          <Users class="acc-hero-stat__icon" />
          <div class="acc-hero-stat__text">
            <span class="acc-hero-stat__val">{{ users?.length ?? 0 }}</span>
            <span class="acc-hero-stat__lbl">{{ '家庭成员' }}</span>
          </div>
        </div>
        <div
          class="acc-hero-stat"
          :class="lockEnabled ? 'acc-hero-stat--lock-on' : 'acc-hero-stat--lock-off'"
        >
          <Lock class="acc-hero-stat__icon" />
          <div class="acc-hero-stat__text">
            <span class="acc-hero-stat__val">{{ lockEnabled ? '已启用' : '未开启' }}</span>
            <span class="acc-hero-stat__lbl">{{ '设置锁' }}</span>
          </div>
        </div>
        <div class="acc-hero-stat acc-hero-stat--admin">
          <ShieldCheck class="acc-hero-stat__icon" />
          <div class="acc-hero-stat__text">
            <span class="acc-hero-stat__val">{{ adminCount }}</span>
            <span class="acc-hero-stat__lbl">{{ '管理员' }}</span>
          </div>
        </div>
        <div
          class="acc-hero-stat"
          :class="mfaEnabled ? 'acc-hero-stat--mfa-on' : 'acc-hero-stat--mfa-off'"
        >
          <KeyRound class="acc-hero-stat__icon" />
          <div class="acc-hero-stat__text">
            <span class="acc-hero-stat__val">{{ mfaEnabled ? '已启用' : '未启用' }}</span>
            <span class="acc-hero-stat__lbl">{{ 'MFA 双因素' }}</span>
          </div>
        </div>
      </div>

      <ul v-if="securityHints.length" class="acc-hero__hints">
        <li v-for="hint in securityHints" :key="hint" class="acc-hero__hint">
          <ShieldCheck class="acc-hero__hint-icon" />
          {{ hint }}
        </li>
      </ul>
    </SettingsCard>

    <SettingsCard static extra-class="acc-security-workspace">
      <div v-if="securityTabs.length > 1" class="acc-security-dock">
        <SettingsOrchTabs v-model="securityTab" :tabs="securityTabs" plain />
      </div>

      <!-- 设置锁：v-if 保证未激活面板不占高度 -->
      <div
        v-if="isAdmin && securityTab === 'lock'"
        class="acc-security-panel acc-security-panel--lock"
      >
        <SettingsAccessSecurityLockSection
          :lock-enabled="lockEnabled"
          :pin-length="pinLength"
          :pin-strength-percent="pinStrengthPercent"
          :pin-strength-variant="pinStrengthVariant"
          :pin-strength-label="pinStrengthLabel"
          :is-weak-pin="isWeakPin"
          :sanitize-pin="sanitizePin"
          :toggle-settings-lock="toggleSettingsLock"
        />
      </div>

      <!-- 账号安全 -->
      <div
        v-if="isAdmin && securityTab === 'account'"
        class="acc-security-panel acc-security-panel--account"
      >
        <SettingsAccessSecurityMfaSection
          v-model:show-change-password="showChangePassword"
          v-model:mfa-confirm-code="mfaConfirmCode"
          v-model:mfa-disable-code="mfaDisableCode"
          :lock-enabled="lockEnabled"
          :pin-length="pinLength"
          :is-weak-pin="isWeakPin"
          :users="users"
          :mfa-enabled="mfaEnabled"
          :mfa-qr="mfaQr"
          :start-mfa-setup="startMfaSetup"
          :confirm-mfa-setup="confirmMfaSetup"
          :disable-mfa="disableMfa"
        />
      </div>

      <!-- 个人偏好 -->
      <div v-if="securityTab === 'prefs'" class="acc-security-panel acc-security-panel--prefs">
        <header class="acc-section-head acc-section-head--panel">
          <div class="acc-section-head__orb acc-section-head__orb--pref">
            <Thermometer class="w-4 h-4" />
          </div>
          <div class="acc-section-head__copy">
            <h3 class="acc-section-head__title">{{ '个人偏好' }}</h3>
            <p class="acc-section-head__meta">
              {{ '影响自适应气候与昼夜节律；在家时优先使用你绑定人员对应的偏好' }}
            </p>
          </div>
        </header>

        <div class="acc-prefs-workspace__body">
          <div class="acc-prefs-presets" role="group" :aria-label="'环境预设'">
            <button
              v-for="preset in prefsPresets"
              :key="preset.id"
              type="button"
              :class="[
                'acc-prefs-presets__btn',
                prefsPresetId === preset.id && 'acc-prefs-presets__btn--on',
              ]"
              :disabled="prefsSaving"
              @click="applyPrefsPreset(preset.id)"
            >
              <span class="acc-prefs-presets__name">{{ preset.label }}</span>
              <span class="acc-prefs-presets__desc">{{ preset.desc }}</span>
            </button>
          </div>

          <div class="acc-dense-grid">
            <section class="acc-dense-card">
              <h4 class="acc-dense-card__title">
                <Thermometer class="acc-dense-card__icon" />
                {{ '气候与温标' }}
              </h4>
              <div class="acc-prefs-line acc-prefs-line--compact">
                <span class="acc-prefs-line__label">{{ '温度单位' }}</span>
                <div class="acc-prefs-seg" role="group" :aria-label="'温度单位'">
                  <button
                    type="button"
                    :class="[
                      'acc-prefs-seg__btn',
                      userPrefs.temperatureUnit === 'celsius' && 'acc-prefs-seg__btn--on',
                    ]"
                    :disabled="prefsSaving"
                    @click="setTemperatureUnit('celsius')"
                  >
                    ℃
                    <span class="acc-prefs-seg__hint">{{ '默认' }}</span>
                  </button>
                  <button
                    type="button"
                    :class="[
                      'acc-prefs-seg__btn',
                      userPrefs.temperatureUnit === 'fahrenheit' && 'acc-prefs-seg__btn--on',
                    ]"
                    :disabled="prefsSaving"
                    @click="setTemperatureUnit('fahrenheit')"
                  >
                    ℉
                  </button>
                </div>
              </div>
              <label class="acc-dense-field" for="prefDefaultTemp">
                <span class="acc-dense-field__label">
                  {{ '舒适温度' }}
                  <span class="acc-dense-field__meta">{{ tempFeelLabel }}</span>
                </span>
                <span class="acc-dense-field__control">
                  <input
                    id="prefDefaultTemp"
                    v-model.number="localPrefs.defaultTemperature"
                    type="number"
                    min="10"
                    max="35"
                    step="0.5"
                    class="settings-field acc-session-field__input"
                    :disabled="prefsSaving"
                  />
                  <span class="acc-session-field__unit">℃</span>
                </span>
              </label>
              <div class="acc-dense-field">
                <label class="acc-dense-field__label" for="prefLightKelvin">
                  {{ '偏好色温' }}
                  <span class="acc-dense-field__meta">{{ kelvinFeelLabel }}</span>
                </label>
                <span class="acc-dense-field__control">
                  <input
                    id="prefLightKelvin"
                    v-model.number="localPrefs.preferredLightKelvin"
                    type="number"
                    min="2000"
                    max="6500"
                    step="100"
                    class="settings-field acc-session-field__input"
                    :disabled="prefsSaving"
                  />
                  <span class="acc-session-field__unit">K</span>
                </span>
                <div class="acc-prefs-kelvin" role="group" :aria-label="'色温快选'">
                  <button
                    v-for="chip in kelvinChips"
                    :key="chip.kelvin"
                    type="button"
                    :class="[
                      'acc-prefs-kelvin__btn',
                      Number(localPrefs.preferredLightKelvin) === chip.kelvin &&
                        'acc-prefs-kelvin__btn--on',
                    ]"
                    :disabled="prefsSaving"
                    @click="localPrefs.preferredLightKelvin = chip.kelvin"
                  >
                    <span
                      class="acc-prefs-kelvin__swatch"
                      :style="{ background: chip.swatch }"
                      aria-hidden="true"
                    />
                    {{ chip.label }}
                  </button>
                </div>
              </div>
            </section>

            <section class="acc-dense-card">
              <h4 class="acc-dense-card__title">
                <Moon class="acc-dense-card__icon" />
                {{ '夜间与在家' }}
              </h4>
              <label class="acc-prefs-line acc-prefs-line--compact acc-prefs-line--toggle">
                <span class="acc-prefs-line__label">{{ '自动夜间照明' }}</span>
                <input
                  v-model="localPrefs.autoNightMode"
                  type="checkbox"
                  class="acc-prefs-switch"
                  :disabled="prefsSaving"
                />
              </label>
              <label class="acc-dense-field" for="prefNightTime">
                <span class="acc-dense-field__label">
                  {{ '夜间模式时刻' }}
                  <span class="acc-dense-field__meta">{{
                    localPrefs.autoNightMode ? '启用中' : '已关闭'
                  }}</span>
                </span>
                <span class="acc-dense-field__control">
                  <input
                    id="prefNightTime"
                    v-model="localPrefs.nightModeTime"
                    type="time"
                    class="settings-field acc-session-field__input acc-session-field__input--wide"
                    :disabled="prefsSaving || !localPrefs.autoNightMode"
                  />
                </span>
              </label>
              <label class="acc-dense-field acc-dense-field--stack" for="prefPresencePerson">
                <span class="acc-dense-field__label">
                  <Users class="acc-session-field__glyph" />
                  {{ '绑定在家人员' }}
                </span>
                <HosSelect
                  id="prefPresencePerson"
                  v-model="localPrefs.presencePersonId"
                  variant="settings"
                  block
                  :disabled="prefsSaving"
                  :searchable="false"
                  :options="presenceBindOptions"
                  empty-text="暂无可绑定人员"
                />
                <p class="acc-prefs-bind-hint">
                  <template v-if="presencePersonOptions?.length">
                    {{
                      boundPresenceName
                        ? `「${boundPresenceName}」在家时优先套用本偏好`
                        : '未绑定则按姓名匹配，匹配不到回退家庭默认'
                    }}
                  </template>
                  <template v-else>
                    {{ '尚未配置在家人员，请先到' }}
                    <RouterLink
                      :to="SETTINGS_ROUTES.securityModes('linkage')"
                      class="acc-prefs-bind-hint__link"
                    >
                      {{ '安防模式 → 人员' }}
                    </RouterLink>
                  </template>
                </p>
              </label>
            </section>
          </div>

          <div class="acc-dense-footer">
            <p class="acc-prefs-summary">
              <ShieldCheck class="acc-prefs-summary__icon" />
              {{ prefsSummary }}
            </p>
            <div class="acc-dense-footer__actions">
              <div class="acc-prefs-status__row">
                <span
                  class="acc-prefs-status__badge"
                  :class="
                    localPrefs.presencePersonId
                      ? 'acc-prefs-status__badge--on'
                      : 'acc-prefs-status__badge--off'
                  "
                >
                  {{ localPrefs.presencePersonId ? '已绑定' : '未绑定' }}
                </span>
                <span
                  class="acc-prefs-status__badge"
                  :class="
                    localPrefs.autoNightMode
                      ? 'acc-prefs-status__badge--on'
                      : 'acc-prefs-status__badge--off'
                  "
                >
                  {{ localPrefs.autoNightMode ? '夜间开' : '夜间关' }}
                </span>
                <RouterLink :to="SETTINGS_ROUTES.envHealth()" class="acc-prefs-status__link">
                  {{ '环境健康' }}
                </RouterLink>
              </div>
              <button
                type="button"
                class="settings-btn-accent text-xs"
                :disabled="prefsSaving || !prefsDirty"
                @click="persistLocalPrefs"
              >
                <Loader2 v-if="prefsSaving" class="w-3.5 h-3.5 animate-spin" />
                {{ prefsSaving ? '保存中…' : '保存偏好' }}
              </button>
            </div>
            <p class="acc-pane-foot__hint">
              <ShieldCheck class="acc-pane-foot__hint-icon" />
              {{ '温度单位点击即存；其余字段保存后约 10 分钟内同步到气候与照明推荐' }}
            </p>
          </div>
        </div>
      </div>

      <!-- 登录与会话：结构对齐个人偏好 Tab，避免独立 sheet/aside 撑高 -->
      <div
        v-if="isAdmin && securityTab === 'session'"
        class="acc-security-panel acc-security-panel--session"
      >
        <header class="acc-section-head acc-section-head--panel">
          <div class="acc-section-head__orb acc-section-head__orb--session">
            <KeyRound class="w-4 h-4" />
          </div>
          <div class="acc-section-head__copy">
            <h3 class="acc-section-head__title">{{ '登录与会话' }}</h3>
            <p class="acc-section-head__meta">
              {{ '会话有效期、续期节奏与连续失败锁定策略' }}
            </p>
          </div>
        </header>

        <div class="acc-prefs-workspace__body">
          <div class="acc-prefs-presets" role="group" :aria-label="'策略预设'">
            <button
              v-for="preset in sessionPresets"
              :key="preset.id"
              type="button"
              :class="[
                'acc-prefs-presets__btn',
                'acc-session-preset-btn',
                authSecurityPresetId === preset.id && 'acc-prefs-presets__btn--on',
              ]"
              :disabled="authSecuritySaving"
              @click="applyAuthSecurityPreset(preset.id)"
            >
              <span class="acc-prefs-presets__name">{{ preset.label }}</span>
              <span class="acc-prefs-presets__desc">{{ preset.desc }}</span>
            </button>
          </div>

          <div class="acc-dense-grid acc-dense-grid--session">
            <section class="acc-dense-card">
              <h4 class="acc-dense-card__title">
                <KeyRound class="acc-dense-card__icon" />
                {{ '会话策略' }}
              </h4>
              <label class="acc-dense-field" for="sessionExpireDays">
                <span class="acc-dense-field__label">
                  {{ '会话有效期' }}
                  <span class="acc-dense-field__meta">{{ '墙面板建议 30' }}</span>
                </span>
                <span class="acc-dense-field__control">
                  <input
                    id="sessionExpireDays"
                    v-model.number="sessionExpireDays"
                    type="number"
                    min="1"
                    max="365"
                    step="1"
                    class="settings-field acc-session-field__input"
                    :disabled="authSecuritySaving"
                  />
                  <span class="acc-session-field__unit">{{ '天' }}</span>
                </span>
              </label>
              <label class="acc-dense-field" for="sessionRefreshHours">
                <span class="acc-dense-field__label">
                  {{ '会话刷新间隔' }}
                  <span class="acc-dense-field__meta">{{ '活跃续期' }}</span>
                </span>
                <span class="acc-dense-field__control">
                  <input
                    id="sessionRefreshHours"
                    v-model.number="sessionRefreshHours"
                    type="number"
                    min="1"
                    max="168"
                    step="1"
                    class="settings-field acc-session-field__input"
                    :disabled="authSecuritySaving"
                  />
                  <span class="acc-session-field__unit">{{ '小时' }}</span>
                </span>
              </label>
            </section>

            <section class="acc-dense-card">
              <h4 class="acc-dense-card__title">
                <Lock class="acc-dense-card__icon" />
                {{ '失败锁定' }}
              </h4>
              <label class="acc-dense-field" for="lockoutMaxAttempts">
                <span class="acc-dense-field__label">
                  {{ '失败锁定阈值' }}
                  <span class="acc-dense-field__meta">{{ '最少 3 次' }}</span>
                </span>
                <span class="acc-dense-field__control">
                  <input
                    id="lockoutMaxAttempts"
                    v-model.number="lockoutMaxAttempts"
                    type="number"
                    min="3"
                    max="20"
                    step="1"
                    class="settings-field acc-session-field__input"
                    :disabled="authSecuritySaving"
                  />
                  <span class="acc-session-field__unit">{{ '次' }}</span>
                </span>
              </label>
              <label class="acc-dense-field" for="lockoutMinutes">
                <span class="acc-dense-field__label">
                  {{ '锁定时长' }}
                  <span class="acc-dense-field__meta">{{ '到期解除' }}</span>
                </span>
                <span class="acc-dense-field__control">
                  <input
                    id="lockoutMinutes"
                    v-model.number="lockoutMinutes"
                    type="number"
                    min="1"
                    max="1440"
                    step="1"
                    class="settings-field acc-session-field__input"
                    :disabled="authSecuritySaving"
                  />
                  <span class="acc-session-field__unit">{{ '分钟' }}</span>
                </span>
              </label>
            </section>
          </div>

          <div class="acc-dense-footer">
            <p class="acc-prefs-summary">
              <ShieldCheck class="acc-prefs-summary__icon" />
              {{ authSecuritySummary }}
            </p>
            <div class="acc-dense-footer__actions">
              <div class="acc-session-audit-inline">
                <span class="acc-session-audit__stat acc-session-audit__stat--ok">
                  {{ '成功' }} {{ loginAuditOkCount }}
                </span>
                <span class="acc-session-audit__stat acc-session-audit__stat--fail">
                  {{ '失败' }} {{ loginAuditFailCount }}
                </span>
                <RouterLink :to="SETTINGS_ROUTES.access('audit')" class="acc-session-audit__link">
                  {{ '查看登录审计' }}
                </RouterLink>
              </div>
              <button
                type="button"
                class="settings-btn-accent text-xs"
                :disabled="authSecuritySaving || !authSecurityDirty"
                @click="saveAuthSecurityConfig"
              >
                <Loader2 v-if="authSecuritySaving" class="w-3.5 h-3.5 animate-spin" />
                {{ authSecuritySaving ? '保存中…' : '保存策略' }}
              </button>
            </div>
            <p class="acc-pane-foot__hint">
              <ShieldCheck class="acc-pane-foot__hint-icon" />
              {{
                '修改后对新签发令牌与后续登录生效；已登录用户下次刷新或重新登录后应用新会话时长。'
              }}
            </p>
          </div>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { reactive, watch, computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsAccessSecurityLockSection from '@/views/settings/system/SettingsAccessSecurityLockSection.vue'
import SettingsAccessSecurityMfaSection from '@/views/settings/system/SettingsAccessSecurityMfaSection.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import {
  Lock,
  ShieldCheck,
  KeyRound,
  Thermometer,
  Users,
  Loader2,
  Moon,
} from '@lucide/vue'

const props = defineProps({
  authStore: { type: Object, required: true },
  userInitials: { type: String, default: '' },
  sessionEyebrow: { type: String, default: '' },
  lockEnabled: Boolean,
  securityScore: { type: Number, default: 0 },
  securityLevelClass: { type: String, default: '' },
  securityLevelLabel: { type: String, default: '' },
  users: { type: Array, default: () => [] },
  adminCount: { type: Number, default: 0 },
  userPrefs: { type: Object, default: () => ({}) },
  presencePersonOptions: { type: Array, default: () => [] },
  isAdmin: Boolean,
  pinLength: { type: Number, default: 0 },
  pinStrengthPercent: { type: Number, default: 0 },
  pinStrengthVariant: { type: String, default: '' },
  pinStrengthLabel: { type: String, default: '' },
  isWeakPin: Boolean,
  mfaEnabled: Boolean,
  mfaQr: { type: String, default: '' },
  authSecuritySaving: Boolean,
  authSecurityDirty: Boolean,
  authSecurityPresetId: { type: String, default: '' },
  authSecuritySummary: { type: String, default: '' },
  loginAuditOkCount: { type: Number, default: 0 },
  loginAuditFailCount: { type: Number, default: 0 },
  recentLoginFail: { type: Object, default: null },
  loginAuditLoading: Boolean,
  prefsSaving: Boolean,
  prefsDirty: { type: Boolean, default: false },
  roleMeta: { type: Function, required: true },
  sanitizePin: { type: Function, required: true },
  toggleSettingsLock: { type: Function, required: true },
  startMfaSetup: { type: Function, required: true },
  confirmMfaSetup: { type: Function, required: true },
  disableMfa: { type: Function, required: true },
  saveAuthSecurityConfig: { type: Function, required: true },
  applyAuthSecurityPreset: { type: Function, required: true },
  formatAuditTime: { type: Function, required: true },
  setTemperatureUnit: { type: Function, required: true },
  savePreferences: { type: Function, required: true },
})

const emit = defineEmits(['update:prefsDirty'])

const showChangePassword = defineModel('showChangePassword', { type: Boolean, default: false })
const sessionExpireDays = defineModel('sessionExpireDays', { type: Number, default: 30 })
const lockoutMaxAttempts = defineModel('lockoutMaxAttempts', { type: Number, default: 5 })
const lockoutMinutes = defineModel('lockoutMinutes', { type: Number, default: 15 })
const sessionRefreshHours = defineModel('sessionRefreshHours', { type: Number, default: 6 })
const mfaConfirmCode = defineModel('mfaConfirmCode', { type: String, default: '' })
const mfaDisableCode = defineModel('mfaDisableCode', { type: String, default: '' })

const securityTab = ref(props.isAdmin ? 'lock' : 'prefs')

const securityTabs = computed(() => {
  const tabs = []
  if (props.isAdmin) {
    tabs.push({ id: 'lock', label: '设置锁', icon: Lock })
    tabs.push({ id: 'account', label: '账号安全', icon: ShieldCheck })
  }
  tabs.push({ id: 'prefs', label: '个人偏好', icon: Thermometer })
  if (props.isAdmin) {
    tabs.push({ id: 'session', label: '登录会话', icon: KeyRound })
  }
  return tabs
})

watch(
  securityTabs,
  (tabs) => {
    const ids = new Set(tabs.map((t) => t.id))
    if (!ids.has(securityTab.value)) {
      securityTab.value = tabs[0]?.id || 'prefs'
    }
  },
  { immediate: true },
)

const sessionPresets = [
  { id: 'wall', label: '墙面板', desc: '30 天 · 宽松续期' },
  { id: 'desktop', label: '桌面', desc: '7 天 · 日常办公' },
  { id: 'strict', label: '严格', desc: '3 天 · 更短锁定' },
]

const PREFS_PRESET_VALUES = {
  comfort: {
    defaultTemperature: 24,
    preferredLightKelvin: 4000,
    autoNightMode: true,
    nightModeTime: '22:00',
  },
  cool: {
    defaultTemperature: 22,
    preferredLightKelvin: 5000,
    autoNightMode: true,
    nightModeTime: '22:30',
  },
  warmNight: {
    defaultTemperature: 25,
    preferredLightKelvin: 2700,
    autoNightMode: true,
    nightModeTime: '21:00',
  },
}

const prefsPresets = [
  { id: 'comfort', label: '舒适居家', desc: '24℃ · 中性白' },
  { id: 'cool', label: '清凉专注', desc: '22℃ · 冷白' },
  { id: 'warmNight', label: '暖夜照明', desc: '25℃ · 暖黄' },
]

const kelvinChips = [
  { kelvin: 2700, label: '暖黄', swatch: '#ffb347' },
  { kelvin: 4000, label: '中性', swatch: '#ffe08a' },
  { kelvin: 5500, label: '冷白', swatch: '#cfe8ff' },
]

const localPrefs = reactive({
  defaultTemperature: 24,
  preferredLightKelvin: 4000,
  autoNightMode: true,
  nightModeTime: '22:00',
  presencePersonId: '',
})

const securityHints = computed(() => {
  const hints = []
  if (!props.lockEnabled) hints.push('建议开启设置锁，保护公共终端上的设置入口')
  else if (props.pinLength < 4 || props.isWeakPin) hints.push('PIN 过短或过于简单，请更换为不易猜测的组合')
  if (!props.mfaEnabled && props.isAdmin) hints.push('管理员账号建议启用双因素认证 (MFA)')
  if ((props.users?.length ?? 0) < 2 && props.isAdmin) hints.push('建议为家庭成员创建独立账号，便于权限隔离')
  return hints.slice(0, 3)
})

const presenceBindOptions = computed(() => [
  { value: '', label: '不绑定（仅按姓名匹配）' },
  ...(Array.isArray(props.presencePersonOptions) ? props.presencePersonOptions : []).map((p) => ({
    value: String(p?.id || ''),
    label: String(p?.name || p?.id || ''),
  })),
])

const boundPresenceName = computed(() => {
  const id = String(localPrefs.presencePersonId || '')
  if (!id) return ''
  const hit = (Array.isArray(props.presencePersonOptions) ? props.presencePersonOptions : []).find(
    (p) => String(p?.id || '') === id,
  )
  return String(hit?.name || id)
})

const tempFeelLabel = computed(() => {
  const t = Number(localPrefs.defaultTemperature) || 24
  if (t < 20) return '偏凉'
  if (t < 23) return '清爽'
  if (t < 26) return '舒适'
  if (t < 28) return '偏暖'
  return '偏热'
})

const kelvinFeelLabel = computed(() => {
  const k = Number(localPrefs.preferredLightKelvin) || 4000
  if (k < 3000) return '暖黄'
  if (k < 4500) return '中性白'
  return '冷白'
})

const prefsPresetId = computed(() => {
  const cur = {
    defaultTemperature: Number(localPrefs.defaultTemperature) || 24,
    preferredLightKelvin: Number(localPrefs.preferredLightKelvin) || 4000,
    autoNightMode: localPrefs.autoNightMode !== false,
    nightModeTime: String(localPrefs.nightModeTime || '22:00'),
  }
  for (const [id, preset] of Object.entries(PREFS_PRESET_VALUES)) {
    if (
      cur.defaultTemperature === preset.defaultTemperature &&
      cur.preferredLightKelvin === preset.preferredLightKelvin &&
      cur.autoNightMode === preset.autoNightMode &&
      cur.nightModeTime === preset.nightModeTime
    ) {
      return id
    }
  }
  return ''
})

const prefsSummary = computed(() => {
  const temp = Number(localPrefs.defaultTemperature) || 24
  const kelvin = Number(localPrefs.preferredLightKelvin) || 4000
  const night = String(localPrefs.nightModeTime || '22:00')
  const nightPart = localPrefs.autoNightMode
    ? `${night} 起自动夜间照明`
    : '未启用自动夜间照明'
  const bindPart = boundPresenceName.value
    ? `已绑定「${boundPresenceName.value}」`
    : '未绑定在家人员'
  return `舒适温度 ${temp}℃（${tempFeelLabel.value}）· 色温 ${kelvin}K（${kelvinFeelLabel.value}）· ${nightPart} · ${bindPart}`
})

function applyPrefsPreset(id) {
  const preset = PREFS_PRESET_VALUES[id]
  if (!preset) return
  localPrefs.defaultTemperature = preset.defaultTemperature
  localPrefs.preferredLightKelvin = preset.preferredLightKelvin
  localPrefs.autoNightMode = preset.autoNightMode
  localPrefs.nightModeTime = preset.nightModeTime
}

function syncLocalFromProps() {
  const p = props.userPrefs || {}
  localPrefs.defaultTemperature = Number(p.defaultTemperature) || 24
  localPrefs.preferredLightKelvin = Number(p.preferredLightKelvin) || 4000
  localPrefs.autoNightMode = p.autoNightMode !== false
  localPrefs.nightModeTime = String(p.nightModeTime || '22:00')
  localPrefs.presencePersonId = String(p.presencePersonId || '')
    .replace(/^person:/i, '')
    .trim()
}

watch(() => props.userPrefs, syncLocalFromProps, { deep: true, immediate: true })

const prefsDirty = computed(() => {
  const p = props.userPrefs || {}
  return (
    Number(localPrefs.defaultTemperature) !== (Number(p.defaultTemperature) || 24) ||
    Number(localPrefs.preferredLightKelvin) !== (Number(p.preferredLightKelvin) || 4000) ||
    localPrefs.autoNightMode !== (p.autoNightMode !== false) ||
    String(localPrefs.nightModeTime || '22:00') !== String(p.nightModeTime || '22:00') ||
    String(localPrefs.presencePersonId || '') !== String(p.presencePersonId || '')
  )
})

watch(prefsDirty, (v) => emit('update:prefsDirty', v), { immediate: true })

async function persistLocalPrefs() {
  await props.savePreferences({
    defaultTemperature: Number(localPrefs.defaultTemperature) || 24,
    preferredLightKelvin: Number(localPrefs.preferredLightKelvin) || 4000,
    autoNightMode: localPrefs.autoNightMode !== false,
    nightModeTime: String(localPrefs.nightModeTime || '22:00'),
    presencePersonId: String(localPrefs.presencePersonId || ''),
  })
}
</script>
<style src="./styles/admin-hubs.css"></style>
