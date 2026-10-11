/** 地震预警数据源连接状态查询组合式函数 */
import { ref, watch } from 'vue'
import { useApiQuery } from '@/composables/api/useApiQuery'
import { fetchEarthquakeStatus, type EarthquakeStatusPayload } from '@/services/api/earthquake'

/**
 * 地震预警连接状态查询 composable（配合轮询或手动 refresh）。
 * - 封装对后端地震预警状态接口的查询；
 * - 从 payload 中派生 connected（已连接）/ connecting（连接中）状态。
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