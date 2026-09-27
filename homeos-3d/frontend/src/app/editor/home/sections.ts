/**
 * 编辑器的分节绑定。
 */

type AnyObj = Record<string, any>;
export function createSectionRegistry() {
  const disposers = new Map<any, any>();

  const disposeSection = (label: any) => {
    const dispose = disposers.get(label);
    if (!dispose) return;
    dispose();
    disposers.delete(label);
  };

  return {
    /**
     * 开一节并拿到登记用的 `on`。同名重复调用等价于「先撤销再重新绑定」。
     */
    section(label: any) {
      disposeSection(label);
      const listeners: any[] = [];
      disposers.set(label, () => {
        for (const [target, type, handler, options] of listeners as any[]) {
          target.removeEventListener(type, handler, options);
        }
        listeners.length = 0;
      });
      return (target: any, type: any, handler: any, options?: any) => {
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
