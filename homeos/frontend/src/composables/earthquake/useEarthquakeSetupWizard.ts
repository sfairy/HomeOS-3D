/**
 * 地震预警配置向导组合式函数
 *
 * 职责：引导用户完成 EEW（地震预警系统）配置的三步式向导——HOME ASSISTANT 连接测试 → 家庭坐标填写 → 完成；
 *      提供 HA 连接测试、城市预设选择（EEW_CITY_PRESETS）、从 HA 同步家庭坐标、跳过向导等交互能力；
 *      完成后写入 localStorage 标记避免重复弹出。
 * 交互状态：step（1/2/3）、haUrl、haToken、经纬度、testingHa、syncing、saving、haTestStatus、
 *          haTestMessage（失败原因）、haVersion。
 * 返回方法：selectCity、testHa、syncFromHa、nextStep、finish、skip 与全部响应式字段。
 * 边界：HA 已配置或已连接时自动跳过第 1 步进入坐标；进入坐标步骤时静默自动同步一次家庭坐标
 *      （失败不打断，用户仍可手动同步或选城市预设）；跳过向导禁用地震预警并异步保存布局，不阻塞 UI。
 */
import { writeLocalStorage } from '@/utils/core/local-storage.util'

import { ref, watch, computed } from 'vue'
import { testHaConnection } from '@/services/api/ha'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useHaConnectionStore } from '@/stores/ha-connection.store'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { EEW_CITY_PRESETS, createDefaultEarthquakeConfig } from '@/types/earthquake'
import { syncEarthquakeHomeCoordsFromHa } from '@/utils/earthquake/ha-coords.util'
import { getApiErrorMessage } from '@/utils/core/error-message'

/**
 * 地震预警配置向导 composable
 *
 * 模块职责：
 *  - 引导用户完成 EEW（地震预警）配置：HOME ASSISTANT 连接 → 坐标 → 完成；
 *  - 提供 HA 连接测试、城市预设选择、从 HA 同步坐标等交互能力；
 *  - 完成后写入 localStorage 标记，避免重复弹出。
 *
 * 依赖：
 *  - @/services/api/orchestrator（testHaConnection 测试 HA 连接）；
 *  - @/stores/layout.store（读写 layoutConfig、保存布局）；
 *  - @/stores/chrome.store（通知）；
 *  - @/stores/auth.store（判断认证状态以决定是否拉取配置）；
 *  - @/stores/entities.store（判断 HA 是否已连接）；
 *  - @/utils/earthquake/earthquake-ha-coords.util（从 HA 同步家庭坐标）。
 */

/**
 * 地震预警配置向导 composable。
 *
 * @param props.modelValue 向导是否打开（v-model）
 * @param emit.update:modelValue 同步打开状态
 * @param emit.close        关闭事件
 * @returns 向导所需的响应式状态与方法（step / haUrl / haToken / 坐标 / testHa / syncFromHa / finish / skip 等）
 */
