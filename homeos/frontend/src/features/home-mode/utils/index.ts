/**
 * `features/home-mode/utils` 公开面：家居模式的纯函数（无 store / 无 Vue 依赖）。
 *
 * 原先挂在 `model/index.ts`，随 model 形态段一起压平。
 */

/**
 * home-mode 域（`src/shared/home-mode/utils/`）：家居模式纯函数。
 *
 * 成员无 store / 无 Vue 依赖，被域内外多类消费者引用；放 `features/` 会让 stores、constants 等
 * 下层反向依赖 features 造成分层倒置，故下沉 `shared/`。桶名统一用 `home-mode`，避免与「全屋操作」的 home 同名双义。
 */

export { isHomeModeEmojiIcon, resolveHomeModeIcon } from '../mode-icon'
export { collectPresetActionTags } from '../mode-preset-meta'
