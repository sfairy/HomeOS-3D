/**
 * 能耗数据计算 composable
 *
 * 模块职责：
 *  - 从 entitiesStore + uiStore 读取电网/燃气/用水/通信传感器数据；
 *  - 提供统一的 elecStats / gasBalance / waterBalance / ctBalance / cuBalance 计算；
 *  - DashboardView 和 EnergyDashboard 共享此逻辑，避免 60+ 行重复代码。
 *
 * 依赖：
 *  - @/composables/energy/useEnergySource（底层能源源解析器）。
 */
import { createSharedComposable } from '@vueuse/core'
import { useEnergySource } from '@/composables/energy/useEnergySource'

/**
 * 能耗仪表数据 composable。
 *
 * 该函数是对 useEnergySource 的薄封装，将底层能力按"仪表视图"重新导出，
 * 便于 Dashboard 等组件按"电/气/水/通信"维度直接消费。
 *
 * @returns 包含各类统计、账户列表与主账户 entity_id 的计算属性集合
 */
function usePowerMeterState() {
  const energy = useEnergySource()

  return {
    // —— 电力统计（elecStats）——
    elecStats: energy.elecStats,
    // —— 燃气/水务/通信（电信 ct / 联通 cu）统计 ——
    gasStats: energy.gasStats,
    waterStats: energy.waterStats,
    ctStats: energy.ctStats,
    cuStats: energy.cuStats,
    // —— 多账户列表（每行含 index/number/label/balance/stats/isPrimary）——
    ctAccountList: energy.ctAccountList,
    cuAccountList: energy.cuAccountList,
    gridAccountList: energy.gridAccountList,
    gasAccountList: energy.gasAccountList,
    waterAccountList: energy.waterAccountList,
    // —— 各能源类型的余额字符串（已格式化）——
    gasBalance: energy.gasBalance,
    waterBalance: energy.waterBalance,
    ctBalance: energy.ctBalance,
    cuBalance: energy.cuBalance,
    hasPowerData: energy.hasPowerData,
    // —— 各能源类型当前主账户的 entity_id ——
    gridEid: energy.gridAccount,
    gasEid: energy.gasAccount,
    waterEid: energy.waterAccount,
    ctEid: energy.ctAccount,
    cuEid: energy.cuAccount,
  }
}

/** 与 useEnergySource 共享同一管线 */
export const usePowerMeter = createSharedComposable(usePowerMeterState)
