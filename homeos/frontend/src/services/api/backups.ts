/**
 * 加密业务备份 API（设置页 / 顶栏弹窗）
 * POST /backups/export · POST /backups/inspect · DELETE /backups/jobs/{ticket} · POST /backups/restore
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiPost } from '../api-client'

const BACKUP_TIMEOUT_MS = 5 * 60 * 1000

export function exportEncryptedBusinessBackup(
  password: string,
  config?: AxiosRequestConfig,
) {
  return apiPost('/backups/export', { password }, {
    responseType: 'blob',
    timeout: BACKUP_TIMEOUT_MS,
    ...config,
  })
}

export function inspectEncryptedBusinessBackup(
  file: Blob,
  password: string,
  config?: AxiosRequestConfig,
) {
  return apiPost('/backups/inspect', file, {
    timeout: BACKUP_TIMEOUT_MS,
    ...config,
    headers: {
      ...(config?.headers || {}),
      'Content-Type': 'application/octet-stream',
      'X-Backup-Password': encodeURIComponent(password),
    },
    transformRequest: [(data) => data],
  })
}

export function cancelEncryptedBackupJob(ticket: string, config?: AxiosRequestConfig) {
  return apiDelete(`/backups/jobs/${encodeURIComponent(ticket)}`, config)
}

export function restoreEncryptedBusinessBackup(
  body: { ticket: string; adminPassword: string; confirm: boolean },
  config?: AxiosRequestConfig,
) {
  return apiPost(
    '/backups/restore',
    {
      ticket: body.ticket,
      adminPassword: body.adminPassword,
      confirm: body.confirm === true,
    },
    { timeout: BACKUP_TIMEOUT_MS, ...config },
  )
}
