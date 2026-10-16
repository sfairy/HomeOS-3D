/**
 * @file system-config-panel-prefs.internals.ts
 * @module frontend/src/views
 */
/** 高级参数面板：专家模式 / 开发键本地偏好 */
import { readLocalStorageFlag, writeLocalStorage } from '@/shared/utils/core/local-storage.util'

export const EXPERT_MODE_STORAGE_KEY = 'homeos_params_expert_mode'
export const DEV_KEYS_STORAGE_KEY = 'homeos_params_show_dev_keys'

export function readExpertModePref() {
  try {
    return readLocalStorageFlag(EXPERT_MODE_STORAGE_KEY)
  } catch {
    return false
  }
}

export function readDevKeysPref() {
  try {
    return readLocalStorageFlag(DEV_KEYS_STORAGE_KEY)
  } catch {
    return false
  }
}

export function writeExpertModePref(on: boolean) {
  try {
    writeLocalStorage(EXPERT_MODE_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

export function writeDevKeysPref(on: boolean) {
  try {
    writeLocalStorage(DEV_KEYS_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}
