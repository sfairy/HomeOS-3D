/**
 * 自动化设置向导环境步骤 provide/inject 上下文键与类型。
 */
import type { InjectionKey } from 'vue'
import type { useSetupWizardEnvStep } from '@/features/settings/composables/connect/setup-wizard.internals'

/** SETUP_WIZARD_ENV_STEP_KEY：常量，取值语义见定义处。 */
export const SETUP_WIZARD_ENV_STEP_KEY: InjectionKey<ReturnType<typeof useSetupWizardEnvStep>> =
  Symbol('setupWizardEnvStep')
