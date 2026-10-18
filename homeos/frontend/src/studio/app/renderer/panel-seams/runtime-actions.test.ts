
import { describe, expect, it } from "bun:test";
import { bindRuntimeActions } from "./runtime-actions";

/* A3：3D 运行时热区键盘可达性（Enter / Space 激活）。
 *
 * 这些用例只覆盖 bindRuntimeActions 的键盘分支——DOM 由最小 FakeElement 模拟，
 * 生产 pointer / click 语义不在本文件重测（它们依赖真实事件时序）。
 */

// bun 没有 DOM；runtime-actions 只在 pointer/doubleTap 分支用 window 定时器，
// 键盘分支不用。这里仍补一个 window 指向 globalThis 的桩，避免分支回归时炸掉。
(globalThis as any).window = globalThis;

type Listener = (event: any) => void;

class FakeElement {
  className = "";
  tabIndex = -1;
  style: Record<string, any> = {};
  attributes: Record<string, string> = {};
  listeners = new Map<string, Listener[]>();

  setAttribute(name: string, value: string) {
    this.attributes[name] = String(value);
    if (name === "role" && value === "button") this.tabIndex = 0;
  }
  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
  addEventListener(type: string, listener: Listener) {
    const pool = this.listeners.get(type) ?? [];
    pool.push(listener);
    this.listeners.set(type, pool);
  }
  dispatch(type: string, event: any) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function createHost({ roleButton = true } = {}) {
  const host = new FakeElement();
  if (roleButton) host.setAttribute("role", "button");
  return host;
}

function createSelf() {
  const executed: any[] = [];
  const self: any = {
    options: { onRuntimeButtonPress: () => {} },
    states: { get: () => 0 },
    powerEntityId: () => "",
    cleanups: [] as Array<() => void>,
    applyOptimisticToggle: () => null,
    runAction: (_options: any, action: any) => executed.push(action),
  };
  return { self, executed };
}

function keydownEvent(host: any, key: string, { repeat = false, target = host as any } = {}) {
  const event = {
    key,
    repeat,
    target,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopPropagation() {
      event.propagationStopped = true;
    },
  };
  return event;
}

const tapAction = { type: "navigate", target: "/page-a" };
const holdAction = { type: "navigate", target: "/page-hold" };

function bindWithActions(host: any, actions: any) {
  const { self, executed } = createSelf();
  bindRuntimeActions(self, host, { id: "component-1", type: "title-button", actions });
  return { executed, self };
}

describe("bindRuntimeActions 键盘激活（A3）", () => {
  it("Enter 触发 tap，并阻止默认滚动/事件冒泡", () => {
    const host = createHost();
    const { executed } = bindWithActions(host, { tap: tapAction });
    const event = keydownEvent(host, "Enter");
    host.dispatch("keydown", event);
    expect(executed).toEqual([tapAction]);
    expect(event.defaultPrevented).toBe(true);
    expect(event.propagationStopped).toBe(true);
  });

  it("Space 触发 tap（键名 ' ' 与旧式 'Spacebar' 都接受）", () => {
    const host = createHost();
    const { executed } = bindWithActions(host, { tap: tapAction });
    host.dispatch("keydown", keydownEvent(host, " "));
    host.dispatch("keydown", keydownEvent(host, "Spacebar"));
    expect(executed).toHaveLength(2);
  });

  it("长按 repeat 不重复触发；其它按键不触发", () => {
    const host = createHost();
    const { executed } = bindWithActions(host, { tap: tapAction });
    host.dispatch("keydown", keydownEvent(host, "Enter", { repeat: true }));
    host.dispatch("keydown", keydownEvent(host, "a"));
    host.dispatch("keydown", keydownEvent(host, "Escape"));
    expect(executed).toHaveLength(0);
  });

  it("事件来自子节点（target 不是热区自身）不触发，避免容器内输入控件被抢", () => {
    const host = createHost();
    const { executed } = bindWithActions(host, { tap: tapAction });
    host.dispatch("keydown", keydownEvent(host, "Enter", { target: { tagName: "INPUT" } }));
    expect(executed).toHaveLength(0);
  });

  it("非 role=button / 不可聚焦的宿主不响应键盘（普通组件容器仍只走 pointer）", () => {
    const host = createHost({ roleButton: false });
    const { executed } = bindWithActions(host, { tap: tapAction });
    host.dispatch("keydown", keydownEvent(host, "Enter"));
    expect(executed).toHaveLength(0);
  });

  it("只有 hold 动作时 Enter 执行 hold（没有 tap/doubleTap 的可用默认动作）", () => {
    const host = createHost();
    const { executed } = bindWithActions(host, { hold: holdAction });
    host.dispatch("keydown", keydownEvent(host, "Enter"));
    expect(executed).toEqual([holdAction]);
  });

  it("同时配置 tap 与 doubleTap 时键盘走 click 的二择语义：不直接触发 doubleTap", () => {
    const host = createHost();
    const doubleTapAction = { type: "navigate", target: "/page-double" };
    const { executed, self } = bindWithActions(host, { tap: tapAction, doubleTap: doubleTapAction });
    host.dispatch("keydown", keydownEvent(host, "Enter"));
    // click 语义：先挂 180ms 定时器再按 tap 执行，短时间内的第二次激活会被判成双击。
    expect(executed).toHaveLength(0);
    self.cleanups.forEach((cleanup: () => void) => cleanup());
  });
});
