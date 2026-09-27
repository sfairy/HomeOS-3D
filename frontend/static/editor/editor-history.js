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

export function documentSignature(document) {
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
