/**
 * 组件注册表编排：只决定「注册哪些族、每族从哪个 chunk 来」，各族渲染实现放在
 * `components/<family>.ts`。
 *
 * 为什么族不做静态 import：`register-all` 原先是一个 1,027 行的单体，所有面板渲染器都被
 * 打进入口/stage 的首屏依赖图，即使当前项目一个面板都没用。改成 `familyLoaders` 之后，
 * 每个族单独成 chunk，由 `loadComponentFamilies()` 并发拉取；`registry/index.ts` 顶层
 * 等待就绪，因此渲染路径依然是「同步取已注册渲染器」，不会出现「控件尚未实现」的闪帧。
 *
 * 注意：加载失败的族必须抛出而不是静默跳过 —— 静默会让面板变成占位框且没有任何线索。
 */
import { registerImageComponent } from "./components/image";
import { registerFloorplanAutoDiagramComponent } from "./components/floorplan-auto-diagram";
import { registerPanelFrameComponent } from "./components/panel-frame";
import { renderEventLogWall } from "./event-log-wall";
import { buttonComponentRenderers } from "./button-renderers";
import { navigationComponentRenderer } from "./navigation-button";
import { renderPercentageBarControl } from "./percentage-bar";
import type { RenderPropertyBag, ComponentControllerHooks } from "./components/types";

export type { RenderPropertyBag, ComponentControllerHooks };

/** 一族的注册入口：拿到 `registerComponent` 后把该族所有类型注册进去。 */
type ComponentFamilyRegister = (registerComponent: (type: any, def: any) => void) => void;

/**
 * 组件族 → 动态加载器。键是「族」，值是 `import()`，模块默认导出一个注册函数。
 * 每个族一个 chunk：不用的族不会下载、不会执行。
 */
const componentFamilyLoaders: Record<string, () => Promise<{ default: ComponentFamilyRegister }>> = {
  "presence-sensor": () => import("./components/presence-sensor"),
  climate: () => import("./components/climate"),
  camera: () => import("./components/camera"),
  "vacuum-map": () => import("./components/vacuum-map"),
  clock: () => import("./components/clock"),
  weather: () => import("./components/weather"),
  "line-chart": () => import("./components/line-chart"),
  "scene-mode": () => import("./components/scene-mode"),
};

/** 体积极小、几乎每个场景都用的注册（留在同步路径上，避免为几行代码多一次往返）。 */
export function installRegistryComponents(registerComponent: (type: any, def: any) => void) {
  registerImageComponent(registerComponent);
  registerFloorplanAutoDiagramComponent(registerComponent);
  registerPanelFrameComponent(registerComponent);
  registerComponent("event-log-wall", {
    render: renderEventLogWall,
  });
  registerComponent("icon-button", buttonComponentRenderers);
  registerComponent("device-button", buttonComponentRenderers);
  registerComponent("navigation-button", {
    render: navigationComponentRenderer,
  });
  registerComponent("percentage-bar", {
    render: renderPercentageBarControl,
  });
}

const loadedFamilies = new Set<string>();

/**
 * 并发加载组件族并注册。
 *
 * - 不传 `families` 时加载全部（编辑器可以插入任意类型，必须全量）；
 * - 传了就只加载这些族（展示端可以按草稿里实际出现的类型裁剪）；
 * - 同一个族只会加载/注册一次。
 *
 * 返回**本次真正新加载**的族：调用方据此判断「要不要补一次渲染」，
 * 已经就绪的重复调用不会带来额外重排。
 */
export async function loadComponentFamilies(
  registerComponent: (type: any, def: any) => void,
  families?: Iterable<string>,
): Promise<string[]> {
  const requested = families ? [...new Set(families)] : Object.keys(componentFamilyLoaders);
  const loadedNow: string[] = [];
  await Promise.all(
    requested.map(async (family) => {
      const loader = componentFamilyLoaders[family];
      if (!loader || loadedFamilies.has(family)) return;
      const registerFamily = (await loader()).default;
      registerFamily(registerComponent);
      loadedFamilies.add(family);
      loadedNow.push(family);
    }),
  );
  // 诊断用：族是按需 chunk，光看 network 看不出「下载的是哪一族」（文件名是 shared-*），
  // 所以把实际加载的族打点到 performance 时间线，`bench_3d.mjs` 直接读 mark 断言。
  for (const family of loadedNow) markComponentFamily(family);
  return loadedNow;
}

function markComponentFamily(family: string) {
  typeof performance === "undefined" || performance.mark?.(`homeos:component-family:${family}`);
}

export {
  componentFamilyByType,
  componentFamiliesForDocument,
  componentFamiliesForTypes,
} from "./component-families";
