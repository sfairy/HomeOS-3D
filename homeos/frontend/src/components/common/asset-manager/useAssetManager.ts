/**
 * @file useAssetManager.ts
 * @module components/common/asset-manager
 * @description 资源管理器核心组合式函数。封装资源（图标、平面图等）的列表加载、
 *  目录导航、分批上传、新建文件夹、删除、复制路径等全部业务逻辑，并提供给视图组件消费。
 *  上传支持一次性选择/拖入至多 MAX_UPLOAD_FILES 个文件，内部按 UPLOAD_BATCH_SIZE
 *  分批串行提交（后端为 memoryStorage，串行可避免内存峰值叠加），并通过 uploadProgress
 *  暴露进度；新建文件夹走专用微晶弹窗，创建失败原因内联展示而非仅弹通知。
 *  依赖：vue（响应式）、chrome.store（toast）、@/services/notify（复制与错误通知）、
 *  services/api/config（后端资源 API）。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import { copyTextWithNotify, notifyError } from '@/services/notify'
import { getApiErrorMessage } from '@/utils/core/error-message'
import {
  deleteConfigAsset,
  listConfigAssets,
  mkdirConfigAsset,
  uploadConfigAsset,
} from '@/services/api/config'

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
  /** 初始进入的相对路径，默认为根目录 */
  initialPath?: string
  /** 是否为选择器模式：点击文件时触发 select 事件而非打开 */
  isPicker?: boolean
  /** 是否嵌入到其他容器中（影响虚拟网格启用与列数） */
  embedded?: boolean
  /** 资源类型：icon 图标 / background 背景图，决定调用的后端 API 分组 */
  type?: string
}

/**
 * 根据资源类型返回对应的后端 API 路径前缀。
 * icon → icons；background → backgrounds（默认）。
 * @param type 资源类型字符串
 * @returns API 路径片段
 */
function assetApiBase(type: string) {
  if (type === 'icon') return 'icons'
  return 'backgrounds'
}

/**
 * 单次批量上传允许的最大文件数。
 * 与后端 `ui-config/controller.ts` 的 `MAX_UPLOAD_FILES` 保持一致。
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
export interface UploadProgress {
  /** 已完成（成功或失败）的文件数 */
  done: number
  /** 本次上传的文件总数 */
  total: number
}

/**
 * 资源管理器组合式函数入口。
 * @param props 组件属性
 * @param emit select 事件发射器，选择文件时触发
 * @returns 资源管理器所需的全部响应式状态与操作方法
 */
