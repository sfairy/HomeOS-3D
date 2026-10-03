/**
 * 画布组操作与剪贴板：组删除后成员重挂、组↔成员连线同步归属、节点拷贝与粘贴。
 */
import { clonePlain } from '@/utils/core/clone-plain.util'
import {
  stripEphemeralNodeData,
  uid,
  type GeekCanvasNode,
} from './canvas-shared.util'

/** 删除触发/条件组后：成员改挂到同类型剩余组，或清空 groupId */
export function reassignMembersAfterGroupDelete(
  nodes: GeekCanvasNode[],
  deletedGroupId: string,
): { nodes: GeekCanvasNode[]; moved: number; fallbackGroupId: string | null } {
  const deleted = nodes.find((n) => n.id === deletedGroupId)
  const kind = deleted?.data?.kind
  if (kind !== 'trigger_group' && kind !== 'condition_group') {
    return { nodes, moved: 0, fallbackGroupId: null }
  }
  const fallback =
    nodes.find((n) => n.id !== deletedGroupId && n.data?.kind === kind)?.id || null
  let moved = 0
  const next = nodes.map((n) => {
    if (n.data?.groupId !== deletedGroupId) return n
    moved += 1
    return {
      ...n,
      data: {
        ...n.data,
        groupId: fallback || undefined,
      },
    }
  })
  return { nodes: next, moved, fallbackGroupId: fallback }
}

/** 深拷贝画布节点并换新 id / 偏移位置（不复制边） */
export function cloneGeekCanvasNode(
  node: GeekCanvasNode,
  offset: { x?: number; y?: number } = {},
): GeekCanvasNode | null {
  if (!node?.data?.kind || node.data.kind === 'start') return null
  if (node.data.kind === 'trigger_group' || node.data.kind === 'condition_group') return null
  const clone = clonePlain(node) as GeekCanvasNode
  if (!clone.data) return null
  const prefix =
    clone.data.kind === 'trigger'
      ? 'trigger'
      : clone.data.kind === 'condition'
        ? 'condition'
        : clone.data.kind === 'note'
          ? 'note'
          : 'action'
  clone.id = uid(prefix)
  clone.position = {
    x: (Number(node.position?.x) || 0) + (offset.x ?? 36),
    y: (Number(node.position?.y) || 0) + (offset.y ?? 36),
  }
  Object.assign(clone, { selected: false })
  clone.data = stripEphemeralNodeData(clone.data)
  return clone
}

/** 画布节点剪贴板（模块级，跨 canvasKey 重挂载仍可粘贴） */
let geekNodeClipboard: GeekCanvasNode | null = null

/** setGeekNodeClipboard：函数，按签名入参返回处理结果。 */
export function setGeekNodeClipboard(node: GeekCanvasNode | null) {
  geekNodeClipboard = node ? clonePlain(node) : null
}

/** getGeekNodeClipboard：函数，按签名入参返回处理结果。 */
export function getGeekNodeClipboard(): GeekCanvasNode | null {
  return geekNodeClipboard
}

/**
 * 组 ↔ 成员连线时同步 groupId（归属以 groupId 为准，连线应与之对齐）。
 * @returns 是否改动了节点
 */
export function applyGroupMembershipOnConnect(
  nodes: GeekCanvasNode[],
  sourceId: string,
  targetId: string,
): { nodes: GeekCanvasNode[]; changed: boolean; hint: string } {
  const source = nodes.find((n) => n.id === sourceId)
  const target = nodes.find((n) => n.id === targetId)
  if (!source || !target) return { nodes, changed: false, hint: '' }

  const assign = (memberId: string, groupId: string, memberKind: 'trigger' | 'condition') => {
    const next = nodes.map((n) => {
      if (n.id !== memberId) return n
      if (n.data?.kind !== memberKind) return n
      if (n.data.groupId === groupId) return n
      return { ...n, data: { ...n.data, groupId } }
    })
    const changed = next.some((n, i) => n !== nodes[i])
    return {
      nodes: next,
      changed,
      hint: changed ? `已将节点归入「${nodes.find((n) => n.id === groupId)?.data?.label || '组'}」` : '',
    }
  }

  if (source.data?.kind === 'trigger_group' && target.data?.kind === 'trigger') {
    return assign(target.id, source.id, 'trigger')
  }
  if (source.data?.kind === 'condition_group' && target.data?.kind === 'condition') {
    return assign(target.id, source.id, 'condition')
  }
  if (source.data?.kind === 'trigger' && target.data?.kind === 'trigger_group') {
    return assign(source.id, target.id, 'trigger')
  }
  if (source.data?.kind === 'condition' && target.data?.kind === 'condition_group') {
    return assign(source.id, target.id, 'condition')
  }
  return { nodes, changed: false, hint: '' }
}
