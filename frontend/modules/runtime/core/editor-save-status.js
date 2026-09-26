/**
 * 3D 配置编辑器共用的「保存状态」文案与草稿比较工具。
 *
 * 被 interaction3d 下各编辑器共用（灯光 / 环境 / 设备 / 扫地机 / 安防），不依赖渲染模块也不
 * 访问后端。对外提供 EDITOR_SAVE_STATUS 文案表、serializeEditorDraft、editorDraftHasChanges。
 * EDITOR_SAVE_STATUS 的字符串会原样显示在界面上；文案里反复出现「请再点顶部『保存』」是因为
 * 后端采用「显式保存」流程，自动保存只落盘草稿。
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
 * 不能直接用 JSON.stringify：键顺序随构造顺序变化会让脏检查误报；这里对嵌套普通对象按键名排序
 * 并剔除 undefined，保证「内容相同 ⇒ 字符串相同」。
 */
export function serializeEditorDraft(value) {
  return JSON.stringify(value, (_propertyKey, nestedValue) => {
    // 只对普通对象排序；数组的顺序本身有语义（如灯光顺序），必须原样保留。
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      // undefined 在 JSON 序列化时本来就会被丢弃，先过滤可避免参与排序比较。
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
 * 基线由调用方在每次保存成功后更新，因此这里只做纯比较，不维护状态。
 */
export function editorDraftHasChanges(currentDraft, baselineDraft) {
  return serializeEditorDraft(currentDraft) !== serializeEditorDraft(baselineDraft);
}
