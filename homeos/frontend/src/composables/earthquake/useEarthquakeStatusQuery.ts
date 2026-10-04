/**
 * 地震预警数据源连接状态查询组合式函数
 *
 * 职责：封装对后端地震预警状态接口的轮询或手动查询；从原始 payload 中派生出
 *      connected（已连接预警源）与 connecting（正在连接）两个布尔状态，供 UI 渲染连接指示灯。
 * 入参：options.immediate 是否立即发起查询（默认 true）
 * 返回：useApiQuery 原始能力（data / loading / error / refresh / reload 等）+ connected + connecting
 * 解析策略：connected 优先取顶层 payload.connected，其次回退 wolfx.clusterConnected / wolfx.connected；
 *         connecting 取未连接且 wolfx.state === 'connecting'。
 */
import { ref, watch } from 'vue'
import { useApiQuery } from '@/composables/api/useApiQuery'
import { fetchEarthquakeStatus, type EarthquakeStatusPayload } from '@/services/api/earthquake'

/**
 * 地震预警连接状态查询 composable（配合轮询或手动 refresh）。
 *
 * 模块职责：
 *  - 封装对后端地震预警状态接口的查询；
 *  - 从 payload 中派生 connected（已连接）/ connecting（连接中）状态。
 *
 * 依赖：
 *  - @/composables/api/useApiQuery（通用查询封装，支持 immediate/refresh/loading 等）；
 *  - @/services/api/earthquake（获取状态 payload）。
 *
 * @param options.immediate 是否立即发起查询，默认 true
 * @returns query 原始能力 + connected + connecting 派生态
 */
export function useEarthquakeStatusQuery(options: { immediate?: boolean } = {}) {
  const query = useApiQuery<EarthquakeStatusPayload>(
    async () => ({ data: await fetchEarthquakeStatus() }),
    { immediate: options.immediate !== false },
  )

  /** 是否已连接到预警数据源 */
  const connected = ref(false)
  /** 是否正在连接中（未连接且 wolfx.state === 'connecting'） */
  const connecting = ref(false)

  watch(
    query.data,
    (payload) => {
      if (!payload) {
        // payload 为空时统一重置为未连接
        connected.value = false
        connecting.value = false
        return
      }
      const wolfx = payload.wolfx
      // connected 优先取顶层字段，其次取 wolfx 集群/单点的 connected 字段
      connected.value = Boolean(payload.connected ?? wolfx?.clusterConnected ?? wolfx?.connected)
      connecting.value = !connected.value && wolfx?.state === 'connecting'
    },
    { immediate: true },
  )

  return {
    ...query,
    connected,
    connecting,
  }
}