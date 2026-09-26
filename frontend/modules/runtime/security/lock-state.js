/**
 * 门锁实体状态折算（运行时侧的薄转出口）。
 *
 * 实现全部在 `/static/bridge/lock-state-runtime.js` —— 编辑器的安防配置页与这里必须共用
 * 同一份口径（否则用户能绑的实体、运行时认不出来的那种漂移就是从这里来的），
 * 而编辑器在 /static/ 树下、运行时在 /api/v1/modules/interaction3d/ 下，
 * 唯一的公共可达位置就是 static/bridge/。文件头有更完整的解释。
 *
 * 本文件按仓库纪律不许出现实现，只许转出口：runtime → /static 的唯一通道是
 * core/static-helpers.js（它内部走绝对路径 /static/...，与 runtime 挂在哪一层无关）。
 *
 * 导出名与 static-helpers.js 的登记表逐字一致；两边任一改动都要同时改另一处，
 * 这类不一致不会有任何静态报错，只有浏览器会炸。
 */
export {
  LOCK_ENTITY_FIELDS,
  doorModels,
  doorOpenState,
  entryDoorModels,
  identifyLockEntities,
  lockEntityRole,
  lockHinge,
  lockState
} from "../core/static-helpers.js?v=2609252218";
