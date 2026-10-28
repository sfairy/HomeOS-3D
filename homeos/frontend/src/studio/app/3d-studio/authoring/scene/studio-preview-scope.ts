/**
 * 预览作用域判定（上游 `studio-preview-scope.js`，0.8.1 新增）。
 *
 * 编辑端每次变更都要决定「舞台需要重绘多少」——全量、只重绘灯光、只重绘物品，还是
 * 只重绘建筑外壳。判错的两种后果都很明显：
 *
 * - 判宽了：改一个标签名字就重建整屏，大户型上会掉帧；
 * - 判窄了：改了灯光却只刷物品，画面停在旧光照上，看起来像「没生效」。
 *
 * 所以这里统一采用**保守口径**：拿不准就返回 `'all'`，只有在能证明「只动了某一类」时
 * 才给更窄的作用域。
 */
import { sceneContentKey } from "../../../bridge/scene/scene-content-key";

export type PreviewScope = "all" | "architecture" | "lights" | "items" | "none";

export interface PreviewScopeOptions {
  /** 视为「灯光类」的物品类型（灯带、射灯、氛围灯……）。 */
  lightTypes: ReadonlySet<string>;
  /** 庭院图元（栅栏/水池/铺装）对应的作用域。由调用方按当前渲染管线决定。 */
  courtyardScope: () => PreviewScope;
  /**
   * 是否为庭院图元。
   *
   * 刻意做成注入：判定要读图元几何（`ShapeUtils`），一 import 就会把 three 拖进来，
   * 而这个模块的价值恰恰是「纯函数、可单测」。调用方传
   * `(item) => isCourtyardDrawing(item) || isCourtyardGate(item)` 即可。
   */
  isCourtyardItem: (item: SceneItemLike) => boolean;
}

export interface SceneItemLike {
  id?: string;
  type?: string;
  [key: string]: unknown;
}

export interface SceneEntryLike {
  id?: string;
  kind?: string;
  [key: string]: unknown;
}

/** 建筑外壳条目：这些 `kind` 只影响几何体，不涉及光照或材质状态。 */
const ARCHITECTURE_ENTRY_KINDS = ["door", "window", "railing"];
/** 这两类的几何与开关状态会牵动整层（洞口 = 墙体布尔，排气扇 = 墙体附着）。 */
const WHOLE_SCENE_ITEM_TYPES = ["flooropening", "exhaust-fan"];

export function itemPreviewScope(item: SceneItemLike | null | undefined, options: PreviewScopeOptions): PreviewScope {
  if (!item) return "all";
  if (WHOLE_SCENE_ITEM_TYPES.includes(String(item.type))) return "all";
  if (options.isCourtyardItem(item)) return options.courtyardScope();
  return options.lightTypes.has(String(item.type)) ? "lights" : "items";
}

export function entriesPreviewScope(
  entries: ReadonlyArray<SceneEntryLike>,
  items: ReadonlyArray<SceneItemLike>,
  options: PreviewScopeOptions,
): PreviewScope {
  if (entries.length && entries.every((entry) => ARCHITECTURE_ENTRY_KINDS.includes(String(entry.kind))))
    return "architecture";
  if (!entries.length || entries.some((entry) => entry.kind !== "item")) return "all";
  const entryIdSet = new Set(entries.map((entry) => entry.id)),
    matchedItems = items.filter((item) => entryIdSet.has(item.id));
  if (!matchedItems.length) return "all";
  if (matchedItems.some((item) => WHOLE_SCENE_ITEM_TYPES.includes(String(item.type)))) return "all";
  // 庭院图元：只要混进任何一个非庭院物件，就不能按「庭院」这一档收窄。
  if (matchedItems.some((item) => options.isCourtyardItem(item)))
    return matchedItems.some((item) => options.lightTypes.has(String(item.type)))
      ? "all"
      : options.courtyardScope();
  const lightItemCount = matchedItems.filter((item) => options.lightTypes.has(String(item.type))).length;
  return lightItemCount === matchedItems.length ? "lights" : lightItemCount === 0 ? "items" : "all";
}

export function selectionPreviewScope(
  selection: ReadonlyArray<SceneEntryLike>,
  items: ReadonlyArray<SceneItemLike>,
  { lightTypes }: Pick<PreviewScopeOptions, "lightTypes">,
): PreviewScope | null {
  if (!selection.length) return null;
  if (
    selection.every((entry) => ["wall", ...ARCHITECTURE_ENTRY_KINDS].includes(String(entry.kind)))
  )
    return "architecture";
  if (selection.some((entry) => entry.kind !== "item")) return "all";
  const selectedIdSet = new Set(selection.map((entry) => entry.id)),
    matchedItems = items.filter((item) => selectedIdSet.has(item.id));
  if (!matchedItems.length) return null;
  // 灯带（`striplight`）的高亮会牵动相邻墙面，所以即使它不在 `lightTypes` 里也要计入
  // 高亮重绘（否则选中灯带时墙面高亮不刷新）。
  const highlightItems = matchedItems.filter(
    (item) => !lightTypes.has(String(item.type)) || item.type === "striplight",
  );
  if (!highlightItems.length) return null;
  const lightHighlightCount = highlightItems.filter((item) => lightTypes.has(String(item.type))).length;
  return lightHighlightCount === highlightItems.length
    ? "lights"
    : lightHighlightCount === 0
      ? "items"
      : "all";
}

export interface HistoryScopeOptions {
  itemScope: (item: SceneItemLike) => PreviewScope;
  selectionScope: () => PreviewScope | null;
}

/**
 * 历史快照之间需要重绘多少。
 *
 * 注意「先比去掉物品后的整体」：如果连楼层/设置/灯光组都变了，直接 `'all'`，不必再逐物品
 * 比对。逐物品比对用 `sceneContentKey` 而不是 `JSON.stringify`，键顺序不会误报。
 */
export function historyChangePreviewScope(
  previousScene: Record<string, unknown>,
  nextScene: Record<string, unknown>,
  { itemScope, selectionScope }: HistoryScopeOptions,
): PreviewScope {
  if (sceneContentKey(previousScene) === sceneContentKey(nextScene)) return "none";
  const withoutItems = (scene: Record<string, unknown>) => ({
    ...scene,
    items: [],
    lightGroups: [],
  });
  if (sceneContentKey(withoutItems(previousScene)) !== sceneContentKey(withoutItems(nextScene)))
    return "all";

  const scopes = new Set<PreviewScope>();
  if (JSON.stringify(previousScene.lightGroups) !== JSON.stringify(nextScene.lightGroups))
    scopes.add("lights");

  const previousItemsById = new Map(
      ((previousScene.items as SceneItemLike[] | undefined) || []).map((item) => [item.id, item]),
    ),
    nextItemsById = new Map(
      ((nextScene.items as SceneItemLike[] | undefined) || []).map((item) => [item.id, item]),
    );
  for (const itemId of new Set([...previousItemsById.keys(), ...nextItemsById.keys()])) {
    const previousItem = previousItemsById.get(itemId),
      nextItem = nextItemsById.get(itemId);
    if (
      sceneContentKey({ items: previousItem ? [previousItem] : [] }) !==
      sceneContentKey({ items: nextItem ? [nextItem] : [] })
    ) {
      (previousItem && scopes.add(itemScope(previousItem)),
        nextItem && scopes.add(itemScope(nextItem)));
    }
  }
  if (!scopes.size) return "all";
  const selectedScope = selectionScope();
  selectedScope && scopes.add(selectedScope);
  return scopes.size === 1 ? [...scopes][0] : "all";
}
