/**
 * 状态表「已发布」游标：用版本号代替对象引用判断「状态有没有变」。
 *
 * 为什么不能用引用：`onPatch` 是**原地写入**状态表（避免每条增量都复制数百实体的全表），
 * 所以 `getCurrentStates()` 返回的引用永远不变。早期拿 `currentStates === lastPublishedStates`
 * 做短路，等价于「永远没变化」，单实体的 `state_changed` 全部被吞掉 —— 空调从关机切制热
 * 这类单设备操作，3D 画面必须刷新页面才看得见（刷新会走整份 `snapshot`）。
 *
 * 用法固定三步：
 *  1. 状态被写入后 `bump()`（整份替换与原地 patch 都要）；
 *  2. 发送前用 `changed()` 短路 —— `false` 表示这一版已经发过；
 *  3. 真正收到 `postMessage` 后 `markPublished()`。
 *
 * 需要让对端重收整份状态时（重连、温度单位切换、新配置帧已带整份 `states`）调
 * `invalidate()`，下一次必然重发。
 */
export function createStateRevision() {
  let revision = 0
  // -1 而非 0：初始状态必须被视为「未发布」，否则首帧会因为版本相等而被短路掉。
  let published = -1
  return {
    /** 状态表被写过（整份替换或原地 patch 都算）。 */
    bump() {
      revision += 1
    },
    /** 自上次发布以来是否有变化；`false` 表示这次不必再发。 */
    changed() {
      return revision !== published
    },
    /** 记下「已发布到这一版」。 */
    markPublished() {
      published = revision
    },
    /** 丢弃已发布记录：下一次必定重发。 */
    invalidate() {
      published = -1
    },
  }
}

/** `createStateRevision()` 的返回类型。 */
export type StateRevision = ReturnType<typeof createStateRevision>
