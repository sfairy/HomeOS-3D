/**
 * agent（智能管家域）域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节不外借：跨域引用只允许 `import ... from '@/features/agent'`
 * （跨域只走域根 barrel，属项目约定）。
 *
 * ## 会话与文案已下沉
 *
 * 会话读写、快捷提示词、provider / model 标签等纯逻辑已下沉到
 * `@/domain/agent/chat.ts` —— 它们只依赖 kernel，被 settings 的管家面板与 agent 自己的
 * 聊天面板共用，属于域设施而不是某一段 UI。
 *
 * ## 薄 barrel 原则
 *
 * 本域的主体（`AgentCompanion.vue`、`widgets/AgentChatPalette.vue`、语音链路）都应
 * 由自己的入口装配，不被别的域深引。跨域确实需要、且只有下面这一个视觉件：
 */

// ── 管家形象（features/settings 的管家面板页头复用）──
// 形象会随语音状态动起来（说话 / 聆听 / 待机），设置页的预览与聊天页的外观必须是同一份，
// 否则「设置里看到的」和「实际弹出的」不是同一个东西。
export { default as AgentMechaAvatar } from './agent-companion/AgentMechaAvatar.vue'
