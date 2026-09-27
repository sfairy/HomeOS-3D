/**
 * 编辑器的分节绑定。
 */
export function createSectionRegistry() {
  const disposers = new Map();

  const disposeSection = label => {
    const dispose = disposers.get(label);
    if (!dispose) return;
    dispose();
    disposers.delete(label);
  };

  return {
    /**
     * 开一节并拿到登记用的 `on`。同名重复调用等价于「先撤销再重新绑定」。
     */
    section(label) {
      disposeSection(label);
      const listeners = [];
      disposers.set(label, () => {
        for (const [target, type, handler, options] of listeners) {
          target.removeEventListener(type, handler, options);
        }
        listeners.length = 0;
      });
      return (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        listeners.push([target, type, handler, options]);
      };
    },

    disposeSection,

    disposeAllSections() {
      for (const label of [...disposers.keys()]) disposeSection(label);
    }
  };
}
