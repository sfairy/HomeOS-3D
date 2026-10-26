/**
 * 组件类型 ↔ 动态族 的纯映射（**零 import**）。
 *
 * 单独成文件的原因：`register-all.ts` 会顺带 import 各族渲染实现（three / DOM / 播放器），
 * 在 node 里跑不起来；而「这份草稿要哪些族」是不依赖运行时的纯计算，单独放这里就能用
 * `node --test` 直接覆盖（`ops/checks/frontend/tests/registry-families.test.mjs`）。
 */

/**
 * 组件类型 → 所属动态族。
 *
 * 只列「在动态 chunk 里」的类型；同步路径上的类型（image / panel-frame / icon-button /
 * device-button / navigation-button / percentage-bar / event-log-wall /
 * floorplan-auto-diagram / icon-button-effect / title-button / light-statistics /
 * interaction3d / flow-line）不在此表，查不到即视为已就绪。
 */
export const componentFamilyByType: Record<string, string> = {
  "presence-sensor": "presence-sensor",
  "air-conditioner": "climate",
  camera: "camera",
  "vacuum-map": "vacuum-map",
  time: "clock",
  date: "clock",
  weather: "weather",
  "line-chart": "line-chart",
  "scene-mode": "scene-mode",
};

/** 把一批组件类型折算成需要加载的族（未知/同步类型直接忽略，重复族只留一份）。 */
export function componentFamiliesForTypes(types: Iterable<string | null | undefined>): string[] {
  const families = new Set<string>();
  for (const type of types) {
    const family = type ? componentFamilyByType[type] : undefined;
    if (family) families.add(family);
  }
  return [...families];
}

/**
 * 从仪表盘文档里收集所有组件类型（含 `children` 嵌套），得到展示端真正需要的族。
 *
 * 只加载文档里出现过的族：一个只有 3D 户型 + 日志墙的项目不该下载温控/摄像头/扫地机的
 * 渲染 chunk。编辑器仍然全量加载（用户随时能插入新类型）。
 */
export function componentFamiliesForDocument(documentPayload: any): string[] {
  const types: string[] = [];
  const walk = (componentList: any[]) => {
    for (const component of componentList || []) {
      if (!component || typeof component !== "object") continue;
      if (typeof component.type === "string") types.push(component.type);
      if (Array.isArray(component.children)) walk(component.children);
    }
  };
  walk(documentPayload?.sharedComponents);
  for (const page of documentPayload?.pages || []) walk(page?.components);
  return componentFamiliesForTypes(types);
}
