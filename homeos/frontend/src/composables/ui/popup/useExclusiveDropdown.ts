/**
 * @file useExclusiveDropdown.ts
 * @module composables/ui
 * @description 全局互斥下拉：同时仅允许一个锚定下拉/菜单处于打开状态。
 *
 * 打开任一注册菜单时，自动关闭其它已注册菜单；卸载时释放登记。
 * 有任一互斥下拉打开时给 `.app-shell` 加 `app-shell--dropdown-open`，禁用 transform transition，
 * 避免手机 visualViewport 变化时 scale 缓动与定位换算失步。
 */
import { onUnmounted, watch, type Ref } from 'vue'

let seq = 0
let activeId: symbol | null = null
const closers = new Map<symbol, () => void>()

const DROPDOWN_OPEN_CLASS = 'app-shell--dropdown-open'

/** 按当前互斥登记同步 app-shell 过渡冻结 class */
function syncAppShellDropdownOpenClass() {
  if (typeof document === 'undefined') return
  const shell = document.querySelector('.app-shell')
  if (!(shell instanceof HTMLElement)) return
  if (closers.size > 0) shell.classList.add(DROPDOWN_OPEN_CLASS)
  else shell.classList.remove(DROPDOWN_OPEN_CLASS)
}

/** 声明当前菜单为活跃项，并关闭其它已登记菜单 */
function claimExclusiveDropdown(id: symbol, close: () => void) {
  if (activeId && activeId !== id) {
    const prevId = activeId
    const prevClose = closers.get(prevId)
    closers.delete(prevId)
    activeId = null
    try {
      prevClose?.()
    } catch {
      /* 忽略前一持有者的关闭错误 */
    }
  }
  closers.set(id, close)
  activeId = id
  syncAppShellDropdownOpenClass()
}

/** 菜单关闭或卸载时释放登记（仅当自身仍是活跃项时清空 activeId） */
function releaseExclusiveDropdown(id: symbol) {
  if (activeId === id) activeId = null
  closers.delete(id)
  syncAppShellDropdownOpenClass()
}

type ExclusiveDropdownOptions = {
  /** 是否参与全局互斥，默认 true；嵌套子菜单（如实体下拉的域筛选）应设为 false */
  exclusive?: boolean
  /** 自定义关闭函数；默认将 isOpenRef 置为 false */
  close?: () => void
}

/**
 * 将布尔打开状态接入全局互斥下拉。
 * 打开时 claim 并关掉其它菜单；关闭/卸载时 release。
 */
export function useExclusiveDropdown(
  isOpenRef: Ref<boolean>,
  options: ExclusiveDropdownOptions = {},
) {
  if (options.exclusive === false) {
    return { id: null as symbol | null }
  }

  const id = Symbol(`exclusive-dd-${++seq}`)
  const close =
    options.close ??
    (() => {
      isOpenRef.value = false
    })

  watch(
    isOpenRef,
    (open) => {
      if (open) claimExclusiveDropdown(id, close)
      else releaseExclusiveDropdown(id)
    },
    { flush: 'sync' },
  )

  onUnmounted(() => {
    releaseExclusiveDropdown(id)
  })

  return { id }
}


