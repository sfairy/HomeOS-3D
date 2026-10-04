/**
 * 家庭模式图标工具。
 *
 * 职责：在 emoji 字符、lucide 图标 key 与 Vue 图标组件之间做映射与解析。
 *
 * 依赖：@lucide/vue 提供图标组件。
 */
import {
  Home,
  Moon,
  DoorOpen,
  DoorClosed,
  Film,
  Utensils,
  Palmtree,
  Users,
  Bot,
} from '@lucide/vue'
import type { Component } from 'vue'

/** 存储为 emoji 字符的模式图标（非 lucide key） */
const HOME_MODE_EMOJI_ICONS = new Set(['🏠', '🚪', '🌙', '🎬', '🍽', '🌴', '🚗'])

/** 判断给定图标是否为 emoji 字符（而非 lucide key） */
export function isHomeModeEmojiIcon(icon: string | null | undefined) {
  return typeof icon === 'string' && HOME_MODE_EMOJI_ICONS.has(icon)
}

/**
 * emoji 或 lucide key → 图标组件的映射表。
 * - emoji key：🏠 家 / 🚪 门 / 🌙 夜 / 🎬 影 / 🍽 餐 / 🌴 假 / 🚗 车
 * - lucide key：door-open / door-closed / moon / film / utensils / palmtree / users / vacuum
 */
const HOME_MODE_ICON_MAP = {
  '🏠': Home,
  '🚪': DoorOpen,
  '🌙': Moon,
  '🎬': Film,
  '🍽': Utensils,
  '🌴': Palmtree,
  'door-open': DoorOpen,
  'door-closed': DoorClosed,
  moon: Moon,
  film: Film,
  utensils: Utensils,
  palmtree: Palmtree,
  users: Users,
  vacuum: Bot,
}

/**
 * 根据图标 key 解析为 Vue 图标组件。
 * @param icon emoji 字符或 lucide key
 * @param fallback 找不到时回退的组件，默认 Home
 * @returns 对应的图标组件
 */
export function resolveHomeModeIcon(icon: string | null | undefined, fallback: Component = Home) {
  if (!icon) return fallback
  return (HOME_MODE_ICON_MAP as Record<string, Component>)[icon] || fallback
}