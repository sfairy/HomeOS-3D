/**
 * @file 布局未保存草稿持久化
 * @module stores/ui/create-layout-draft-state
 * @description
 *  将未保存的布局编辑以草稿形式持久化到 localStorage，
 *  防止用户刷新/关闭页面时丢失编辑中的布局。
 *  - saveDraft: 仅在 layoutDirty 时写入，含时间戳
 *  - loadDraft: 启动时尝试恢复，成功后清除草稿并标记 dirty
 *  - clearDraft: 主动清除草稿（保存成功或放弃编辑后调用）
 *  还注册了 beforeunload 钩子，在页面卸载前自动保存草稿。
 *  依赖 Vue ref、logger 与 clonePlain 工具。
 */
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

import { type Ref } from 'vue'
import { logger } from '@/utils/core/logger'
import { clonePlain } from '@/utils/core/clone-plain.util'
import type { UILayoutConfig } from '@/types/layout'

/** localStorage 中草稿的存储 key */
const DRAFT_KEY = 'homeos_layout_draft'

/** createLayoutDraftState 的依赖注入参数 */
interface LayoutDraftStateDeps {
  /** 布局配置对象（响应式） */
  layoutConfig: UILayoutConfig
  /** 脏标志（true 表示有未保存修改） */
  layoutDirty: Ref<boolean>
}

/**
 * 布局未保存草稿 localStorage 持久化（layout 拆分模块）。
 *
 * 提供草稿的保存、加载、清除三个操作，并自动监听 beforeunload 事件
 * 在页面关闭前抢救未保存的编辑。草稿仅作为崩溃/刷新兜底，
 * 不替代正式保存流程。
 *
 * @param deps 包含 layoutConfig 与 layoutDirty 的依赖
 * @returns saveDraft / loadDraft / clearDraft 三个方法
 */
export function createLayoutDraftState(deps: LayoutDraftStateDeps) {
  const { layoutConfig, layoutDirty } = deps

  /**
   * 保存当前布局为草稿到 localStorage。
   * 仅在脏标志为 true 时执行；失败时仅记录调试日志，不抛出异常，
   * 避免阻塞正常流程（草稿只是兜底，失败可接受）。
   */
  async function saveDraft() {
    try {
      if (!layoutDirty.value) return
      const draft = JSON.stringify({
        layoutConfig: clonePlain(layoutConfig),
        timestamp: Date.now(),
      })
      writeLocalStorage(DRAFT_KEY, draft)
    } catch (e: unknown) {
      logger.debug('布局草稿保存失败', e instanceof Error ? e.message : e)
    }
  }

  /**
   * 从 localStorage 读取并恢复草稿。
   * 成功恢复后立即清除草稿（避免重复恢复）并标记 dirty 触发保存提示。
   * @returns 是否成功恢复了草稿
   */
  function loadDraft() {
    try {
      const raw = readLocalStorage(DRAFT_KEY)
      if (!raw) return false
      const draft = JSON.parse(raw)
      if (!draft.layoutConfig) return false
      Object.assign(layoutConfig, draft.layoutConfig)
      removeLocalStorage(DRAFT_KEY)
      layoutDirty.value = true
      return true
    } catch (e: unknown) {
      logger.debug('布局草稿读取失败', e instanceof Error ? e.message : e)
      return false
    }
  }

  /**
   * 清除草稿并重置脏标志。
   * 通常在正式保存成功或用户放弃编辑后调用。
   */
  function clearDraft() {
    removeLocalStorage(DRAFT_KEY)
    layoutDirty.value = false
  }

  // 注册 beforeunload 钩子：页面卸载前若有未保存修改则抢救性保存草稿
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (layoutDirty.value) {
        void saveDraft()
      }
    })
  }

  return {
    saveDraft,
    loadDraft,
    clearDraft,
  }
}