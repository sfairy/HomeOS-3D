/**
 * @file useGeekBuilderDrawerChrome.ts
 * @module composables/orchestrator
 * @description Geek Builder 顶栏抽屉互斥开关 composable（automation / 同类 builder 可复用）。
 * 从超大 SFC 抽出，降低 chrome 状态散落。
 *
 * 职责：维护设置 / 变量 / 模板 / YAML / 管理 / DryRun 等抽屉的开关状态，
 *      提供互斥打开方法（开任一新抽屉时关闭其他）。
 *
 * 依赖：
 * - vue（ref）
 */
import { ref } from 'vue'

/**
 * Geek Builder 顶栏抽屉互斥开关 composable。
 *
 * @returns showSettings/showVars/showTemplates/showYaml/showManage/showDryRun 各抽屉开关；
 *          varsOpenCreate 变量抽屉是否处于"新建"模式；templatesOpenSave 模板抽屉是否处于"保存"模式；
 *          closeAllDrawers 关闭所有抽屉；openSettingsDrawer/openVarsDrawer/openTemplatesDrawer/openManageDrawer/openYamlDrawer 互斥打开方法
 */
export function useGeekBuilderDrawerChrome() {
  const showSettings = ref(false)
  const showVars = ref(false)
  const showTemplates = ref(false)
  const showYaml = ref(false)
  const showManage = ref(false)
  const showDryRun = ref(false)
  // 变量抽屉模式：true=新建变量，false=列表
  const varsOpenCreate = ref(false)
  // 模板抽屉模式：true=保存为模板，false=模板库
  const templatesOpenSave = ref(false)

  /** 关闭所有抽屉（不清空模式标志 varsOpenCreate/templatesOpenSave，由各 open 方法显式设置） */
  function closeAllDrawers() {
    showSettings.value = false
    showVars.value = false
    showTemplates.value = false
    showYaml.value = false
    showManage.value = false
    showDryRun.value = false
  }

  /**
   * 切换设置抽屉：再次点击同一抽屉时关闭（取反语义）。
   */
  function openSettingsDrawer() {
    const next = !showSettings.value
    closeAllDrawers()
    showSettings.value = next
  }

  /**
   * 打开变量抽屉。
   * @param opts.create 是否为新建变量模式（默认 false=列表）
   */
  function openVarsDrawer(opts?: { create?: boolean }) {
    closeAllDrawers()
    varsOpenCreate.value = !!(opts && opts.create)
    showVars.value = true
  }

  /**
   * 打开模板抽屉。
   * @param opts.save 是否为保存为模板模式（默认 false=模板库）
   */
  function openTemplatesDrawer(opts?: { save?: boolean }) {
    closeAllDrawers()
    templatesOpenSave.value = !!(opts && opts.save)
    showTemplates.value = true
  }

  /** 打开管理抽屉（互斥关闭其他）。 */
  function openManageDrawer() {
    closeAllDrawers()
    showManage.value = true
  }

  /**
   * 打开 YAML 抽屉；可在打开前执行回调（如刷新 YAML 预览）。
   * @param beforeOpen 打开前的回调
   */
  function openYamlDrawer(beforeOpen?: () => void) {
    closeAllDrawers()
    beforeOpen?.()
    showYaml.value = true
  }

  return {
    showSettings,
    showVars,
    showTemplates,
    showYaml,
    showManage,
    showDryRun,
    varsOpenCreate,
    templatesOpenSave,
    closeAllDrawers,
    openSettingsDrawer,
    openVarsDrawer,
    openTemplatesDrawer,
    openManageDrawer,
    openYamlDrawer,
  }
}
