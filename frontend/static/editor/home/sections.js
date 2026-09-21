/**
 * 编辑器的分节绑定。
 *
 * `home.js` 里原本有 310 条模块级 `addEventListener`，最长的一段连续 2,000 行全是顶层匿名
 * 回调：出问题时栈里只有 `home.js:1xxxx`，既看不出是哪个控件，也没法单独撤销 —— 而编辑器
 * 一旦被重新初始化（再次 mount、热重载、从弹层里重新打开），这些绑定会**叠加**，同一事件
 * 触发两次请求或两次改状态。
 *
 * 现在按域把绑定收进 `bindXxxSection()`，每节用同一份注册器登记：
 * - `section(label)` 返回一个 `on(target, type, handler, options)`，参数顺序与 `addEventListener`
 *   一致，只是把「谁在听」显式写在第一个参数上；
 * - 同名分节再次绑定时先撤销上一次（幂等），所以重复初始化不会累积；
 * - `disposeSection(label)` / `disposeAllSections()` 供卸载与测试单独撤销。
 *
 * 用普通函数而不是 `AbortSignal`：这里的注册点已经有 options（passive / capture），再塞 signal
 * 会把每处调用都改一遍，而撤销只在分节粒度发生。
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
