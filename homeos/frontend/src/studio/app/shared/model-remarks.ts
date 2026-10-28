/**
 * 模型备注（0.8.1）：给同型号的多个模型起一个可辨认的短备注。
 *
 * - 备注只服务「配置时认出是哪一个」：同类吸顶灯、同款沙发都可能同时存在，
 *   仅凭型号名分不清，所以在选择入口上显示成 `名称（备注）`。
 * - 备注是编辑期元数据，**不属于场景内容**：导出、场景内容指纹、保存前的结构
 *   对比都要把它剔掉，否则改个备注就会被当成户型结构变化。
 * - 上限 60 字，连续空白折叠成单个空格，两端去空白；非字符串一律视为空。
 */

/** 备注最长 60 字（与选择入口的单行显示宽度一致）。 */
export const MODEL_REMARK_MAX_LENGTH = 60;

/** 带备注的集合：只有「物件」和「门」支持备注。 */
const MODEL_REMARK_COLLECTION_KEYS = ["items", "doors"] as const;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

/** 把任意输入收敛成可存的备注文本。 */
export function normalizeModelRemark(rawRemark: unknown): string {
  return typeof rawRemark === "string"
    ? rawRemark.replace(/\s+/g, " ").trim().slice(0, MODEL_REMARK_MAX_LENGTH)
    : "";
}

/** 选择入口上的标签：有备注时显示 `名称（备注）`。 */
export function modelChoiceLabel(model: unknown, fallbackLabel = ""): string {
  const candidate = asRecord(model),
    baseLabel = String(candidate.name || candidate.label || fallbackLabel),
    remark = normalizeModelRemark(candidate.remark);
  return remark ? baseLabel + "（" + remark + "）" : baseLabel;
}

/**
 * 去掉户型里的全部备注（`items` / `doors`）。
 *
 * 用来算「场景内容是否变了」和导出：备注变了不该触发场景重建，
 * 也不该写进给 3D 舞台的结构数据。
 */
export function withoutModelRemarks<T>(floorConfig: T): T {
  const source = asRecord(floorConfig),
    stripped: JsonRecord = { ...source };
  for (const collectionKey of MODEL_REMARK_COLLECTION_KEYS) {
    const collection = source[collectionKey];
    if (!Array.isArray(collection)) continue;
    stripped[collectionKey] = collection.map((entry: unknown) => {
      if (!entry || typeof entry !== "object") return entry;
      // `remark` 只是被解构丢弃，落不到返回对象里。
      const { remark: _remark, ...rest } = entry as JsonRecord;
      return rest;
    });
  }
  return stripped as T;
}

/**
 * 用服务端/新项目的备注覆盖本地场景里的备注（按 id 对齐）。
 *
 * 备注只存在项目文档里，重新载入或撤销后本地场景对象是新建的，
 * 必须从权威副本回填，否则用户刚写好的备注会凭空消失。
 */
export function syncModelRemarks(targetConfig: unknown, sourceConfig: unknown): void {
  const target = asRecord(targetConfig),
    source = asRecord(sourceConfig);
  for (const collectionKey of MODEL_REMARK_COLLECTION_KEYS) {
    const sourceCollection = source[collectionKey],
      targetCollection = target[collectionKey];
    if (!Array.isArray(sourceCollection) || !Array.isArray(targetCollection)) continue;
    const sourceById = new Map<string, JsonRecord>();
    for (const sourceEntry of sourceCollection) {
      const record = asRecord(sourceEntry);
      if (record.id !== undefined) sourceById.set(String(record.id), record);
    }
    for (const targetEntry of targetCollection) {
      const record = asRecord(targetEntry),
        sourceRecord = sourceById.get(String(record.id));
      if (!sourceRecord) continue;
      if (Object.hasOwn(sourceRecord, "remark")) record.remark = sourceRecord.remark;
      else delete record.remark;
    }
  }
}
