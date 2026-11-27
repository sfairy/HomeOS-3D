/**
 * 背景图库业务逻辑：目录导航、分批上传、删除、路径复制。
 *
 * 只服务仪表盘开 / 关灯背景图（`/config/backgrounds`）：没有搜索、视图切换与
 * 新建文件夹 —— 素材量级是「个位数到几十张」，这些入口只会挤占工具栏。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { copyTextWithNotify, notifyError } from '@/kernel/ui/notify'
import { getApiErrorMessage } from '@/kernel/core/error-message'
import { deleteConfigAsset, listConfigAssets, uploadConfigAsset } from '@/domain/api/config'

/**
 * 资源条目数据结构。
 */
export interface AssetItem {
  /** 条目名称（文件名或目录名） */
  name: string
  /** 条目类型：file 文件 / dir 目录 */
  type: 'file' | 'dir'
  /** 文件的可访问 URL（目录无此字段） */
  url?: string
}

/**
 * 资源管理器组件的属性配置。
 */
interface AssetManagerProps {
  /** 是否为选择器模式：点击文件时触发 select 事件而非打开 */
  isPicker?: boolean
}

/**
 * 背景图库固定管理的后端资源分组。
 */
const ASSET_API_BASE = 'backgrounds'

/**
 * 单次批量上传允许的最大文件数（与后端 `MAX_UPLOAD_FILES` 一致）。
 */
export const MAX_UPLOAD_FILES = 100

/**
 * 每个上传请求携带的文件数。
 *
 * 后端以 memoryStorage 接收文件，单请求文件越多内存峰值越高、越容易触发代理/网关超时；
 * 因此超过该数量时按批串行提交，牺牲少量往返换取稳定性。
 */
const UPLOAD_BATCH_SIZE = 20

/**
 * 单次批量上传的进度。
 */
interface UploadProgress {
  /** 已完成（成功或失败）的文件数 */
  done: number
  /** 本次上传的文件总数 */
  total: number
}

/**
 * 资源管理器组合式函数入口。
 * @param props 组件属性
 * @param emit select 事件发射器，选择文件时触发（回传可访问 URL）
 * @returns 资源管理器所需的全部响应式状态与操作方法
 */
