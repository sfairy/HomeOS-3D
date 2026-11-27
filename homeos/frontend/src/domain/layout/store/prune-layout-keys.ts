/**
 * 布局对象的「按基线裁剪顶层键」。
 *
 * `Object.assign` 只覆盖不删除，这在布局这种**整份快照**语义的数据上会积毒：
 * 切换方案 / 换账号 / 回滚到备份后，上一份数据独有的顶层键（某版本才有的配置段、
 * 独立保存页写入的字段）会留在活对象里，下一次保存又把它们整份写回服务端 ——
 * 表现是「切回默认方案后仍带着另一个方案的设置」「删掉的配置段过一会又回来了」。
 *
 * 抽成纯函数是为了能在 node 里断言这条语义：**目标必须与基线键集合一致**，
 * 不是「包含基线」。
 */

/** 删除 `target` 中不存在于 `baseline` 的顶层键（就地修改，返回是否删过键）。 */
export function pruneMissingLayoutKeys(target: Record<string, unknown>, baseline: Record<string, unknown>): boolean {
  let removed = false
  for (const key of Object.keys(target)) {
    if (key in baseline) continue
    delete target[key]
    removed = true
  }
  return removed
}
