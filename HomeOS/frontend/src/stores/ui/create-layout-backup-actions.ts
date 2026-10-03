/**
 * @file 布局全量备份导入/导出
 * @module stores/ui/create-layout-backup-actions
 * @description
 *  UI 布局方案的全量备份与还原：
 *  - exportFullBackup: 调用 exportAllConfig 拉取全部方案并下载为 JSON 文件
 *  - importFullBackup: 校验并上传备份方案数组，成功后刷新方案列表与当前配置
 *  - normalizeBackupConfigs: 纯函数，将备份方案数组规范化为统一条目，
 *    并将 layout 字段统一序列化为字符串
 *  依赖 config API、downloadBlob 工具与外部注入的 notify / handleApiError / fetchProfiles / loadConfig。
 */
import { exportAllConfig, importAllConfig } from '@/services/api/config'
import { downloadBlob } from '@/utils/core/misc.util'
import type { NotifyType } from '@/types/notify'

/** 单个备份方案条目：projectId + 序列化后的 layout 字符串 */
interface BackupConfigEntry {
  /** 方案 ID */
  projectId: string
  /** 序列化后的布局 JSON 字符串 */
  layout: string
}

/** createLayoutBackupActions 的依赖注入参数 */
interface LayoutBackupActionsDeps {
  /** Toast 通知回调 */
  notify: (message: string, type?: NotifyType, duration?: number) => void
  /** 统一 API 错误处理回调 */
  handleApiError: (err: unknown, fallbackMsg: string) => void
  /** 刷新方案列表的回调 */
  fetchProfiles: () => Promise<void>
  /** 重新加载当前配置的回调 */
  loadConfig: () => Promise<void>
}

/**
 * 规范化备份配置响应为统一条目数组。
 * 仅接受直接数组：[{ projectId, layout }, ...]（与导出文件的现行结构一致）。
 * layout 字段为对象时自动 JSON.stringify；缺 projectId 或 layout 的条目被丢弃。
 * @param raw 原始响应数据
 * @returns 规范化后的条目数组；输入非数组时返回 null
 */
function normalizeBackupConfigs(raw: unknown): BackupConfigEntry[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .map((item: unknown) => {
      const entry = item as { projectId?: string; layout?: unknown }
      const projectId = entry?.projectId
      if (!projectId) return null
      const layout = entry.layout
      if (layout == null) return null
      const layoutStr = typeof layout === 'string' ? layout : JSON.stringify(layout)
      return { projectId, layout: layoutStr }
    })
    .filter((item): item is BackupConfigEntry => item != null)
}

/**
 * 布局全量备份导入/导出（layout 拆分模块）。
 *
 * @param deps 依赖注入参数
 * @returns exportFullBackup / importFullBackup 两个异步方法
 */
export function createLayoutBackupActions(deps: LayoutBackupActionsDeps) {
  const { notify, handleApiError, fetchProfiles, loadConfig } = deps

  /**
   * 导出全部布局方案为 JSON 文件并触发浏览器下载。
   * 文件名格式：HomeOS_UI_layout_YYYYMMDD.json。
   * 失败时通过 handleApiError 统一处理。
   */
  async function exportFullBackup() {
    try {
      const res = await exportAllConfig()
      const json = JSON.stringify(res.data?.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const stamp = new Date()
      const y = stamp.getFullYear()
      const m = (stamp.getMonth() + 1).toString().padStart(2, '0')
      const d = stamp.getDate().toString().padStart(2, '0')
      downloadBlob(blob, `HomeOS_UI_layout_${y}${m}${d}.json`)
      notify('UI 布局方案已导出（不含自动化/系统参数/用户）', 'success')
    } catch (err) {
      handleApiError(err, 'UI 布局导出失败')
    }
  }

  /**
   * 导入备份方案数组并还原。
   * 先经 normalizeBackupConfigs 校验；为空或格式无效时提示错误并返回 false。
   * 成功后刷新方案列表与当前配置。
   * @param configs 原始备份数据（配置方案数组）
   * @returns 是否导入成功
   */
  async function importFullBackup(configs: unknown): Promise<boolean> {
    try {
      const normalized = normalizeBackupConfigs(configs)
      if (!normalized?.length) {
        notify('导入失败：备份格式无效，需为配置方案数组（含 projectId 与 layout）', 'error')
        return false
      }
      const res = await importAllConfig({ configs: normalized })
      if (res.data.success) {
        notify(`UI 布局还原成功，共 ${res.data.count} 个显示方案`, 'success', 5000)
        await fetchProfiles()
        await loadConfig()
        return true
      }
      return false
    } catch (err) {
      handleApiError(err, 'UI 布局导入失败')
      return false
    }
  }

  return {
    exportFullBackup,
    importFullBackup,
  }
}