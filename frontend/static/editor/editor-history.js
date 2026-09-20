/**
 * 编辑器历史栈与草稿恢复写入器：撤销 / 重做与「未保存草稿恢复」的核心工具。
 *
 * 职责：带延迟合并的草稿恢复写入器；把文档拆成「组件条目 + 顺序」用于历史快照比对；
 * 生成忽略纯样式 / 坐标差异的文档签名。
 * 约定：签名判断「文档是否真的变了」，故剔除 actions / bindings / position / properties /
 * style 这些高频但语义可忽略的键；快照策略「结构优先」，避免拖拽的每个像素都进历史栈。
 */
const IGNORED_COMPONENT_KEYS = new Set(["actions", "bindings", "position", "properties", "style"]);

/**
 * 创建草稿恢复写入器：把连续的恢复请求合并成一次写入。
 */
export function createRecoveryWriter(
  writeRecovery,
  {
    delay: delayMs = 200,
    setTimer: setTimer = setTimeout,
    clearTimer: clearTimer = clearTimeout
  } = {}
) {
  let pendingRecovery = null;
  let flushTimer = null;
  // 立即落盘当前待写内容并复位状态；定时器可能已经在等待，先清掉。
  const flushRecovery = () => {
    if (flushTimer !== null) {
      clearTimer(flushTimer);
    }
    flushTimer = null;
    const recoveryToWrite = pendingRecovery;
    pendingRecovery = null;
    if (recoveryToWrite) {
      writeRecovery(recoveryToWrite);
    }
  };
  return {
    schedule(recovery) {
      // 切换项目时不能合并：先把上个项目的草稿落盘，再排新的。
      if (pendingRecovery && pendingRecovery.projectId !== recovery.projectId) {
        flushRecovery();
      }
      pendingRecovery = recovery;
      // 已有定时器就不重置，保证写入频率上限为 delayMs 一次（节流而非防抖）。
      if (flushTimer === null) {
        flushTimer = setTimer(flushRecovery, delayMs);
      }
    },
    flush: flushRecovery,
    cancel(projectId) {
      // 只取消指定项目的待写内容；草稿已被正常保存时用它止损。
      if (!!pendingRecovery && pendingRecovery.projectId === projectId) {
        pendingRecovery = null;
        if (flushTimer !== null) {
          clearTimer(flushTimer);
        }
        flushTimer = null;
      }
    }
  };
}

/**
 * 收集文档内所有组件的索引信息。
 */
export function editorComponentEntries(editorDocument) {
  const entriesByComponentId = new Map();
  const entryOrder = [];
  // order 里带上 scope / 路径 / 父 ID，保证移动组件后顺序字符串也会变化。
  const collectEntry = (component, scope, pagePath, parentId = null) => {
    if (!component?.id) {
      return;
    }
    const componentId = String(component.id);
    entriesByComponentId.set(componentId, {
      component: component,
      scope: scope,
      pagePath: pagePath,
      parentId: parentId
    });
    entryOrder.push(scope + ":" + (pagePath || "") + ":" + (parentId || "") + ":" + componentId);
    for (const childComponent of component.children || []) {
      collectEntry(childComponent, scope, pagePath, componentId);
    }
  };
  // 共享组件先于页面组件收集，order 的前后关系即历史比对的顺序依据。
  for (const sharedComponent of editorDocument?.sharedComponents || []) {
    collectEntry(sharedComponent, "shared", "", null);
  }
  for (const documentPage of editorDocument?.pages || []) {
    for (const pageComponent of documentPage.components || []) {
      collectEntry(pageComponent, "page", documentPage.path, null);
    }
  }
  return {
    entries: entriesByComponentId,
    order: entryOrder
  };
}

/**
 * 生成组件的「结构」签名：只保留身份与层级，忽略样式与坐标。
 *
 * @returns {string} JSON 字符串签名，children 仅保留子组件 ID。
 */
export function editorComponentStructure(structureComponent) {
  const structure = {};
  for (const [key, value] of Object.entries(structureComponent || {})) {
    if (!IGNORED_COMPONENT_KEYS.has(key) && key !== "children") {
      structure[key] = value;
    }
  }
  structure.children = (structureComponent?.children || []).map(
    childComponentId => childComponentId.id
  );
  return JSON.stringify(structure);
}

/**
 * 生成只反映「页面骨架」的文档签名：清空所有组件再算签名。
 *
 * @returns {string} 文档签名。
 */
export function editorDocumentFrameSignature(sourceDocument) {
  const documentWithoutComponents = {
    ...(sourceDocument || {})
  };
  documentWithoutComponents.sharedComponents = [];
  // 用 &&= 保留 pages 缺省的形态（undefined 时不要凭空造出空数组）。
  documentWithoutComponents.pages &&= documentWithoutComponents.pages.map(mappedPage => ({
    ...mappedPage,
    components: []
  }));
  return documentSignature(documentWithoutComponents);
}

/**
 * 生成文档内容签名，用于判断保存 / 历史比较时内容是否真的变化。
 * 归一化：丢弃无类型或 type 为 "none" 的动作；data 为空删该键；非 navigate 动作删 target；
 * domain / service 属运行时推导字段一并删；对象键排序后再序列化，保证键序不同不产生假差异。
 * @returns {string} JSON 字符串签名。
 */
export function documentSignature(document) {
  // 把动作对象压到最小等价形态，避免等价配置被判为不同。
  const normalizeAction = action => {
    if (!action || !action.type || action.type === "none") {
      return null;
    }
    const strippedAction = {
      ...action
    };
    if (!strippedAction.data || !Object.keys(strippedAction.data).length) {
      delete strippedAction.data;
    }
    if (strippedAction.type !== "navigate") {
      delete strippedAction.target;
    }
    delete strippedAction.domain;
    delete strippedAction.service;
    return normalizeValue(strippedAction);
  };
  // 递归归一化：数组保序，对象按键排序，actions 单独走 normalizeAction 过滤。
  const normalizeValue = (input, parentKey = "") =>
    Array.isArray(input)
      ? input.map(arrayItem => normalizeValue(arrayItem))
      : input && typeof input == "object"
        ? Object.fromEntries(
            parentKey === "actions"
              ? Object.keys(input)
                  .sort()
                  .flatMap(actionKey => {
                    const normalizedActionEntry = normalizeAction(input[actionKey]);
                    if (normalizedActionEntry) {
                      return [[actionKey, normalizedActionEntry]];
                    } else {
                      return [];
                    }
                  })
              : Object.keys(input)
                  .sort()
                  .map(valueKey => [valueKey, normalizeValue(input[valueKey], valueKey)])
          )
        : input;
  return JSON.stringify(normalizeValue(document || null));
}

/**
 * 拼出草稿恢复内容的 localStorage 键名。
 */
export function recoveryStorageKey(storagePrefix, storageProjectId) {
  return "" + storagePrefix + storageProjectId;
}
