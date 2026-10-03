/**
 * Orchestrator YAML/实体批量导入汇总工厂。
 * automation / script / scene 共用计数与文案装配，分析细节仍由各域 analyze* 提供。
 */

type BulkImportSummary = {
  imported: number
  needHa: number
  lossy: number
  message: string
  notifyType: 'success' | 'warning'
}

type BulkImportItemFlags = {
  needHa?: boolean
  lossy: boolean
}

/** createBulkImportSummarizer：函数，按签名入参返回处理结果。 */
export function createBulkImportSummarizer<TItem>(opts: {
  entityLabel: string
  /** 返回 null 表示跳过该条（空 yaml / 不可解析） */
  analyzeItem: (item: TItem, engineCaps?: unknown) => BulkImportItemFlags | null
  needHaMessage?: (n: number) => string
  lossyMessage?: (n: number) => string
}): (
  items: Array<TItem | null | undefined>,
  engineCaps?: unknown,
  entityLabel?: string,
) => BulkImportSummary {
  const needHaMessage =
    opts.needHaMessage ?? ((n) => `其中 ${n} 条含本地不支持特性（建议由 HA 执行）`)
  const lossyMessage =
    opts.lossyMessage ?? ((n) => `${n} 条存在还原损失，打开编辑可查看详情`)

  return (items, engineCaps, entityLabel = opts.entityLabel) => {
    let needHa = 0
    let lossy = 0
    for (const item of items) {
      if (!item) continue
      const flags = opts.analyzeItem(item, engineCaps)
      if (!flags) continue
      if (flags.needHa) needHa += 1
      if (flags.lossy) lossy += 1
    }
    const imported = items.length
    const parts = [`已导入 ${imported} 个${entityLabel}`]
    if (needHa) parts.push(needHaMessage(needHa))
    if (lossy) parts.push(lossyMessage(lossy))
    return {
      imported,
      needHa,
      lossy,
      message: parts.join('；'),
      notifyType: needHa || lossy ? 'warning' : 'success',
    }
  }
}
