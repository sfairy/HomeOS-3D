/**
 * @file useOrchestratorActionHelpers.ts
 * @module composables/orchestrator
 * @description 联动器动作编辑共用 helpers（自动化 / 脚本）。
 *
 * 职责：提供联动器动作（action）、分支（branch）、choose 分支的默认值工厂与追加方法，
 *      供 Builder 表单初始化与列表增项使用。
 *
 * 依赖：
 * - @/types/orchestrator-builder（动作/分支/choose 分支表单类型）
 */
import type {
  OrchestratorActionForm,
  OrchestratorBranchAction,
  OrchestratorChooseBranch,
} from '@/types/orchestrator-builder'

/** 创建 choose 容器内嵌的分支动作默认值。 */
function createDefaultBranchAction(): OrchestratorBranchAction {
  return {
    type: 'callService',
    entityId: '',
    seconds: 1,
    message: '',
    domain: '',
    service: '',
  }
}

/** 创建 choose 容器的判断分支默认值（默认 eq 判断 + 空动作列表）。 */
function createDefaultChooseBranch(): OrchestratorChooseBranch {
  return {
    condEntityId: '',
    condOp: 'eq',
    condState: 'on',
    actions: [],
  }
}

/**
 * 向动作的 choose 容器追加一个空分支。
 * @param action 当前动作表单
 */
export function addOrchestratorChooseBranch(action: OrchestratorActionForm) {
  if (!action.branches) action.branches = []
  action.branches.push(createDefaultChooseBranch())
}

/**
 * 向 choose 分支追加一个空动作。
 * @param branch 当前 choose 分支
 */
export function addOrchestratorBranchAction(branch: OrchestratorChooseBranch) {
  if (!branch.actions) branch.actions = []
  branch.actions.push(createDefaultBranchAction())
}
