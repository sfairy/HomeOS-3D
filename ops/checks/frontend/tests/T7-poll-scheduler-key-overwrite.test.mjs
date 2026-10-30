/**
 * T7 回归：轮询调度器「同 key 被重新注册后，旧订阅的取消不得删除新任务」。
 *
 * 背景：`useScheduledPoll` 支持显式 key（如 Forecast.vue 的 'widget:WeatherForecast'），
 * 当同一 key 的两个实例同时挂载时，后注册者覆盖先注册者；先注册者卸载时调用自己的
 * cancel，如果 cancel 无条件 `jobs.delete(key)`，就会把**后注册者仍在使用的**任务删掉，
 * 该小组件从此不再轮询（静默数据陈旧，页面无错误提示）。
 *
 * 修复前断言 `activeJobs === 1` 会失败（实际为 0，ticking=false）；
 * 修复后 cancel 只删除自己那份 job。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/shared/utils/core/poll-scheduler.ts', import.meta.url),
)
const { schedulePoll, getPollSchedulerStats } = await import(MODULE)

test('取消旧订阅不得连带删除同 key 的新任务', () => {
  const fnA = () => {}
  const fnB = () => {}
  const cancelA = schedulePoll('t7:dup-key', fnA, 60_000, { runImmediately: false })
  const cancelB = schedulePoll('t7:dup-key', fnB, 60_000, { runImmediately: false })

  assert.equal(getPollSchedulerStats().activeJobs, 1, '同 key 只应保留一个任务')

  cancelA()
  try {
    const stats = getPollSchedulerStats()
    assert.equal(stats.activeJobs, 1, '取消旧订阅后，新任务必须仍在调度表中')
    assert.equal(stats.ticking, true, '调度器刻度不能因旧订阅取消而停止')
  } finally {
    cancelB()
  }

  assert.equal(getPollSchedulerStats().activeJobs, 0, '最后一个订阅取消后任务表应清空')
  assert.equal(getPollSchedulerStats().ticking, false, '无任务时不应继续空转刻度')
})
