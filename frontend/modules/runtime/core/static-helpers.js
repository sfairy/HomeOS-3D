/**
 * 3D 运行时树 → `/static/` 共享助手的唯一桥梁：纯转出口，本身不实现任何逻辑。
 *
 * 树里有「编辑侧写裸 /static/ 静态 import」与「运行侧按 import.meta.url 分流」两种写法，
 * 本文件消费方两侧都有（舞台页能以 file: 打开），故取运行侧口径：是 file: 走相对路径，否则走 /static/。
 *
 * 纪律：只许出现「条件动态 import + 命名导出」，不许出现实现（否则会多出一份实现）；
 * 导出名必须与登记表逐字相同，动态 import 目标也只许是这些名字所属的模块，否则会退化成通用通道。
 */

// 开发态（file:）走相对路径，生产走 /static 绝对路径；两条都不能省。
const {
  resolveStateEntry,
  stateTextOf,
  normalizedTextOf
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/state-entry.js", import.meta.url))
  : import("/static/utils/state-entry.js?v=20260921124622"));
const { entityDomainFromId } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/entities.js", import.meta.url))
  : import("/static/utils/entities.js?v=20260921124622"));
const { apiErrorMessage } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/api-error.js", import.meta.url))
  : import("/static/utils/api-error.js?v=20260921124622"));
const { INTERACTION_PAGE_OPTIONS } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/interaction-pages.js", import.meta.url))
  : import("/static/utils/interaction-pages.js?v=20260921124622"));

export {
  INTERACTION_PAGE_OPTIONS,
  apiErrorMessage,
  entityDomainFromId,
  normalizedTextOf,
  resolveStateEntry,
  stateTextOf
};