export function useAssetManager(
  props: AssetManagerProps,
  emit: (event: 'select', value: string) => void,
) {
  const chrome = useChromeStore()

  // 目录列表缓存：key 形如 "background:a/b"，避免重复请求
  const listCache = new Map<string, AssetItem[]>()
  /** 当前所在目录的相对路径（空字符串表示根目录） */
  const currentPath = ref(props.initialPath || '')
  /** 当前目录下的条目列表 */
  const items = ref<AssetItem[]>([])
  /** 是否正在加载 */
  const loading = ref(false)
  /**
   * 上传进度：null 表示当前没有进行中的上传。
   * 分批提交时用于向用户展示「已完成 X / 共 Y」。
   */
  const uploadProgress = ref<UploadProgress | null>(null)
  /** 视图模式：grid 网格 / list 列表 */
  const viewMode = ref<'grid' | 'list'>('grid')
  /** 搜索关键词 */
  const searchQuery = ref('')
  /** 文件输入框 DOM 引用，用于触发上传对话框 */
  const fileInput = ref<HTMLInputElement | null>(null)
  /** 搜索输入框 DOM 引用 */
  const searchInputRef = ref<HTMLInputElement | null>(null)
  /** 预览失败的条目名集合，避免对失败条目反复尝试加载图片 */
  const previewErrors = ref(new Set<string>())

  /**
   * 面包屑导航：根据当前路径拆分为多级，首项固定为根目录。
   */
  const breadcrumbs = computed(() => {
    const parts = currentPath.value.split('/').filter((p) => !!p)
    const crumbs = [{ name: '🏠 根目录', path: '' }]
    let path = ''
    parts.forEach((p) => {
      path = path ? `${path}/${p}` : p
      crumbs.push({ name: p, path })
    })
    return crumbs
  })

  /**
   * 过滤并排序后的条目列表。
   * 按搜索关键词过滤，并按"目录优先 + 名称升序（中文 locale）"排序。
   */
  const filteredItems = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    const list = q
      ? items.value.filter((item) => item?.name?.toLowerCase().includes(q))
      : items.value
    return [...list].sort((a, b) => {
      // 目录排在文件之前，便于用户优先进入子目录
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  })

  /** 是否启用虚拟网格：非嵌入模式且条目数大于 24 时启用，优化大量数据渲染 */
  const useVirtualGrid = computed(() => !props.embedded && filteredItems.value.length > 24)
  /** 网格列数：嵌入模式 5 列，独立模式 4 列 */
  const gridColumns = computed(() => (props.embedded ? 5 : 4))
  /** 网格行高：图片类素材较高（132），其余 118 */
  const gridRowHeight = computed(() => (props.type === 'background' ? 132 : 118))

  /**
   * 生成缓存键，结合资源类型与当前路径。
   * @returns 形如 "icon:a/b" 的缓存键
   */
  function cacheKey() {
    return `${props.type}:${currentPath.value}`
  }

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
   * 清空全部缓存（用于上传、删除、新建等变更后强制重新拉取）。
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
   * 通过文件扩展名判断是否为图片类型。
   * @param item 待判断条目
   * @returns 是否为图片
   */
  function isImage(item: AssetItem) {
    if (!item?.name) return false
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(item.name)
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
    const key = cacheKey()
    const cached = listCache.get(key)
    if (cached) {
      items.value = normalizeList(cached)
      previewErrors.value = new Set()
      return
    }

    loading.value = true
    try {
      const base = assetApiBase(props.type || 'background')
      const res = await listConfigAssets(base, currentPath.value)
      const data = res.data
      if (data.success) {
        const next = normalizeList(data.data)
        listCache.set(key, next)
        items.value = next
        previewErrors.value = new Set()
      }
    } catch (e) {
      notifyError(e, '加载资源')
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
   * 条目点击处理：目录则进入；文件在 picker 模式下触发 select 事件
   *  （icon 类型返回相对路径，其余返回 URL）。
   * @param item 被点击的条目
   */
  function onItemClick(item: AssetItem) {
    if (item.type === 'dir') {
      currentPath.value = relativeItemPath(item)
    } else if (props.isPicker && item.url) {
      emit('select', props.type === 'icon' ? relativeItemPath(item) : item.url)
    }
  }

  /** 新建文件夹弹窗是否打开 */
  const folderModalOpen = ref(false)
  /** 新建文件夹提交中（禁用弹窗按钮，防重复提交） */
  const folderModalBusy = ref(false)
  /** 新建文件夹失败原因（在弹窗内联展示，便于直接改名重试） */
  const folderModalError = ref('')

  /**
   * 打开「新建文件夹」弹窗。
   * 由专用弹窗组件承载输入与快捷键，替代先前的通用输入弹窗。
   */
  function createFolder() {
    folderModalError.value = ''
    folderModalOpen.value = true
  }

  /** 关闭「新建文件夹」弹窗并清理状态。 */
  function closeFolderModal() {
    folderModalOpen.value = false
    folderModalBusy.value = false
    folderModalError.value = ''
  }

  /**
   * 提交新建文件夹：校验名称后调用后端创建接口，成功后关闭弹窗并刷新列表。
   * @param rawName 用户输入的名称
   */
  async function confirmCreateFolder(rawName: string) {
    const name = String(rawName || '').trim()
    if (!name) {
      folderModalError.value = '请输入文件夹名称'
      return
    }
    // 名称中不允许出现路径分隔符：避免误建多级目录，也避免与面包屑语义混淆
    if (/[\\/]/.test(name)) {
      folderModalError.value = '名称不能包含 / 或 \\'
      return
    }
    folderModalError.value = ''
    folderModalBusy.value = true
    const dirPath = currentPath.value ? `${currentPath.value}/${name}` : name
    try {
      const base = assetApiBase(props.type || 'background')
      const res = await mkdirConfigAsset(base, dirPath)
      const data = res.data
      if (data.success) {
        invalidateCache()
        await loadItems()
        closeFolderModal()
        chrome.notify(`已创建文件夹「${name}」`, 'success', 2000)
      } else {
        folderModalError.value = getApiErrorMessage(
          { response: { data } },
          data.message || '创建失败',
        )
      }
    } catch (e) {
      folderModalError.value = getApiErrorMessage(e, '网络错误，创建失败')
    } finally {
      folderModalBusy.value = false
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
   * @param e 文件选择事件
   */
  async function onUpload(e: Event) {
    const target = e.target as HTMLInputElement
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
    const isIcon = props.type === 'icon'
    const noun = isIcon ? '图标' : '文件'

    // 数量上限：超出部分直接拒绝，避免误拖整个目录时静默丢文件
    if (fileList.length > MAX_UPLOAD_FILES) {
      chrome.notify(
        `单次最多上传 ${MAX_UPLOAD_FILES} 个${noun}，当前选中 ${fileList.length} 个，请分批上传`,
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
      chrome.notify(`上传成功：${uploaded} 个${noun}`, 'success', 2000)
      return
    }
    if (uploaded === 0) {
      chrome.notify(`上传失败: ${errors[0]}`, 'error', 4000)
      return
    }
    // 部分成功：明确告知成功与失败数量，避免用户以为整批都失败
    chrome.notify(
      `部分上传成功：${uploaded} 个，失败 ${errors.length} 个（${errors[0]}）`,
      'warning',
      5000,
    )
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
    const base = assetApiBase(props.type || 'background')
    const url = `/config/${base}/upload?path=${encodeURIComponent(currentPath.value)}`
    const errors: string[] = []
    let uploaded = 0

    uploadProgress.value = { done: 0, total: fileList.length }
    try {
      for (let i = 0; i < fileList.length; i += UPLOAD_BATCH_SIZE) {
        const batch = fileList.slice(i, i + UPLOAD_BATCH_SIZE)
        const formData = new FormData()
        batch.forEach((f) => formData.append('files', f))
        try {
          const res = await uploadConfigAsset(base, url, formData, {
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
        } catch (e) {
          errors.push(getApiErrorMessage(e, '网络错误'))
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
    const isIcon = props.type === 'icon'
    const targetPath = relativeItemPath(item)
    // 根据条目类型构造不同描述，目录删除提示"及其内部所有内容"以强调影响范围
    const targetLabel =
      item.type === 'dir' ? '文件夹及其内部所有内容' : isIcon ? '该图标' : '该文件'
    const confirmed = await chrome.confirm(
      `确定要删除${targetLabel}吗？

${targetPath}`,
      '强制删除',
      { type: 'danger' },
    )
    if (!confirmed) return
    try {
      const base = assetApiBase(props.type || 'background')
      await deleteConfigAsset(base, targetPath)
      invalidateCache()
      await loadItems()
    } catch (e) {
      notifyError(e, '删除资源')
    }
  }

  /**
   * 复制条目路径到剪贴板：去除前导斜杠后复制，并根据结果给出成功/失败通知。
   * @param item 条目
   */
  function copyPath(item: AssetItem) {
    const text = item.url!.startsWith('/') ? item.url!.substring(1) : item.url!
    void copyTextWithNotify(text, {
      successMessage: '路径已复制',
      errorMessage: '复制失败',
    })
  }

  // 监听路径变化：清空搜索并重新加载
  watch(currentPath, () => {
    searchQuery.value = ''
    loadItems()
  })
  // 监听类型变化：清空缓存并重新加载
  watch(
    () => props.type,
    () => {
      invalidateCache()
      loadItems()
    },
  )
  // 挂载时首次加载
  onMounted(() => loadItems())

  return {
    currentPath,
    items,
    loading,
    viewMode,
    searchQuery,
    fileInput,
    searchInputRef,
    breadcrumbs,
    filteredItems,
    useVirtualGrid,
    gridColumns,
    gridRowHeight,
    canPreview,
    isImage,
    onPreviewError,
    navigateTo,
    onItemClick,
    uploadProgress,
    folderModalOpen,
    folderModalBusy,
    folderModalError,
    createFolder,
    closeFolderModal,
    confirmCreateFolder,
    triggerUpload,
    onUpload,
    onDropFiles,
    deleteItem,
    copyPath,
  }
}