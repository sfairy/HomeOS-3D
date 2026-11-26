/**
 * S9c · 把「契约与配置」类模块放回 kernel（类型与配置访问器无运行时状态）。
 *
 * 判据：只有**数据/类型/纯访问器**才属于 L0；带响应式状态或依赖 store 的留在 domain。
 * - `frontend-config`（服务端配置的 fetch+cache）→ kernel/config
 * - `layout/types`、`floating-hub` 类型（编译后消失）→ kernel/types
 * - `agent-quick-prompts`（静态文案）→ kernel/constants
 * - `use-echarts-host` 依赖 layout 的 kiosk 动画 → domain/layout
 * - `FooterIconPicker` 是设置页的页脚图标选择器 → features/settings
 * - `local-speech.util`（纯语音合成封装）→ domain/voice
 */
const SRC = 'homeos/frontend/src'

export default {
  moves: [
    { from: `${SRC}/domain/config/frontend-config.ts`, to: `${SRC}/kernel/config/frontend-config.ts` },
    { from: `${SRC}/domain/layout/types.ts`, to: `${SRC}/kernel/types/layout.ts` },
    { from: `${SRC}/domain/layout/types/floating-hub.ts`, to: `${SRC}/kernel/types/floating-hub.ts` },
    { from: `${SRC}/domain/agent/constants/agent-quick-prompts.ts`, to: `${SRC}/kernel/constants/agent-quick-prompts.ts` },
    { from: `${SRC}/kernel/ui/hooks/use-echarts-host.ts`, to: `${SRC}/domain/layout/composables/use-echarts-host.ts` },
    { from: `${SRC}/kernel/ui/FooterIconPicker.vue`, to: `${SRC}/features/settings/components/FooterIconPicker.vue` },
    { from: `${SRC}/features/voice/model/utils/local-speech.util.ts`, to: `${SRC}/domain/voice/local-speech.util.ts` },
  ],
}
