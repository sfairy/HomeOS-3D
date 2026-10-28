/**
 * 场景内容指纹（`sceneContentKey`）。
 *
 * 独立成模块的原因：它是**纯函数**（不碰 three、不碰 DOM），而预览作用域
 * （`studio-preview-scope`）要复用它来比较两次编辑的内容。放在 `scene-update.ts` 里会让
 * 预览作用域连带拖进 three 的整套依赖，单测就跑不起来 —— 而「改一个标签不该白刷整屏」
 * 正是最该被测试钉住的判定。
 *
 * 两个刻意的口径：
 *
 * - 先剔掉模型备注（`withoutModelRemarks`）：备注是注释，不该触发重绘；
 * - 键**排序后再序列化**：上游 0.8.0 直接 `JSON.stringify`，键顺序不同就会被判成
 *   「内容变了」，导致编辑端白刷一次整屏。排序后同一份内容只有唯一指纹。
 */
import { withoutModelRemarks } from "../../shared/model-remarks";

/** 键排序后的深拷贝：只用于生成内容指纹，不参与任何业务逻辑。 */
export function canonicalizeContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeContent);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalizeContent(record[key])]),
    );
  }
  return value;
}

/** 两份场景的「内容」是否相同：预览作用域与历史对比都靠它。 */
export const sceneContentKey = (sceneContent: unknown) =>
  JSON.stringify(canonicalizeContent(withoutModelRemarks(sceneContent)));
