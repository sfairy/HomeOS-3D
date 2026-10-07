/**
 * HA 连接状态 Store（单源：`ha_connections` 表）
 *
 * 阶段 3.3 前，HA 地址与令牌散落在 `layoutConfig.haConfig`（项目 layout JSON）里：
 * 设置页写入 layout、后端 `ha_config.py` 从 layout 读、安防监控与地震向导各自再读一遍。
 * 现在唯一写入方是 `PUT /ha/connection`，前端统一从这里读当前生效的地址。
 *
 * 职责：
 * - 维护连接记录快照（`GET /ha/connection`）与加载/保存状态；
 * - 提供 `baseUrl`（跟随 failover 的实际地址）给需要拼 HA 绝对 URL 的消费者
 *   （摄像头快照/HLS、地震坐标同步）；
 * - 提供 `save()` / `load()` 两个动作，令牌始终留在服务端，前端只持有 `hasToken`。
 *
 * @module stores/ha-connection.store
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  deleteHaConnection as apiDeleteHaConnection,
  getHaConnection,
  saveHaConnection,
  type HaConnectionInput,
  type HaConnectionStatus,
} from '@/services/api/ha'

export const useHaConnectionStore = defineStore('haConnection', () => {
  /** 服务端下发的连接状态；尚未加载时为 null。 */
  const status = ref<HaConnectionStatus | null>(null)
  const loading = ref(false)
  const saving = ref(false)

  /** 是否已成功读取过连接状态（含「未配置」这一合法结果）。 */
  const loaded = ref(false)
  const configured = computed(() => Boolean(status.value?.configured))
  /** 是否保存过访问令牌（令牌本身不下发，前端只能知道有没有）。 */
  const hasToken = computed(() => Boolean(status.value?.hasToken))
  /** 连接器当前是否已连接。 */
  const connected = computed(() => Boolean(status.value?.connected))
  /**
   * 当前生效的 HA 地址（跟随 failover）。
   *
   * 用于拼接摄像头快照/HLS 等需要 HA 绝对 URL 的场景；未连接时回落到局域网地址，
   * 都没有时返回空串（调用方据此降级）。
   */
  const baseUrl = computed(() => (status.value?.activeBaseUrl || status.value?.baseUrl || '').trim())

  /**
   * 读取连接记录。
   *
   * 失败时不抛异常、也不清空已有快照：连接状态属「尽力而为」的展示数据，
   * 不该让一次网络抖动把监控面板打回空白。
   */
  async function load(): Promise<HaConnectionStatus | null> {
    if (loading.value) return status.value
    loading.value = true
    try {
      const { data } = await getHaConnection()
      status.value = data
      loaded.value = true
      return data
    } catch {
      return status.value
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存连接（后端先探测再落库，失败时抛错，由调用方展示原因）。
   * @param payload 连接输入；`accessToken` 留空表示复用已保存令牌
   */
  async function save(payload: HaConnectionInput): Promise<HaConnectionStatus> {
    saving.value = true
    try {
      const { data } = await saveHaConnection(payload)
      status.value = data
      loaded.value = true
      return data
    } finally {
      saving.value = false
    }
  }

  /** 删除连接记录并同步本地快照。 */
  async function remove(): Promise<void> {
    await apiDeleteHaConnection()
    status.value = null
    await load()
  }

  /** 退出登录或切换账号时清空，避免把上一个账号的连接信息留在内存里。 */
  function reset(): void {
    status.value = null
    loaded.value = false
  }

  return {
    status,
    loading,
    saving,
    loaded,
    configured,
    hasToken,
    connected,
    baseUrl,
    load,
    save,
    remove,
    reset,
  }
})
