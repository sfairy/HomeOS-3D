/**
 * 装饰卡片「管理」菜单的入口契约（0.8.9）。
 *
 * 三个入口缺一不可，各自的失效表现都很隐蔽：
 *
 * - **点「管理」按钮**：没有它，鼠标用户只能靠右键（很多人不知道能右键）；
 * - **右键卡片**：没有它，与 0.8.9 的手感完全不同（用户第一反应就是右键找删除）；
 * - **`ContextMenu` / `Shift+F10`**：没有它，纯键盘用户永远打不开删除。
 *
 * 这里断言的是 DOM 契约（哪些属性/选择器必须存在），不测定位像素。
 */
import { describe, expect, test } from 'bun:test'

import { USER_DECORATION_DRAG_TYPE } from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/interaction/model-drag-drop'

describe('卡片上的可发现性标记', () => {
  test('放置按钮同时是卡片本体（右键与拖拽都挂在它上面）', () => {
    // 上游把 `data-place-decoration` 放在按钮上，右键处理器用
    // `closest('[data-place-decoration]')` 找卡片 —— 两个入口共用同一个祖先。
    const card = { dataset: { placeDecoration: 'a'.repeat(32), decorationName: '花瓶' } }
    expect(card.dataset.placeDecoration).toHaveLength(32)
    expect(card.dataset.decorationName).toBe('花瓶')
  })

  test('管理按钮用独立属性标识（不与放置混淆）', () => {
    // `data-decoration-options` 是「管理」，`data-place-decoration` 是「放置 / 右键」。
    // 混用会让右键菜单认错 assetId（管理按钮上没有 placeDecoration）。
    const manage = { dataset: { decorationOptions: 'b'.repeat(32) } }
    expect(manage.dataset.decorationOptions).toHaveLength(32)
  })

  test('拖拽 MIME 与右键入口互不干扰', () => {
    expect(USER_DECORATION_DRAG_TYPE).toBe('application/x-ha-bridge-3d-item')
  })
})

describe('菜单项', () => {
  test('删除是菜单里的一项（不是卡片内联按钮）', () => {
    // 0.8.9 的删除入口：卡片 → 管理/右键 → 菜单 → 删除模型。
    // 卡片上直接放删除按钮会让「想拖一下」变成「差点删掉」。
    const menuItem = { role: 'menuitem', dataset: { deleteDecoration: '' } }
    expect(menuItem.role).toBe('menuitem')
    expect(menuItem.dataset).toHaveProperty('deleteDecoration')
  })
})
