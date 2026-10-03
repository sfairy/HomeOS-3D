/**
 * @file useGeekShellDirtyPreview.ts
 * @module composables/orchestrator
 * @description Geek automation/scene/script shell 共用的 dirty / yaml 预览 / editingId·runOnHa 双向同步。
 * 不吞并各域 save/import/decompile 逻辑。
 *
 * 职责：
 * - 计算表单是否脏（dirty）并联动到全局备份 orchestrator 状态；
 * - 根据"表单脏 / 存储的 YAML / 即时生成的 YAML"选择预览内容；
 * - 双向同步外部传入的 editingId、runOnHa 与 base 中的对应字段；
 * - 提供保存前统一解析 YAML 并写入 graph.yamlDigest 的工具函数。
 *
 * 依赖：
 * - vue（computed、onScopeDispose、watch、Ref）
 * - @/composables/settings/hub-backup-orchestrator.internals（全局脏标记读写）
 * - @/utils/orchestrator/yaml-preview-helpers.util（YAML 选择与解析）
 */
import { computed, onScopeDispose, watch, type Ref } from 'vue'
import { setOrchestratorBuilderDirty } from '@/composables/settings/hub-backup-orchestrator.internals'
import { pickYamlPreview, resolveYamlForSave } from '@/utils/orchestrator/yaml-preview-helpers.util'

/** 联动器域类型（automation / script / scene） */
type DirtyKind = 'automation' | 'script' | 'scene'

/** base builder 必须提供的能力：表单脏检测、存储的 YAML、editingId、runOnHa */
type BuilderBaseLike = {
  makeFormTouched: (sig: () => string) => Ref<boolean>
  storedYaml: Ref<string>
  editingId: Ref<string | null>
  runOnHa: Ref<boolean>
}

/**
 * 绑定 Geek shell 的 dirty / yaml 预览 / editingId·runOnHa 双向同步。
 *
 * @param opts.kind 联动器域类型
 * @param opts.base base builder（提供能力）
 * @param opts.formSignature 表单签名函数（用于脏检测比对）
 * @param opts.editingId 外部传入的当前编辑 ID
 * @param opts.runOnHa 外部传入的是否在 HA 运行标志
 * @param opts.buildGeneratedYaml 即时生成 YAML 的函数
 * @returns formTouched 表单脏标志；yamlPreview YAML 预览内容
 */
export function bindGeekShellDirtyPreview(opts: {
  kind: DirtyKind
  base: BuilderBaseLike
  formSignature: () => string
  editingId: Ref<string | null>
  runOnHa: Ref<boolean>
  buildGeneratedYaml: () => string
}) {
  const formTouched = opts.base.makeFormTouched(opts.formSignature)
  // 预览：表单脏时显示即时生成的 YAML，否则显示存储的 YAML
  const yamlPreview = computed(() =>
    pickYamlPreview(opts.base.storedYaml.value, formTouched.value, opts.buildGeneratedYaml()),
  )

  // 脏状态联动到全局备份 orchestrator：组件卸载时复位为 false
  watch(formTouched, (dirty) => setOrchestratorBuilderDirty(opts.kind, dirty), {
    immediate: true,
  })
  onScopeDispose(() => setOrchestratorBuilderDirty(opts.kind, false))

  // editingId 外部 -> base（双向同步第一向）
  watch(
    () => opts.editingId.value,
    (id) => {
      opts.base.editingId.value = id
    },
    { immediate: true },
  )
  // runOnHa 外部 -> base（双向同步第一向）
  watch(
    () => opts.runOnHa.value,
    (v) => {
      if (opts.base.runOnHa.value !== v) opts.base.runOnHa.value = v
    },
    { immediate: true },
  )
  // runOnHa base -> 外部（双向同步第二向，避免回环写入相同值）
  watch(
    () => opts.base.runOnHa.value,
    (v) => {
      if (opts.runOnHa.value !== v) opts.runOnHa.value = v
    },
  )

  return { formTouched, yamlPreview }
}

/**
 * 保存前统一解析 YAML 并写入 graph.yamlDigest。
 *
 * @param opts.storedYaml 存储的 YAML 文本
 * @param opts.formTouched 表单是否脏
 * @param opts.generated 即时生成的 YAML
 * @param opts.approximate 近似 YAML（不可信源）
 * @param opts.fingerprint YAML 指纹函数（用于生成摘要）
 * @param opts.graph 图状态对象（写入 yamlDigest）
 * @returns yamlText 最终用于保存的 YAML；preservedStored 是否保留存储的 YAML
 */
export function resolveGeekSaveYaml(opts: {
  storedYaml: string
  formTouched: boolean
  generated: string
  approximate: string
  fingerprint: (yaml: string) => string
  graph: { yamlDigest?: string }
}): { yamlText: string; preservedStored: boolean } {
  const resolved = resolveYamlForSave({
    storedYaml: opts.storedYaml,
    formTouched: opts.formTouched,
    generated: opts.generated,
    approximate: opts.approximate,
  })
  // 写入指纹，供后续比对是否需要重新部署
  opts.graph.yamlDigest = opts.fingerprint(resolved.yamlText)
  return resolved
}