export function useAssetManager(props: AssetManagerProps, emit: (event: 'select', value: string) => void) {
  const chrome = useChromeStore()

  // 目录列表缓存：key 为相对路径，避免重复请求
  const listCache = new Map<string, AssetItem[]>()
  /** 当前所在目录的相对路径（空字符串表示根目录） */
  const currentPath = ref('')
  /** 当前目录下的条目列表 */
  const items = ref<AssetItem[]>([])
  /** 是否正在加载 */
  const loading = ref(false)
  /**
   * 上传进度：null 表示当前没有进行中的上传。
   * 分批提交时用于向用户展示「已完成 X / 共 Y」。
   */
  const uploadProgress = ref<UploadProgress | null>(null)
  /** 文件输入框 DOM 引用，用于触发上传对话框 */
  const fileInput = ref<HTMLInputElement | null>(null)
  /** 预览失败的条目名集合，避免对失败条目反复尝试加载图片 */
  const previewErrors = ref(new Set<string>())

  /**
   * 面包屑导航：根据当前路径拆分为多级，首项固定为根目录。
   * 保留目录导航是为了兼容历史版本建过的子目录。
   */
  const breadcrumbs = computed(() => {
    const parts = currentPath.value.split('/').filter((part) => !!part)
    const crumbs = [{ name: '🏠 根目录', path: '' }]
    let path = ''
    parts.forEach((part) => {
      path = path ? `${path}/${part}` : part
      crumbs.push({ name: part, path })
    })
    return crumbs
  })

  /** 排序后的条目列表：目录优先，其次按名称（中文 locale）升序。 */
  const sortedItems = computed(() =>
    [...items.value].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    }),
  )

  /** 是否启用虚拟网格：条目数大于 24 时启用，优化大量数据渲染 */
  const useVirtualGrid = computed(() => sortedItems.value.length > 24)
  /** 网格列数（弹窗内固定 4 列） */
  const gridColumns = computed(() => 4)
  /** 网格行高：背景图预览较高（132） */
  const gridRowHeight = computed(() => 132)

  /**
   * 规范化单个条目：将 URL 中的反斜杠统一为正斜杠，避免 Windows 路径风格导致前端加载失败。
   * @param item 原始条目
   * @returns 规范化后的条目（浅拷贝）
   */
  function normalizeItem(item: AssetItem) {
    if (!item?.url) return item
    return { ...item, url: String(item.url).replace(/\\/g, '/') }
  }

  /**
   * 规范化条目列表。
   * @param list 原始列表
   * @returns 规范化后的列表
   */
  function normalizeList(list: AssetItem[]) {
    return list.map(normalizeItem)
  }

  /**
   * 清空全部缓存（用于上传、删除等变更后强制重新拉取）。
   */
  function invalidateCache() {
    listCache.clear()
  }

  /**
   * 判断条目是否可预览：必须为文件、存在 URL，且不在预览失败集合中。
   * @param item 待判断条目
   * @returns 是否可预览
   */
  function canPreview(item: AssetItem) {
    if (!item || item.type !== 'file' || !item.url) return false
    return !previewErrors.value.has(item.name)
  }

  /**
   * 记录预览失败的条目名，后续渲染将跳过该条目的图片预览。
   * @param name 失败条目名
   */
  function onPreviewError(name: string) {
    const next = new Set(previewErrors.value)
    next.add(name)
    previewErrors.value = next
  }

  /**
   * 计算条目相对于当前路径的完整相对路径。
   * @param item 条目
   * @returns 形如 "a/b/name" 的相对路径
   */
  function relativeItemPath(item: AssetItem) {
    return currentPath.value ? `${currentPath.value}/${item.name}` : item.name
  }

  /**
   * 加载当前目录下的资源列表。
   * 优先读取缓存；缓存未命中时调用后端 API，成功后写入缓存。
   * 失败时通过通知提示用户。
   */
  async function loadItems() {
    const cached = listCache.get(currentPath.value)
    if (cached) {
      items.value = normalizeList(cached)
      previewErrors.value = new Set()
      return
    }

    loading.value = true
    try {
      const res = await listConfigAssets(ASSET_API_BASE, currentPath.value)
      const data = res.data
      if (data.success) {
        const next = normalizeList(data.data)
        listCache.set(currentPath.value, next)
        items.value = next
        previewErrors.value = new Set()
      }
    } catch (error) {
      notifyError(error, '加载资源')
    } finally {
      loading.value = false
    }
  }

  /**
   * 跳转至指定路径（面包屑点击）。
   * @param path 目标路径，空字符串表示根目录
   */
  function navigateTo(path: string) {
    currentPath.value = path
  }

  /**
   * 条目点击处理：目录则进入；文件在 picker 模式下触发 select 事件（回传可访问 URL）。
   * @param item 被点击的条目
   */
  function onItemClick(item: AssetItem) {
    if (item.type === 'dir') {
      currentPath.value = relativeItemPath(item)
    } else if (props.isPicker && item.url) {
      emit('select', item.url)
    }
  }

  /**
   * 触发文件选择对话框：通过程序点击隐藏的 file input 实现。
   */
  function triggerUpload() {
    fileInput.value?.click()
  }

  /**
   * 文件上传处理：校验数量上限后交给 handleFiles 分批上传。
   * @param event 文件选择事件
   */
  async function onUpload(event: Event) {
    const target = event.target as HTMLInputElement
    const files = target.files
    if (!files?.length) return
    try {
      await handleFiles(Array.from(files))
    } finally {
      // 重置 file input，使同一文件可被再次选择
      if (fileInput.value) fileInput.value.value = ''
    }
  }

  /**
   * 拖拽上传入口：由视图层的 drop 事件把文件列表转交过来。
   * @param files 拖入的文件列表
   */
  async function onDropFiles(files: File[]) {
    if (!files?.length) return
    await handleFiles(files)
  }

  /**
   * 统一的上传编排：数量校验 → 分批串行提交 → 汇总结果 → 刷新列表。
   * @param fileList 待上传文件列表
   */
  async function handleFiles(fileList: File[]) {
    // 数量上限：超出部分直接拒绝，避免误拖整个目录时静默丢文件
    if (fileList.length > MAX_UPLOAD_FILES) {
      chrome.notify(
        `单次最多上传 ${MAX_UPLOAD_FILES} 个文件，当前选中 ${fileList.length} 个，请分批上传`,
        'error',
        4000,
      )
      return
    }

    const { uploaded, errors } = await uploadInBatches(fileList)

    // 仅在确有文件落盘时刷新列表，避免整批失败也触发一次无谓的重新拉取
    if (uploaded > 0) {
      invalidateCache()
      await loadItems()
    }

    if (errors.length === 0) {
      chrome.notify(`上传成功：${uploaded} 个文件`, 'success', 2000)
      return
    }
    if (uploaded === 0) {
      chrome.notify(`上传失败: ${errors[0]}`, 'error', 4000)
      return
    }
    // 部分成功：明确告知成功与失败数量，避免用户以为整批都失败
    chrome.notify(`部分上传成功：${uploaded} 个，失败 ${errors.length} 个（${errors[0]}）`, 'warning', 5000)
  }

  /**
   * 按 UPLOAD_BATCH_SIZE 分批串行上传。
   *
   * 串行而非并行：后端用 memoryStorage 接收，并行批次会叠加内存峰值。
   * 单批失败不中断后续批次，尽量把能传的都传上去。
   *
   * @param fileList 待上传文件列表
   * @returns 成功上传的文件数与去重后的错误信息列表
   */
  async function uploadInBatches(fileList: File[]): Promise<{ uploaded: number; errors: string[] }> {
    const url = `/config/${ASSET_API_BASE}/upload?path=${encodeURIComponent(currentPath.value)}`
    const errors: string[] = []
    let uploaded = 0

    uploadProgress.value = { done: 0, total: fileList.length }
    try {
      for (let i = 0; i < fileList.length; i += UPLOAD_BATCH_SIZE) {
        const batch = fileList.slice(i, i + UPLOAD_BATCH_SIZE)
        const formData = new FormData()
        batch.forEach((file) => formData.append('files', file))
        try {
          const res = await uploadConfigAsset(ASSET_API_BASE, url, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          if (res.status >= 200 && res.status < 300) {
            uploaded += batch.length
          } else {
            const data = res.data || {}
            errors.push(
              getApiErrorMessage(
                { response: { data, status: res.status } },
                data.message || res.statusText || '未知错误',
              ),
            )
          }
        } catch (error) {
          errors.push(getApiErrorMessage(error, '网络错误'))
        }
        uploadProgress.value = {
          done: Math.min(i + batch.length, fileList.length),
          total: fileList.length,
        }
      }
    } finally {
      uploadProgress.value = null
    }

    // 同一错误在多批中重复出现时只保留一条，避免提示里堆一长串相同文案
    return { uploaded, errors: [...new Set(errors)] }
  }

  /**
   * 删除条目：弹出二次确认对话框（目录会删除其全部内容），
   * 确认后调用后端删除接口，成功后清空缓存并刷新列表。
   * @param item 待删除条目
   */
  async function deleteItem(item: AssetItem) {
    const targetPath = relativeItemPath(item)
    // 根据条目类型构造不同描述，目录删除提示"及其内部所有内容"以强调影响范围
    const targetLabel = item.type === 'dir' ? '文件夹及其内部所有内容' : '该文件'
    const confirmed = await chrome.confirm(
      `确定要删除${targetLabel}吗？

${targetPath}`,
      '强制删除',
      { type: 'danger' },
    )
    if (!confirmed) return
    try {
      await deleteConfigAsset(ASSET_API_BASE, targetPath)
      invalidateCache()
      await loadItems()
    } catch (error) {
      notifyError(error, '删除资源')
    }
  }

  /**
   * 复制条目路径到剪贴板：去除前导斜杠后复制，并根据结果给出成功/失败通知。
   * 手动填写路径的槽位需要它。
   * @param item 条目
   */
  function copyPath(item: AssetItem) {
    const text = item.url!.startsWith('/') ? item.url!.substring(1) : item.url!
    void copyTextWithNotify(text, {
      successMessage: '路径已复制',
      errorMessage: '复制失败',
    })
  }

  // 监听路径变化：重新加载
  watch(currentPath, loadItems)
  // 挂载时首次加载
  onMounted(loadItems)

  return {
    currentPath,
    items,
    loading,
    fileInput,
    breadcrumbs,
    sortedItems,
    useVirtualGrid,
    gridColumns,
    gridRowHeight,
    canPreview,
    onPreviewError,
    navigateTo,
    onItemClick,
    uploadProgress,
    triggerUpload,
    onUpload,
    onDropFiles,
    deleteItem,
    copyPath,
  }
}
