/**
 * 3D 运行时树 → `/static/` 共享助手的**唯一桥梁**。
 *
 * 位置：`frontend/modules/runtime/core/` 下的纯转出口，本身不实现任何逻辑。
 *
 * 这棵树里有两种取用 `/static/` 的写法，桥按**更严**的那种写：
 *
 *   * **编辑侧**（`config-editor.js` / `range-dialog.js` / `security-editor.js` /
 *     `presence-editor.js` / `presence-focus-editor.js`）直接写裸 `/static/...` 的**静态**
 *     import —— 这几份只在编辑器页（http）里加载，`/static/` 是站内绝对路径。
 *   * **运行侧**（`stage.js` / `runtime.js` / `popup-preview.js` / `climate-state.js` /
 *     `curtain-motion.js` / `television-screen.js` / `idle-rotation.js`）按 `import.meta.url`
 *     分流：舞台页能以 `file:` 打开，那种情况下裸 `/static/...` 会被解析到**文件系统根目录**。
 *
 * 本文件的消费方**两侧都有**（运行侧 13 份 + `config-editor.js`），所以取运行侧的口径：是 `file:`
 * 时走相对路径，否则走 `/static/` 绝对路径。
 *
 * 为什么要有这个文件（而不是每个文件各写一次那段条件动态导入）：本树原有 33 处内联剥壳与 3 处内联
 * 切域，逐处换助手时若每份文件自带一段导入尾巴，同一段知识会重复 16 份 —— 与「同一份知识只有一处」
 * 正好相反，而且缓存戳要在 16 处同步。有桥之后，其余文件只写一次普通的
 * `from "../core/static-helpers.js?v=20260920102755"`（同域文件则写 `./static-helpers.js`），
 * 与 `/static/` 树里的 import 完全同形。
 *
 * 纪律：
 *
 *   * 这里只许出现「条件动态 import + 命名导出」，**不许出现实现** —— 实现只有 `/static/` 那一份，
 *     本文件里写函数体就会长出第二份实现；
 *   * 导出的名字必须与登记表**逐字相同**，动态 import 的目标也只许是这些名字所属的那几个模块 ——
 *     否则它会慢慢长成通往 `/static` 的通用通道。
 */

// 开发态（file:）走相对路径，生产走 /static 绝对路径；两条都不能省。
const { resolveStateEntry } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/state-entry.js", import.meta.url))
  : import("/static/utils/state-entry.js?v=20260920102755"));
const { entityDomainFromId } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/entities.js", import.meta.url))
  : import("/static/utils/entities.js?v=20260920102755"));
const { apiErrorMessage } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/api-error.js", import.meta.url))
  : import("/static/utils/api-error.js?v=20260920102755"));
const { INTERACTION_PAGE_OPTIONS } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/interaction-pages.js", import.meta.url))
  : import("/static/utils/interaction-pages.js?v=20260920102755"));

export { INTERACTION_PAGE_OPTIONS, apiErrorMessage, entityDomainFromId, resolveStateEntry };
