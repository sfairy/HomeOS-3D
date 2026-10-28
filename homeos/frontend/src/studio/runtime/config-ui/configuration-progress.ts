/**
 * 当前楼层的配置进度（0.8.1）：
 * 3D 分类配置里，模型库是「可配置总量」，已添加的交互条目是「已配置」，两边都按
 * 楼层 + 模型 id 对齐。缺了模型的条目（楼层被删、模型被重命名）单独计为缺失，
 * 免得进度算成「已配置 = 总数」却还有一个悬空条目。
 *
 * 纯函数，不碰 DOM：配置编辑器与类别弹窗共用同一份口径。
 */

export interface ConfigurationProgress {
  /** 楼层的模型库是否已加载；未加载时调用方只显示「加载中…」。 */
  ready: boolean;
  /** 该分类是否需要「选模型」（灯组、场景项等不需要）。 */
  requiresModel: boolean;
  /** 既没有模型也没有条目：入口按钮应禁用。 */
  disabled: boolean;
  /** 模型总数（去重后的楼层模型）。 */
  total?: number;
  /** 已被条目引用的模型数。 */
  configured?: number;
  /** 尚未被引用的模型数。 */
  remaining?: number;
  /** 引用了不存在模型的条目数。 */
  missing?: number;
}

export interface ConfigurationProgressOptions<TModel, TBinding> {
  models?: readonly TModel[];
  bindings?: readonly TBinding[];
  modelKey?: (model: TModel) => string | number | null | undefined;
  bindingKey?: (binding: TBinding) => string | number | null | undefined;
  /** 默认 `true`：灯组之类按「已配置数」统计。 */
  requiresModel?: boolean;
  /** 默认 `true`；`false` 时进度只表示「加载中」。 */
  ready?: boolean;
}

type ModelRecord = { id?: unknown };
type BindingRecord = { modelId?: unknown };

const defaultModelKey = (model: ModelRecord): string | null =>
  model.id == null ? null : String(model.id);

const defaultBindingKey = (binding: BindingRecord): string | null =>
  binding.modelId == null ? null : String(binding.modelId);

function isPresentKey(key: string | number | null | undefined): key is string | number {
  return typeof key === "number" || (typeof key === "string" && key.length > 0);
}

export function configurationProgress<
  TModel extends ModelRecord = ModelRecord,
  TBinding extends BindingRecord = BindingRecord,
>(options: ConfigurationProgressOptions<TModel, TBinding> = {}): ConfigurationProgress {
  const models = options.models ?? [],
    bindings = options.bindings ?? [],
    modelKey = options.modelKey ?? defaultModelKey,
    bindingKey = options.bindingKey ?? defaultBindingKey,
    requiresModel = options.requiresModel ?? true,
    ready = options.ready ?? true;
  if (!ready) return { ready: false, requiresModel, disabled: true };
  if (!requiresModel)
    return {
      ready: true,
      requiresModel,
      configured: bindings.length,
      disabled: false,
    };
  const modelKeySet = new Set<string | number>(),
    configuredKeySet = new Set<string | number>();
  for (const model of models) {
    const key = modelKey(model);
    isPresentKey(key) && modelKeySet.add(key);
  }
  let missingCount = 0;
  for (const binding of bindings) {
    const key = bindingKey(binding);
    if (isPresentKey(key) && modelKeySet.has(key)) configuredKeySet.add(key);
    else missingCount += 1;
  }
  return {
    ready: true,
    requiresModel,
    total: modelKeySet.size,
    configured: configuredKeySet.size,
    remaining: modelKeySet.size - configuredKeySet.size,
    missing: missingCount,
    disabled: modelKeySet.size === 0 && bindings.length === 0,
  };
}
