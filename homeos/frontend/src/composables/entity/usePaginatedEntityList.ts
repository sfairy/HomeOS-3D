/**
 * @file usePaginatedEntityList.ts
 * @module composables/entity
 * @description 大户型设备列表分页查询 composable。
 *
 * 职责：通过 REST 分页拉取设备列表，避免前端遍历全量 entities Map；
 *      支持域过滤、关键字搜索（防抖）、状态过滤、房间过滤、排序；
 *      使用序号守卫丢弃过期响应，避免快速切换时旧响应覆盖新列表。
 *
 * 依赖：
 * - vue（ref、watch、Ref）
 * - @/services/api/entities（fetchEntities）
 * - @/utils/core/error-message（API 错误文案兜底）
 * - @/types/device（DeviceFilterState）
 */
import { ref, watch, type Ref } from 'vue'
import { fetchEntities } from '@/services/api/entities'
import { getApiErrorMessage } from '@/utils/core/error-message'
import type { DeviceFilterState } from '@/types/device'

const PAGE_SIZE = 200
const SEARCH_DEBOUNCE_MS = 250

/** 把前端排序枚举映射为后端 sort 参数（last-changed -> last_changed） */
function mapSortToApi(sort: DeviceFilterState['sort']): string {
  if (sort === 'name-asc') return 'name_asc'
  if (sort === 'name-desc') return 'name_desc'
  if (sort === 'last-changed') return 'last_changed'
  return sort
}

/** 把前端状态枚举映射为后端 status 参数（low-battery -> low_battery；all -> 空） */
function mapStatusToApi(status: DeviceFilterState['status']): string {
  if (status === 'low-battery') return 'low_battery'
  return status === 'all' ? '' : status
}

/**
 * 大户型设备列表：走 REST 分页，避免前端遍历全量 entities Map。
 *
 * @param domain 当前 domain 过滤
 * @param search 搜索关键字（自动防抖）
 * @param filter 过滤条件（状态/房间/可控/排序）
 * @param roomAreaId 房间区域 ID（优先于 filter.room）
 * @returns items 当前页条目；total 总数；page 当前页；totalPages 总页数；
 *          loading 加载中标志；error/errorDetail 错误态；refresh 重新加载方法；pageSize 每页大小
 */
export function usePaginatedEntityList({
  domain,
  search,
  filter,
  roomAreaId,
}: {
  domain: Ref<string>
  search: Ref<string>
  filter?: Ref<DeviceFilterState>
  roomAreaId?: Ref<string>
}) {
  const items = ref<Array<{ entity_id: string; [key: string]: unknown }>>([])
  const total = ref(0)
  const page = ref(1)
  const totalPages = ref(1)
  const loading = ref(false)
  const error = ref(false)
  /** 错误摘要：面向用户的可读详情，供页面错误态展示（区别于布尔 error 标记） */
  const errorDetail = ref('')
  // 防抖后的搜索关键字：避免每次按键都触发请求
  const debouncedSearch = ref(search.value ?? '')

  // 序号守卫：每次请求自增，响应回来时若序号已过期则丢弃
  let fetchSeq = 0

  /**
   * 拉取当前页：根据 domain/search/filter/roomAreaId 构造查询参数，
   * 失败时清空列表并填充错误文案。
   */
  async function fetchPage() {
    // 序号守卫：快速切换域/搜索时丢弃过期响应，避免旧响应覆盖新列表
    const seq = ++fetchSeq
    loading.value = true
    error.value = false
    errorDetail.value = ''
    try {
      const params: Record<string, string | number> = { page: page.value, limit: PAGE_SIZE }
      if (domain.value && domain.value !== 'all') params.domain = domain.value
      const q = debouncedSearch.value?.trim()
      if (q) params.search = q
      const f = filter?.value
      if (f) {
        const status = mapStatusToApi(f.status)
        if (status) params.status = status
        // 房间优先取 roomAreaId，否则用 filter.room
        const area = roomAreaId?.value ?? f.room
        if (area) params.area = area
        if (f.controllableOnly) params.controllable = '1'
        const sort = mapSortToApi(f.sort)
        if (sort) params.sort = sort
      }
      const { data } = await fetchEntities(params, { timeout: 60000 })
      // 序号过期：丢弃本次响应
      if (seq !== fetchSeq) return
      items.value = data?.entities || []
      total.value = data?.total ?? items.value.length
      totalPages.value = data?.totalPages ?? Math.max(1, Math.ceil(total.value / PAGE_SIZE))
    } catch (e) {
      if (seq !== fetchSeq) return
      // 失败时清空列表，避免残留过期数据
      items.value = []
      total.value = 0
      totalPages.value = 1
      error.value = true
      errorDetail.value = getApiErrorMessage(e, '加载设备列表失败，请稍后重试')
    } finally {
      // 仅当本次响应仍是最新的才关闭 loading，避免被过期响应错误地关闭
      if (seq === fetchSeq) loading.value = false
    }
  }

  // 搜索防抖：SEARCH_DEBOUNCE_MS 后写入 debouncedSearch，触发后续 watch
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    search,
    (val) => {
      if (searchTimer) clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        debouncedSearch.value = val ?? ''
      }, SEARCH_DEBOUNCE_MS)
    },
    { immediate: true },
  )

  // 域或搜索变化时重置回第 1 页
  watch([domain, debouncedSearch], () => {
    page.value = 1
  })
  // 任意过滤条件变化触发拉取（deep 监听 filter/roomAreaId 的对象变化）
  watch([domain, debouncedSearch, page, () => filter?.value, () => roomAreaId?.value], fetchPage, {
    immediate: true,
    deep: true,
  })

  return {
    items,
    total,
    page,
    totalPages,
    loading,
    error,
    errorDetail,
    refresh: fetchPage,
    pageSize: PAGE_SIZE,
  }
}