export function useEarthquakeSetupWizard(
  props: { modelValue: boolean },
  emit: {
    (e: 'update:modelValue', value: boolean): void
    (e: 'close'): void
  },
) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const authStore = useAuthStore()
  const entitiesStore = useEntitiesStore()
  const haConnectionStore = useHaConnectionStore()

  // v-model 代理：读写 props.modelValue
  const open = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
  })

  /**
   * 确保 layoutConfig.earthquakeConfig 存在；不存在则创建默认结构。
   * @returns 当前地震预警配置对象（确保非空）
   */
  function ensureEarthquakeConfig() {
    if (!layoutStore.layoutConfig.earthquakeConfig) {
      layoutStore.layoutConfig.earthquakeConfig = createDefaultEarthquakeConfig()
    }
    return layoutStore.layoutConfig.earthquakeConfig
  }

  /** 当前生效的 HA 地址（只读展示；连接地址单源在 stores/ha-connection.store.ts）。 */
  const haUrl = computed(() => haConnectionStore.baseUrl)

  /**
   * 判断系统中是否已配置 HOME ASSISTANT（有连接记录且保存过令牌）。
   *
   * 阶段 3.3 起不再读 `layoutConfig.haConfig.url/token` —— 那是第二份连接配置源。
   */
  function isHaConfiguredInSystem() {
    return haConnectionStore.configured && haConnectionStore.hasToken
  }

  /**
   * 解析向导初始步骤。
   *  - 若系统中已配置 HA 或 HA 实体已连接，跳过第 1 步（HA 配置），从第 2 步（坐标）开始；
   *  - 否则从第 1 步开始。
   * @returns 初始步骤序号（1 或 2）
   */
  function resolveInitialStep() {
    if (isHaConfiguredInSystem() || entitiesStore.connected) return 2
    return 1
  }

  // —— 表单响应式状态 ——
  /** 当前向导步骤（1=HA 配置，2=坐标，3=完成） */
  const step = ref(1)
  /** 纬度输入 */
  const latitude = ref('')
  /** 经度输入 */
  const longitude = ref('')
  /** HA 连接测试进行中 */
  const testingHa = ref(false)
  /** HA 测试状态：'' | 'success' | 'failed' */
  const haTestStatus = ref('')
  /** 测试失败时的具体原因（例如地址不合法 / 令牌无效 / 容器内不可达），用于替代笼统的"连接失败" */
  const haTestMessage = ref('')
  /** 测试成功时返回的 HA 版本号 */
  const haVersion = ref('')
  /** 从 HA 同步坐标进行中 */
  const syncing = ref(false)
  /** 保存配置进行中 */
  const saving = ref(false)
  /** 城市预设列表（来自 EEW_CITY_PRESETS 常量） */
  const cityPresets = EEW_CITY_PRESETS

  const cfg = computed(() => ensureEarthquakeConfig())
  const systemHaConfigured = computed(() => isHaConfiguredInSystem())

  /** 是否可以发起 HA 连接测试（有地址即可；令牌留在服务端，无需前端持有）。 */
  const canTestHa = computed(() => Boolean(haUrl.value.trim()))

  /**
   * 从服务端与本店配置加载向导初始状态。
   *  - HA 地址只读展示（来自连接记录），不再由向导编辑；
   *  - 若 HA 实体已连接，直接标记测试状态为 success；
   *  - 通过 resolveInitialStep 决定起始步骤。
   */
  async function loadFromSystem() {
    const eq = ensureEarthquakeConfig()

    // 连接记录是地址的唯一来源；向导只读展示，编辑入口在「设置 → 连接」。
    await haConnectionStore.load()
    latitude.value = String(eq.latitude || '')
    longitude.value = String(eq.longitude || '')
    haTestStatus.value = ''
    haTestMessage.value = ''
    haVersion.value = ''
    // 重新打开向导视为新会话，允许再次自动同步
    autoSyncAttempted = false
    step.value = resolveInitialStep()

    if (entitiesStore.connected) {
      haTestStatus.value = 'success'
    }

    // 已配置 HA 时直接落在坐标步骤，同样触发一次静默自动同步
    if (step.value === 2) void maybeAutoSyncCoords()
  }

  // 向导打开时：若配置未加载且已认证，则先加载配置；再从系统填充表单
  watch(open, async (v) => {
    if (!v) return
    if (!layoutStore.isConfigLoaded && authStore.isAuthenticated) {
      try {
        await layoutStore.loadConfig()
      } catch {
        /* 使用内存中已有配置 */
      }
    }
    await loadFromSystem()
  })

  /**
   * 选择城市预设，自动填充经纬度。
   * @param city 城市预设对象（含 lat / lon）
   */
  function selectCity(city: { lat: number; lon: number }) {
    latitude.value = String(city.lat)
    longitude.value = String(city.lon)
  }

  /**
   * 测试 HOME ASSISTANT 连接。
   * 调用后端 testHaConnection 接口，成功时记录 HA 版本并标记 success。
   * @throws 不抛出，所有异常都转化为 haTestStatus='failed'
   */
  async function testHa() {
    testingHa.value = true
    haTestStatus.value = ''
    haTestMessage.value = ''
    try {
      // 令牌留在服务端：只发地址，后端用已保存的令牌探测（/ha/test 的 accessToken 可省略）。
      const { data } = await testHaConnection({ baseUrl: haUrl.value.trim() })
      if (data.endpoints?.some((item) => item.ok)) {
        haVersion.value = data.version || ''
        haTestStatus.value = 'success'
      } else {
        haTestStatus.value = 'failed'
        // 后端返回不可达端点与原因，透传给用户，避免笼统误报为「连接失败」
        const failed = (data.endpoints || []).filter((item) => !item.ok)
        haTestMessage.value = failed.length
          ? `地址不可达：${failed.map((item) => `${item.label}（${item.error || '失败'}）`).join('；')}`
          : ''
      }
    } catch (e: unknown) {
      haTestStatus.value = 'failed'
      haTestMessage.value = getApiErrorMessage(e, '')
    } finally {
      testingHa.value = false
    }
  }

  /**
   * 从 HOME ASSISTANT 同步家庭坐标。
   *  1. 调用 syncEarthquakeHomeCoordsFromHa 拉取 HA 中的家庭坐标（后端从连接记录取地址）；
   *  2. 回填到表单的 latitude / longitude。
   * 失败时通过 chrome.notify 提示用户。
   */
  async function syncFromHa() {
    syncing.value = true
    try {
      await syncEarthquakeHomeCoordsFromHa((lat, lon) => {
        latitude.value = lat
        longitude.value = lon
      })
    } catch {
      chrome.notify('同步失败', 'error')
    } finally {
      syncing.value = false
    }
  }

  /** 本次向导会话内是否已尝试过自动同步（成功或失败都只尝试一次，避免反复请求） */
  let autoSyncAttempted = false

  /**
   * 判断当前是否适合自动同步坐标。
   * 条件：本次会话未尝试过、当前未在同步中、坐标尚未填写、且 HA 已配置或已连接。
   * @returns true 表示可以发起自动同步
   */
  function canAutoSyncCoords() {
    return (
      !autoSyncAttempted &&
      !syncing.value &&
      !latitude.value.trim() &&
      !longitude.value.trim() &&
      (systemHaConfigured.value || entitiesStore.connected)
    )
  }

  /**
   * 进入坐标步骤时静默自动同步一次家庭坐标。
   *  失败不打断流程也不弹警告（用户仍可点击「从 HA 自动同步」或选城市预设），
   *  成功则由 syncEarthquakeHomeCoordsFromHa 给出提示并回填经纬度。
   */
  async function maybeAutoSyncCoords() {
    if (!canAutoSyncCoords()) return
    autoSyncAttempted = true
    syncing.value = true
    try {
      // 不调用 applyHaFormToStore：后端从自身 HA 配置读取坐标，与前端表单未保存的编辑无关，
      // 写入 store 既无助于同步结果，还可能在 URL 为空时把默认 localhost 回填进内存配置。
      await syncEarthquakeHomeCoordsFromHa(
        (lat, lon) => {
          latitude.value = lat
          longitude.value = lon
        },
        { silent: true },
      )
    } catch {
      /* 自动同步失败保持静默，交由用户手动重试 */
    } finally {
      syncing.value = false
    }
  }

  /**
   * 进入下一步。
   *  - step 1 → 2：直接进入坐标步骤（HA 连接已在「设置 → 连接」保存，向导不再写连接配置）；
   *  - step 2 → 3：保存坐标到 cfg，若坐标有效则启用地震预警，进入完成步骤。
   */
  function nextStep() {
    if (step.value === 1) {
      step.value = 2
      // 进入坐标步骤时静默同步一次家庭坐标，省去用户手动点击
      void maybeAutoSyncCoords()
      return
    }
    if (step.value === 2) {
      cfg.value.latitude = latitude.value
      cfg.value.longitude = longitude.value
      if (latitude.value && longitude.value) cfg.value.enabled = true
      step.value = 3
    }
  }

  /**
   * 完成向导并保存配置。
   *  1. 写入 HA 表单到 store；
   *  2. 写入坐标到 cfg 并强制启用地震预警与 TTS（enableTts 默认开启）；
   *  3. 保存布局（saveLayout(true)）；
   *  4. 若已认证，重新加载配置以同步后端；
   *  5. 标记 localStorage 'eew_wizard_completed' = '1'；
   *  6. 关闭向导并发出 success 通知。
   * 失败时通过 notify 提示错误信息。
   * @throws 不抛出，所有异常都转化为错误通知
   */
  async function finish() {
    saving.value = true
    try {
      cfg.value.latitude = latitude.value
      cfg.value.longitude = longitude.value
      cfg.value.enabled = true
      cfg.value.enableTts = cfg.value.enableTts !== false
      const ok = await layoutStore.saveLayout(true)
      if (!ok) return
      if (authStore.isAuthenticated) await layoutStore.loadConfig()
      writeLocalStorage('eew_wizard_completed', '1')
      open.value = false
      emit('close')
      chrome.notify('地震预警配置已保存', 'success')
    } catch (e: unknown) {
      chrome.notify(`保存失败: ${getApiErrorMessage(e, '请稍后重试')}`, 'error')
    } finally {
      saving.value = false
    }
  }

  /**
   * 跳过向导。
   *  - 禁用地震预警（cfg.enabled = false）；
   *  - 立即标记 localStorage 并关闭向导（勿阻塞于 saveLayout，否则保存失败/慢时像“点了没反应”）；
   *  - 后台尽力保存布局；失败时已关闭向导且不再弹出，避免挡住主流程。
   *  - 发出 warning 通知提示用户可在设置中启用。
   */
  function skip() {
    cfg.value.enabled = false
    writeLocalStorage('eew_wizard_completed', '1')
    open.value = false
    emit('close')
    chrome.notify('已跳过地震预警配置，可在设置中随时启用', 'warning', 5000)
    void layoutStore.saveLayout(true)
  }

  return {
    open,
    step,
    haUrl,
    latitude,
    longitude,
    testingHa,
    haTestStatus,
    haTestMessage,
    haVersion,
    syncing,
    saving,
    cityPresets,
    cfg,
    systemHaConfigured,
    canTestHa,
    entitiesStore,
    haConnectionStore,
    selectCity,
    testHa,
    syncFromHa,
    nextStep,
    finish,
    skip,
  }
}