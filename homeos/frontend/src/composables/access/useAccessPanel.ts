/**
 * @file 设置 → 访问控制面板逻辑 Composable
 * @module composables/access/useAccessPanel
 * @description
 *   访问控制面板的聚合 Composable，整合终端安全（PIN 锁）、家庭成员管理、
 *   访客分享、命令审计、MFA 双因素、个人偏好、登录安全策略等子模块。
 *   通过组合 useAccessUsers / useAccessMfa / useAccessAudit 三个子 composable，
 *   并补充 PIN 强度评估、安全评分、访客令牌生成、偏好持久化等逻辑。
 *   依赖：auth.store / entities.store / chrome.store / layout.store、系统配置与认证偏好 API、
 *   以及 settings 模块下的 hub.internals / system-config.internals 工具。
 */
import { ref, onMounted, computed, unref, watch } from 'vue'
import { useLayoutConfigRef } from '@/composables/ui/useLayoutConfigRef'
import { useChromeStore } from '@/stores/chrome.store'
import {
  Lock,
  ShieldCheck,
  KeyRound,
  Thermometer,
  UserPlus,
  Link2,
  Copy,
  Loader2,
  Users,
  ScrollText,
  X,
  Trash2,
} from '@lucide/vue'
import { DEFAULT_AUTH_SECURITY } from '@homeos/shared'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { fetchAuthPreferences, updateAuthPreferences, createGuestToken } from '@/services/api/auth'
import { fetchSystemConfig } from '@/services/api/system'
import { loadPresenceHome } from '@/composables/presence/load-presence-home'
import { getPresencePersonsFromSecurity } from '@/utils/presence/person.util'
import { patchSystemConfig, handleSystemConfigPatchError } from '@/composables/config/system-config-core.internals'
import { notifyError } from '@/services/notify'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { PIN_STRENGTH_VARIANT } from '@/utils/ui/progress-bar.util'
import { logger } from '@/utils/core/logger'
import { copyTextToClipboard } from '@/utils/core/clipboard.util'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { useAccessUsers } from '@/composables/access/useAccessUsers'
import { useAccessMfa } from '@/composables/access/useAccessMfa'
import { useAccessAudit } from '@/composables/access/useAccessAudit'
import type { AccessChromeStore, AccessRole, AccessUser } from '@/types/access'
import type { MaybeRefOrGetter, Ref } from 'vue'
/** 设置 → 访问控制面板逻辑 */
export function useAccessPanel(activeTabSource: MaybeRefOrGetter<string> | Ref<string>) {
  /** 访客令牌有效时长预设（小时） */
  const guestHourPresets = [8, 24, 48, 72]
  const chrome = useChromeStore()
  const { layoutStore, layoutConfig } = useLayoutConfigRef()
  const authStore = useAuthStore()
  const entitiesStore = useEntitiesStore()
  /** 是否为管理员（决定可见的子面板） */
  const isAdmin = computed(() => authStore.role === 'admin')
  /** 角色选项（管理员 / 成人 / 儿童），用于下拉与角色元信息 */
  const roleOptions = computed(() => [
    { id: 'admin', label: '管理员', desc: '完全访问与配置' },
    { id: 'adult', label: '成人', desc: '可配置 ACL 前缀' },
    { id: 'child', label: '儿童', desc: '受限控制权限' },
  ])
  /** 当前激活的子面板区域（security / members / guest / audit） */
  const accessSection = ref('security')
  /** PIN 输入框 DOM 引用，用于聚焦 */
  const pinInputRef = ref<HTMLInputElement | null>(null)
  /** 是否显示修改密码弹层 */
  const showChangePassword = ref(false)
  /** 访客令牌有效时长（小时） */
  const guestHours = ref(8)
  /** 访客实体限制字符串（逗号分隔的 entity_id） */
  const guestRestrictionsStr = ref<string>('')
  /** 生成的访客分享 URL */
  const guestShareUrl = ref<string>('')
  /** 访客令牌过期时间（ISO 字符串） */
  const guestExpiresAt = ref<string>('')
  /** 访客令牌生成中标志 */
  const guestGenerating = ref(false)
  /** 用户个人偏好（温标、默认温度、灯色温、夜间模式等） */
  const userPrefs = ref({
    temperatureUnit: 'celsius',
    defaultTemperature: 24,
    preferredLightKelvin: 4000,
    autoNightMode: true,
    nightModeTime: '22:00',
    presencePersonId: '',
  })
  /** 在家人员选项（用于偏好绑定） */
  const presencePersonOptions = ref<{ id: string; name: string }[]>([])
  /** 偏好保存中标志 */
  const prefsSaving = ref(false)
  /** 会话过期天数（登录安全策略） */
  const sessionExpireDays = ref(DEFAULT_AUTH_SECURITY.sessionExpireDays)
  /** 锁定前最大尝试次数 */
  const lockoutMaxAttempts = ref(DEFAULT_AUTH_SECURITY.lockoutMaxAttempts)
  /** 锁定时长（分钟） */
  const lockoutMinutes = ref(DEFAULT_AUTH_SECURITY.lockoutMinutes)
  /** 会话 JWT 刷新间隔（小时，frontend.sessionRefreshHours） */
  const sessionRefreshHours = ref(6)
  /** 已持久化的登录策略基线，用于 dirty 判定 */
  const authSecurityBaseline = ref({
    sessionExpireDays: DEFAULT_AUTH_SECURITY.sessionExpireDays,
    lockoutMaxAttempts: DEFAULT_AUTH_SECURITY.lockoutMaxAttempts,
    lockoutMinutes: DEFAULT_AUTH_SECURITY.lockoutMinutes,
    sessionRefreshHours: 6,
  })
  /** 登录安全策略保存中标志 */
  const authSecuritySaving = ref(false)

  const AUTH_SECURITY_PRESETS = {
    wall: {
      sessionExpireDays: DEFAULT_AUTH_SECURITY.sessionExpireDays,
      lockoutMaxAttempts: DEFAULT_AUTH_SECURITY.lockoutMaxAttempts,
      lockoutMinutes: DEFAULT_AUTH_SECURITY.lockoutMinutes,
      sessionRefreshHours: 6,
    },
    desktop: { sessionExpireDays: 7, lockoutMaxAttempts: 5, lockoutMinutes: 15, sessionRefreshHours: 6 },
    strict: { sessionExpireDays: 3, lockoutMaxAttempts: 3, lockoutMinutes: 30, sessionRefreshHours: 2 },
  } as const

  function clampAuthSecurityValues(raw: {
    sessionExpireDays: number
    lockoutMaxAttempts: number
    lockoutMinutes: number
    sessionRefreshHours: number
  }) {
    return {
      sessionExpireDays: Math.min(
        365,
        Math.max(1, Math.round(Number(raw.sessionExpireDays) || DEFAULT_AUTH_SECURITY.sessionExpireDays)),
      ),
      // 与后端 validateAuthSection 一致：3–20
      lockoutMaxAttempts: Math.min(
        20,
        Math.max(
          3,
          Math.round(Number(raw.lockoutMaxAttempts) || DEFAULT_AUTH_SECURITY.lockoutMaxAttempts),
        ),
      ),
      lockoutMinutes: Math.min(
        1440,
        Math.max(1, Math.round(Number(raw.lockoutMinutes) || DEFAULT_AUTH_SECURITY.lockoutMinutes)),
      ),
      sessionRefreshHours: Math.min(168, Math.max(1, Math.round(Number(raw.sessionRefreshHours) || 6))),
    }
  }

  function syncAuthSecurityFromValues(values: {
    sessionExpireDays: number
    lockoutMaxAttempts: number
    lockoutMinutes: number
    sessionRefreshHours: number
  }) {
    const next = clampAuthSecurityValues(values)
    sessionExpireDays.value = next.sessionExpireDays
    lockoutMaxAttempts.value = next.lockoutMaxAttempts
    lockoutMinutes.value = next.lockoutMinutes
    sessionRefreshHours.value = next.sessionRefreshHours
    return next
  }

  function rememberAuthSecurityBaseline() {
    authSecurityBaseline.value = {
      sessionExpireDays: sessionExpireDays.value,
      lockoutMaxAttempts: lockoutMaxAttempts.value,
      lockoutMinutes: lockoutMinutes.value,
      sessionRefreshHours: sessionRefreshHours.value,
    }
  }

  /** 登录策略是否有未保存修改 */
  const authSecurityDirty = computed(() => {
    const b = authSecurityBaseline.value
    return (
      Number(sessionExpireDays.value) !== b.sessionExpireDays ||
      Number(lockoutMaxAttempts.value) !== b.lockoutMaxAttempts ||
      Number(lockoutMinutes.value) !== b.lockoutMinutes ||
      Number(sessionRefreshHours.value) !== b.sessionRefreshHours
    )
  })

  /** 当前选中的策略预设 id（无匹配时为空） */
  const authSecurityPresetId = computed(() => {
    const cur = {
      sessionExpireDays: Number(sessionExpireDays.value),
      lockoutMaxAttempts: Number(lockoutMaxAttempts.value),
      lockoutMinutes: Number(lockoutMinutes.value),
      sessionRefreshHours: Number(sessionRefreshHours.value),
    }
    for (const [id, preset] of Object.entries(AUTH_SECURITY_PRESETS)) {
      if (
        cur.sessionExpireDays === preset.sessionExpireDays &&
        cur.lockoutMaxAttempts === preset.lockoutMaxAttempts &&
        cur.lockoutMinutes === preset.lockoutMinutes &&
        cur.sessionRefreshHours === preset.sessionRefreshHours
      ) {
        return id
      }
    }
    return ''
  })

  /** 策略生效摘要文案 */
  const authSecuritySummary = computed(() => {
    const days = Number(sessionExpireDays.value) || 30
    const attempts = Number(lockoutMaxAttempts.value) || 5
    const minutes = Number(lockoutMinutes.value) || 15
    const hours = Number(sessionRefreshHours.value) || 6
    return `登录令牌有效 ${days} 天；活跃设备约每 ${hours} 小时续期；连续失败 ${attempts} 次将锁定 ${minutes} 分钟`
  })

  /**
   * 应用登录策略预设（仅改本地草稿，需点保存）
   */
  function applyAuthSecurityPreset(id: keyof typeof AUTH_SECURITY_PRESETS | string) {
    const preset = AUTH_SECURITY_PRESETS[id as keyof typeof AUTH_SECURITY_PRESETS]
    if (!preset) return
    syncAuthSecurityFromValues(preset)
  }

  /**
   * 根据角色 id 查找角色元信息（label/desc）
   * @param role 角色 id，未匹配时返回空 label/desc
   */
  function roleMeta(role: AccessRole | string | null | undefined) {
    return roleOptions.value.find((r) => r.id === role) || { label: role || '', desc: '' }
  }
  // 组合子 composable：用户管理 / MFA / 审计
  const {
    users,
    loading,
    loadError: membersLoadError,
    editing,
    memberSaving,
    memberRoleFilter,
    memberRoleTabs,
    filteredUsers,
    loadUsers,
    openCreate: openCreateUser,
    openEdit,
    saveUser,
    removeUser,
  } = useAccessUsers({ chrome: chrome as AccessChromeStore, isAdmin })
  const {
    mfaEnabled,
    mfaQr,
    mfaConfirmCode,
    mfaDisableCode,
    loadMfaStatus,
    startMfaSetup,
    confirmMfaSetup,
    disableMfa,
  } = useAccessMfa({ chrome: chrome as AccessChromeStore, isAdmin })
  const {
    auditLogs,
    auditLoading,
    auditPage,
    auditTotalPages,
    auditEntityFilter,
    auditUserFilter,
    auditExporting,
    auditClearing,
    loginAudits,
    loginAuditLoading,
    loginAuditError,
    loginAuditPage,
    loginAuditTotalPages,
    auditSuccessCount,
    auditFailCount,
    auditUserOptions,
    onAuditEntityPick,
    loadAudit,
    goAuditPage,
    queryAudit,
    clearAuditLogs,
    exportAuditCsv,
    loadLoginAudits,
    goLoginAuditPage,
    formatAuditTime,
  } = useAccessAudit({
    chrome: chrome as AccessChromeStore,
    isAdmin,
    users,
    entitiesStore,
    roleMeta,
  })

  /** 当前页登录审计成功/失败计数（供安全页快照） */
  const loginAuditOkCount = computed(() => loginAudits.value.filter((r) => !!r.success).length)
  const loginAuditFailCount = computed(() => loginAudits.value.filter((r) => !r.success).length)
  const recentLoginFail = computed(() => loginAudits.value.find((r) => !r.success) || null)

  // 终端安全（PIN 锁）相关 computed
  /** 设置锁是否启用 */
  const lockEnabled = computed(() => !!layoutStore.layoutConfig.settingsLock?.enabled)
  /** 当前 PIN 值（字符串形式） */
  const pinValue = computed(() => String(layoutStore.layoutConfig.settingsLock?.pin || ''))
  /** PIN 长度 */
  const pinLength = computed(() => pinValue.value.length)
  /** 常见弱口令集合，用于 PIN 强度评估 */
  const COMMON_WEAK_PINS = new Set([
    '1234',
    '4321',
    '0123',
    '2580',
    '1230',
    '12345',
    '123456',
    '654321',
    '0852',
  ])
  /** 是否为弱 PIN：全相同数字 / 连续递增递减 / 常见弱口令 */
  const isWeakPin = computed(() => {
    const p = pinValue.value
    if (!p || p.length < 4) return false
    // 全相同数字（如 0000、1111）
    if (/^(\d)\1+$/.test(p)) return true
    // 命中常见弱口令黑名单
    if (COMMON_WEAK_PINS.has(p)) return true
    // 连续递增或递减（如 1234、9876）
    let inc = true
    let dec = true
    for (let i = 1; i < p.length; i++) {
      if (p.charCodeAt(i) !== p.charCodeAt(i - 1) + 1) inc = false
      if (p.charCodeAt(i) !== p.charCodeAt(i - 1) - 1) dec = false
    }
    return inc || dec
  })
  /** 管理员数量（用于安全评分） */
  const adminCount = computed(() => users.value.filter((u: AccessUser) => u.role === 'admin').length)
  /** 当前用户名首字母缩写（用于头像） */
  const userInitials = computed(() => userInitialsOf(authStore.user))
  /**
   * 安全评分（0-100）：锁启用 +35、PIN 强度 +35、多用户 +15、有管理员 +15
   * @returns 0-100 的整数分数
   */
  const securityScore = computed(() => {
    let score = 0
    if (lockEnabled.value) score += 35
    if (pinLength.value >= 4 && !isWeakPin.value) score += 35
    if (users.value.length >= 2) score += 15
    if (adminCount.value >= 1) score += 15
    return Math.min(100, score)
  })
  /** 安全等级文案（基于 securityScore） */
  const securityLevelLabel = computed(() => {
    const s = securityScore.value
    if (s >= 85) return '安全良好'
    if (s >= 50) return '建议加强'
    return '存在风险'
  })
  /** 安全等级样式类名（基于 securityScore） */
  const securityLevelClass = computed(() => {
    const s = securityScore.value
    if (s >= 85) return 'acc-hero__score--good'
    if (s >= 50) return 'acc-hero__score--warn'
    return 'acc-hero__score--low'
  })
  /** 会话页眉文案，展示当前登录角色 */
  const sessionEyebrow = computed(() => {
    const role = roleMeta(authStore.role).label
    return '当前登录 · {role}'.replace('{role}', role || '会话')
  })
  /** PIN 强度百分比（长度 / 6 * 100，上限 100） */
  const pinStrengthPercent = computed(() => Math.min(100, (pinLength.value / 6) * 100))
  /** PIN 强度文案 */
  const pinStrengthLabel = computed(() => {
    if (pinLength.value === 0) return '未设置'
    if (pinLength.value < 4) return '过短'
    if (isWeakPin.value) return '过于简单'
    if (pinLength.value < 6) return '可用'
    return '强度良好'
  })
  /** PIN 强度进度条样式变体（weak / ok / strong） */
  const pinStrengthVariant = computed(() => {
    if (pinLength.value < 4 || isWeakPin.value)
      return PIN_STRENGTH_VARIANT['access-pin-strength__fill--weak']
    if (pinLength.value < 6) return PIN_STRENGTH_VARIANT['access-pin-strength__fill--ok']
    return PIN_STRENGTH_VARIANT['access-pin-strength__fill--strong']
  })
  /**
   * 访问控制子导航分区列表
   * @returns 仅管理员可见 members / guest / audit 分区，security 分区所有人可见
   */
  const accessSubnavSections = computed((): Array<{
    id: string
    label: string
    emoji: string
    accent: string
    badge?: number | string
  }> => {
    const sections: Array<{
      id: string
      label: string
      emoji: string
      accent: string
      badge?: number | string
    }> = [{ id: 'security', label: '终端安全', emoji: '🛡️', accent: '#c084fc' }]
    if (isAdmin.value) {
      sections.push({
        id: 'members',
        label: '家庭成员',
        emoji: '👥',
        badge: users.value.length || '',
        accent: '#818cf8',
      })
      sections.push({ id: 'guest', label: '访客分享', emoji: '🔗', accent: '#22d3ee' })
      sections.push({
        id: 'audit',
        label: '命令审计',
        emoji: '📜',
        badge: auditLogs.value.length || '',
        accent: '#f472b6',
      })
    }
    return sections
  })

  /**
   * 从用户名提取首字母缩写（最多 2 位）
   * @param name 用户名，支持空格/点/下划线/连字符分隔
   * @returns 大写首字母缩写，无输入返回 '?'
   */
  function userInitialsOf(name: string | null | undefined) {
    if (!name) return '?'
    const parts = String(name)
      .trim()
      .split(/[\s._-]+/)
      .filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return String(name).slice(0, 2).toUpperCase()
  }

  /**
   * 访客时长预设的显示文案
   * @param h 小时数
   * @returns 友好的时长文案（如 "1 天"）
   */
  function guestPresetLabel(h: number) {
    if (h === 1) return '1 小时'
    if (h === 8) return '8 小时'
    if (h === 24) return '1 天'
    if (h === 48) return '2 天'
    if (h === 72) return '3 天'
    return `${h} 小时`
  }

  /**
   * 格式化访客令牌过期时间
   * @param iso ISO 时间字符串
   * @returns 格式化后的本地时间，空输入返回空字符串
   */
  function formatGuestExpiry(iso: string | null | undefined) {
    if (!iso) return ''
    return formatAuditTime(iso)
  }

  /** 聚焦 PIN 输入框 */
  function focusPinInput() {
    pinInputRef.value?.focus()
  }

  /**
   * PIN 输入清洗：仅保留数字、截断到 6 位，并同步到 layoutConfig
   * @param e 输入事件
   * @sideEffect 更新 layoutStore.layoutConfig.settingsLock.pin 并标记 layoutDirty
   */
  function sanitizePin(e: Event) {
    const val = String((e.target as HTMLInputElement | null)?.value || '')
      .replace(/\D/g, '')
      .slice(0, 6)
    if (layoutStore.layoutConfig.settingsLock) {
      layoutStore.layoutConfig.settingsLock.pin = val
      layoutStore.layoutDirty = true
    }
  }

  /** 与后端 normalizePersonKey 对齐：去掉 person: 前缀，避免 select 因 value 对不上而显示空白 */
  function normalizePresencePersonOptionId(id: unknown): string {
    return String(id || '')
      .replace(/^person:/i, '')
      .trim()
  }

  function mapPresencePersonOptions(
    rows: Array<{ id?: string; name?: string } | null | undefined>,
  ): { id: string; name: string }[] {
    const seen = new Set<string>()
    const out: { id: string; name: string }[] = []
    for (const row of rows) {
      if (!row) continue
      const id = normalizePresencePersonOptionId(row.id)
      const name = String(row.name || '').trim() || id
      if (!id || !name || seen.has(id)) continue
      seen.add(id)
      out.push({ id, name })
    }
    return out
  }

  /**
   * 加载在家人员选项列表
   * 优先用已配置的 presencePersons；自动跟踪模式下回退到 members；最后读系统配置。
   * 任一步 map/filter 为空时继续下一路，避免早退导致下拉只有「不绑定」。
   */
  async function loadPresencePersonOptions() {
    try {
      const data = await loadPresenceHome()
      const fromPersons = mapPresencePersonOptions(
        Array.isArray(data?.persons) ? data.persons : [],
      )
      if (fromPersons.length) {
        presencePersonOptions.value = fromPersons
        return
      }

      const fromMembers = mapPresencePersonOptions(
        Array.isArray(data?.members) ? data.members : [],
      )
      if (fromMembers.length) {
        presencePersonOptions.value = fromMembers
        return
      }

      const res = await fetchSystemConfig()
      const security =
        (res.data as { security?: Record<string, unknown> } | undefined)?.security || {}
      presencePersonOptions.value = mapPresencePersonOptions(
        getPresencePersonsFromSecurity(security),
      )
    } catch (e) {
      logger.debug('加载在家人员列表失败', e)
      presencePersonOptions.value = []
    }
  }

  /**
   * 加载当前用户的个人偏好
   * @sideEffect 并行加载偏好与在家人员选项；失败仅 debug 日志
   */
  async function loadPreferences() {
    try {
      const [prefsRes] = await Promise.all([fetchAuthPreferences(), loadPresencePersonOptions()])
      const data = prefsRes.data || {}
      const boundId = normalizePresencePersonOptionId(data.presencePersonId)
      // 已绑定但不在当前选项里时补一条，避免 native select 因 value 无匹配 option 而显示空白
      if (boundId && !presencePersonOptions.value.some((p) => p.id === boundId)) {
        presencePersonOptions.value = [
          ...presencePersonOptions.value,
          { id: boundId, name: boundId },
        ]
      }
      userPrefs.value = {
        temperatureUnit: (data.temperatureUnit as string) || 'celsius',
        defaultTemperature: Number(data.defaultTemperature) || 24,
        preferredLightKelvin: Number(data.preferredLightKelvin) || 4000,
        autoNightMode: data.autoNightMode !== false,
        nightModeTime: String(data.nightModeTime || '22:00'),
        presencePersonId: boundId,
      }
    } catch (e) {
      logger.debug('加载偏好设置失败', e)
    }
  }
  /**
   * 保存个人偏好
   * @param patch 可选的部分覆盖字段，先合并到 userPrefs 再整体提交
   * @sideEffect 成功 toast；失败 notifyError
   */
  async function savePreferences(patch?: Record<string, unknown>) {
    prefsSaving.value = true
    try {
      if (patch) {
        userPrefs.value = {
          ...userPrefs.value,
          temperatureUnit: (patch.temperatureUnit as string) || userPrefs.value.temperatureUnit,
          defaultTemperature:
            Number(patch.defaultTemperature ?? userPrefs.value.defaultTemperature) || 24,
          preferredLightKelvin:
            Number(patch.preferredLightKelvin ?? userPrefs.value.preferredLightKelvin) || 4000,
          autoNightMode:
            patch.autoNightMode !== undefined
              ? patch.autoNightMode !== false
              : userPrefs.value.autoNightMode !== false,
          nightModeTime: String(patch.nightModeTime ?? userPrefs.value.nightModeTime ?? '22:00'),
          presencePersonId: normalizePresencePersonOptionId(
            patch.presencePersonId ?? userPrefs.value.presencePersonId ?? '',
          ),
        }
      }
      const payload = {
        temperatureUnit: userPrefs.value.temperatureUnit,
        defaultTemperature: Number(userPrefs.value.defaultTemperature) || 24,
        preferredLightKelvin: Number(userPrefs.value.preferredLightKelvin) || 4000,
        autoNightMode: userPrefs.value.autoNightMode !== false,
        nightModeTime: String(userPrefs.value.nightModeTime || '22:00'),
        presencePersonId: normalizePresencePersonOptionId(userPrefs.value.presencePersonId),
      }
      const res = await updateAuthPreferences(payload)
      userPrefs.value = {
        ...userPrefs.value,
        ...(res.data || payload),
        presencePersonId: normalizePresencePersonOptionId(
          (res.data as { presencePersonId?: string } | undefined)?.presencePersonId ??
            payload.presencePersonId,
        ),
      }
      chrome.notify('个人偏好已保存', 'success')
    } catch (e) {
      notifyError(e, '保存失败')
    } finally {
      prefsSaving.value = false
    }
  }

  /**
   * 切换温度单位并自动保存
   * @param unit 目标温标（celsius / fahrenheit）
   */
  async function setTemperatureUnit(unit: string) {
    if (userPrefs.value.temperatureUnit === unit || prefsSaving.value) return
    userPrefs.value.temperatureUnit = unit
    await savePreferences()
  }

  /**
   * 切换设置锁启用状态
   * @sideEffect 不存在 settingsLock 时初始化为 { enabled:false, pin:'' }
   */
  function toggleSettingsLock() {
    if (!layoutConfig.value.settingsLock)
      layoutConfig.value.settingsLock = { enabled: false, pin: '' }
    layoutConfig.value.settingsLock.enabled = !layoutConfig.value.settingsLock.enabled
    layoutStore.layoutDirty = true
  }

  /**
   * 创建访客分享链接
   * @sideEffect 成功生成 shareUrl 与 expiresAt；需 admin 权限，失败 toast
   */
  async function createGuestLink() {
    guestGenerating.value = true
    guestShareUrl.value = ''
    guestExpiresAt.value = ''
    try {
      // 限制 1-168 小时范围
      const hours = Math.min(168, Math.max(1, Math.round(Number(guestHours.value) || 8)))
      guestHours.value = hours
      const restrictions = guestRestrictionsStr.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await createGuestToken({ validHours: hours, restrictions })
      const path = res.data?.shareUrl || ''
      guestExpiresAt.value = res.data?.expiresAt || ''
      // 相对路径补全为绝对 URL
      guestShareUrl.value = path.startsWith('http')
        ? path
        : `${window.location.origin}/#${path.startsWith('/') ? path : `/${path}`}`
      chrome.notify('访客链接已生成', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '生成失败（需 admin 权限）'), 'error')
    } finally {
      guestGenerating.value = false
    }
  }

  /**
   * 复制访客链接到剪贴板
   * @sideEffect 成功 toast；失败则直接展示链接原文
   */
  async function copyGuestUrl() {
    const ok = await copyTextToClipboard(guestShareUrl.value)
    if (ok) chrome.notify('链接已复制到剪贴板', 'success')
    else chrome.notify(guestShareUrl.value, 'info')
  }

  /**
   * 打开新建用户弹层，并切换到 members 分区
   * @param openCreateUser 内部回调，传入分区切换函数
   */
  function openCreate() {
    openCreateUser((section: string) => {
      accessSection.value = section
    })
  }

  /**
   * 加载登录安全策略配置（会话过期天数、锁定策略、刷新间隔）
   * @sideEffect 非 admin 直接返回；失败 toast，不写入 baseline（避免默认值被当成已同步）
   */
  async function loadAuthConfig() {
    if (!isAdmin.value) return
    try {
      const res = await fetchSystemConfig()
      const auth = res.data?.auth || {}
      const frontend = res.data?.frontend || {}
      syncAuthSecurityFromValues({
        sessionExpireDays: Number(auth.sessionExpireDays ?? 30),
        lockoutMaxAttempts: Number(auth.lockoutMaxAttempts ?? 5),
        lockoutMinutes: Number(auth.lockoutMinutes ?? 15),
        sessionRefreshHours: Number(frontend.sessionRefreshHours ?? 6),
      })
      rememberAuthSecurityBaseline()
    } catch (e) {
      logger.error('加载登录会话配置失败', e)
      chrome.notify(getApiErrorMessage(e, '加载登录会话配置失败'), 'error')
    }
  }

  /**
   * 保存登录安全策略（会话过期、锁定、JWT 刷新间隔）
   * @sideEffect 值域裁剪后通过 patchSystemConfig 提交；失败优先交由统一错误处理
   */
  async function saveAuthSecurityConfig() {
    if (!isAdmin.value) return
    authSecuritySaving.value = true
    try {
      const next = syncAuthSecurityFromValues({
        sessionExpireDays: sessionExpireDays.value,
        lockoutMaxAttempts: lockoutMaxAttempts.value,
        lockoutMinutes: lockoutMinutes.value,
        sessionRefreshHours: sessionRefreshHours.value,
      })
      await patchSystemConfig({
        auth: {
          sessionExpireDays: next.sessionExpireDays,
          lockoutMaxAttempts: next.lockoutMaxAttempts,
          lockoutMinutes: next.lockoutMinutes,
        },
        frontend: {
          sessionRefreshHours: next.sessionRefreshHours,
        },
      })
      rememberAuthSecurityBaseline()
      chrome.notify('登录安全策略已保存', 'success')
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) return
      notifyError(e, '保存失败')
    } finally {
      authSecuritySaving.value = false
    }
  }
  // 切换到 access 标签时加载所有子模块数据
  watch(
    () => unref(activeTabSource as MaybeRefOrGetter<string>),
    (tab) => {
      if (tab === 'access') {
        loadUsers()
        loadAudit()
        loadPreferences()
        loadLoginAudits()
        loadAuthConfig()
      }
    },
  )
  // 进入审计分区时刷新登录审计
  watch(accessSection, (section) => {
    if (section === 'audit' && isAdmin.value) loadLoginAudits()
  })
  // 访客时长或限制变化时清空已生成的链接，避免展示过期数据
  watch([guestHours, guestRestrictionsStr], () => {
    if (guestShareUrl.value) {
      guestShareUrl.value = ''
      guestExpiresAt.value = ''
    }
  })
  // 失去 admin 权限时回退到 security 分区，避免越权视图残留（members/guest/audit 均为 admin 专属）
  watch(isAdmin, (admin) => {
    if (
      !admin &&
      (accessSection.value === 'members' ||
        accessSection.value === 'audit' ||
        accessSection.value === 'guest')
    ) {
      accessSection.value = 'security'
    }
  })
  // 侧边栏重入时重置分区到 security
  useSettingsSidebarReentryReset(activeTabSource, 'access', () => {
    accessSection.value = 'security'
  })
  useSettingsHubRouteSection(accessSection, accessSubnavSections, {
    tabId: 'access',
    activeTab: activeTabSource,
  })
  // 挂载时若已处于 access 标签则预加载全部数据（含 MFA 状态）
  onMounted(() => {
    if (unref(activeTabSource) === 'access') {
      loadUsers()
      loadAudit()
      loadPreferences()
      loadMfaStatus()
      loadLoginAudits()
      loadAuthConfig()
    }
  })
  return {
    guestHourPresets,
    layoutStore,
    authStore,
    entitiesStore,
    isAdmin,
    layoutConfig,
    roleOptions,
    accessSection,
    pinInputRef,
    showChangePassword,
    users,
    loading,
    membersLoadError,
    editing,
    memberSaving,
    memberRoleFilter,
    guestHours,
    guestRestrictionsStr,
    guestShareUrl,
    guestExpiresAt,
    guestGenerating,
    auditLogs,
    auditLoading,
    auditPage,
    auditTotalPages,
    auditEntityFilter,
    auditUserFilter,
    auditExporting,
    auditClearing,
    userPrefs,
    presencePersonOptions,
    prefsSaving,
    mfaEnabled,
    mfaQr,
    mfaConfirmCode,
    mfaDisableCode,
    loginAudits,
    loginAuditLoading,
    loginAuditError,
    loginAuditPage,
    loginAuditTotalPages,
    goLoginAuditPage,
    sessionExpireDays,
    lockoutMaxAttempts,
    lockoutMinutes,
    sessionRefreshHours,
    authSecuritySaving,
    authSecurityDirty,
    authSecurityPresetId,
    authSecuritySummary,
    loginAuditOkCount,
    loginAuditFailCount,
    recentLoginFail,
    applyAuthSecurityPreset,
    lockEnabled,
    pinLength,
    isWeakPin,
    adminCount,
    userInitials,
    securityScore,
    securityLevelLabel,
    securityLevelClass,
    sessionEyebrow,
    pinStrengthPercent,
    pinStrengthLabel,
    pinStrengthVariant,
    accessSubnavSections,
    memberRoleTabs,
    filteredUsers,
    auditSuccessCount,
    auditFailCount,
    auditUserOptions,
    onAuditEntityPick,
    roleMeta,
    userInitialsOf,
    guestPresetLabel,
    formatGuestExpiry,
    focusPinInput,
    sanitizePin,
    loadPreferences,
    savePreferences,
    loadMfaStatus,
    startMfaSetup,
    confirmMfaSetup,
    disableMfa,
    loadLoginAudits,
    loadAuthConfig,
    saveAuthSecurityConfig,
    setTemperatureUnit,
    formatAuditTime,
    loadAudit,
    queryAudit,
    goAuditPage,
    clearAuditLogs,
    exportAuditCsv,
    toggleSettingsLock,
    createGuestLink,
    copyGuestUrl,
    loadUsers,
    openCreate,
    openEdit,
    saveUser,
    removeUser,
    Lock,
    ShieldCheck,
    KeyRound,
    Thermometer,
    UserPlus,
    Link2,
    Copy,
    Loader2,
    Users,
    ScrollText,
    X,
    Trash2,
  }
}