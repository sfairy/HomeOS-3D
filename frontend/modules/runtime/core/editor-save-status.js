/**
 * 3D 配置编辑器共用的「保存状态」文案与草稿比较工具。
 */

/** 保存状态文案表：键名固定，各编辑器按当前状态取用对应文案。 */
export const EDITOR_SAVE_STATUS = Object.freeze({
  saving: "保存中…",
  saved: "已保存，请再点顶部「保存」",
  savedWithMoreChanges: "已保存，另有新修改，请再点顶部「保存」",
  failed: "保存失败，请重试。",
  accessDenied: "3D 使用权限已失效，无法保存。",
  dirty: "配置已修改，请保存配置。"
});

/**
 * 把草稿序列化成可用于「等值比较」的字符串。
 */
export function serializeEditorDraft(value) {
  return JSON.stringify(value, (_propertyKey, nestedValue) => {
    // 只对普通对象排序；数组的顺序本身有语义（如灯光顺序），必须原样保留。
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      return Object.fromEntries(
        Object.entries(nestedValue)
          .filter(([, entryValue]) => entryValue !== undefined)
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      );
    }
    return nestedValue;
  });
}

/**
 * 判断当前草稿相对基线草稿是否有改动（脏检查）。
 */
export function editorDraftHasChanges(currentDraft, baselineDraft) {
  return serializeEditorDraft(currentDraft) !== serializeEditorDraft(baselineDraft);
}
