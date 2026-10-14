/**
 * 模型库：类目表、卡片可见性判定与长名称滚动。
 *
 * 类目从 0.7.5 的粗粒度（`乔木与绿植` / `休闲家具` / `厨房电器` …）整组替换为
 * 0.7.6 的细粒度分区；庭院按 `courtyard-0..5` 再分六段。
 */

/** 细粒度类目 id → 中文标题。 */
export const LIBRARY_GROUPS = Object.freeze({
  living: "客厅家具",
  storage: "柜架收纳",
  entry: "玄关用品",
  bedroom: "卧室家具",
  "kitchen-furniture": "厨房家具",
  "kitchen-tools": "厨房用品",
  bathroom: "卫浴用品",
  office: "书房家具",
  kids: "儿童用品",
  pets: "宠物用品",
  plants: "室内植物",
  decor: "生活装饰",
  fitness: "健身娱乐",
  architecture: "建筑与交通",
  media: "影音设备",
  "kitchen-devices": "厨房电器",
  laundry: "洗衣烘干",
  cleaning: "清洁设备",
  "office-devices": "办公数码",
  environment: "环境设备",
  "lighting-decor": "装饰灯具",
  "courtyard-0": "庭院植物",
  "courtyard-1": "庭院家具",
  "courtyard-2": "庭院建筑",
  "courtyard-3": "庭院景观",
  "courtyard-4": "庭院设施",
  "courtyard-5": "庭院附属",
});

export type LibraryGroupId = keyof typeof LIBRARY_GROUPS;

/** 类目分组：家居 / 电器 / 庭院 / 灯光，与 `data-library-category` 一致。 */
export type LibraryCategoryId = "home" | "appliance" | "courtyard" | "light";

/** 判定用的大类：把外部传进来的字符串收窄成 `LibraryCategoryId`，非法值回落到 `home`。 */
export function normalizeLibraryCategory(category: unknown): LibraryCategoryId {
  return category === "appliance" || category === "courtyard" || category === "light"
    ? category
    : "home";
}

function normalizeLibrarySearchText(searchText: unknown) {
  return String(searchText || "")
    .toLocaleLowerCase()
    .replace(/\s+/g, "");
}

/**
 * 卡片是否命中当前类目 / 分区 / 搜索词。
 *
 * 分区与搜索词都是**可选**收窄条件：不传分区时只按大类过滤（0.7.5 的旧行为），
 * 不传搜索词时不按名称过滤。
 */
export function libraryCardVisible(
  card: HTMLElement,
  category: LibraryCategoryId,
  group?: string | null,
  query?: string | null,
): boolean {
  return (
    card.dataset.libraryCategory === category &&
    (!group || card.dataset.libraryGroup === group) &&
    (!query ||
      normalizeLibrarySearchText(card.dataset.libraryName || card.title).includes(
        normalizeLibrarySearchText(query),
      ))
  );
}

/** 名称溢出时的滚动动画时长：随溢出距离线性增长，下限 1.2s。 */
const LIBRARY_NAME_SCROLL_MIN_MS = 1200;
const LIBRARY_NAME_SCROLL_MS_PER_PX = 14;
const LIBRARY_NAME_SCROLL_BASE_MS = 600;

/** 系统里声明「减少动效」时不启动名称滚动（宿主没实现 `matchMedia` 就当作不减少）。 */
function defaultReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * 给模型卡片的名称加「溢出则循环滚动」。
 *
 * 名称被换成 `<span class="asset-name-window"><b class="asset-name-text">` 结构，
 * 只有悬停 / 聚焦时才测量并启动动画；`hidden` 或用户声明减少动效时不动。
 * 返回 `cancelAll` / `dispose`，`pagehide` 时按 `persisted` 决定是停动画还是彻底卸载。
 *
 * 灯具模板卡的名称本来就短，调用方也把 `#light-asset-row` 摘在一边，这里再按类名跳过，
 * 免得调用点为了传「过滤后的按钮」多写一个闭包。
 */
export function installLibraryNameScroll(
  cards: Iterable<HTMLElement>,
  {
    reducedMotion = defaultReducedMotion,
    lifecycle = globalThis.window,
  }: {
    reducedMotion?: () => boolean;
    lifecycle?: Window | null;
  } = {},
): { cancelAll: () => void; dispose: () => void } {
  const teardownCallbacks: Array<() => void> = [];
  const runningAnimationsByCard = new Map<HTMLElement, Animation>();

  function cancelCardScroll(card: HTMLElement) {
    runningAnimationsByCard.get(card)?.cancel();
    runningAnimationsByCard.delete(card);
  }

  for (const card of cards) {
    if (card.classList.contains("light-asset-card")) continue;
    const nameWindow = card.querySelector("span");
    if (!nameWindow || nameWindow.classList.contains("asset-name-window")) continue;
    const nameText = nameWindow.ownerDocument.createElement("b");
    nameText.className = "asset-name-text";
    nameText.textContent = nameWindow.textContent;
    card.title = nameWindow.textContent || "";
    card.setAttribute("aria-label", nameWindow.textContent || "");
    nameWindow.classList.add("asset-name-window");
    nameWindow.replaceChildren(nameText);

    const startScroll = () => {
      cancelCardScroll(card);
      if (reducedMotion() || card.hidden) return;
      const overflowDistance = nameText.scrollWidth - nameWindow.clientWidth;
      if (overflowDistance <= 1 || !nameText.animate) return;
      runningAnimationsByCard.set(
        card,
        nameText.animate(
          [
            { transform: "translateX(0)", offset: 0 },
            { transform: "translateX(0)", offset: 0.08 },
            { transform: `translateX(-${overflowDistance}px)`, offset: 0.74 },
            { transform: `translateX(-${overflowDistance}px)`, offset: 0.87 },
            { transform: "translateX(0)", offset: 1 },
          ],
          {
            duration: Math.max(
              LIBRARY_NAME_SCROLL_MIN_MS,
              overflowDistance * LIBRARY_NAME_SCROLL_MS_PER_PX + LIBRARY_NAME_SCROLL_BASE_MS,
            ),
            iterations: Infinity,
            easing: "linear",
          },
        ),
      );
    };
    const stopScroll = () => cancelCardScroll(card);

    for (const [eventName, scrollHandler] of [
      ["pointerenter", startScroll],
      ["focus", startScroll],
      ["pointerleave", stopScroll],
      ["blur", stopScroll],
    ] as const) {
      card.addEventListener(eventName, scrollHandler);
      teardownCallbacks.push(() => card.removeEventListener(eventName, scrollHandler));
    }
  }

  const cancelAll = () => {
    for (const card of runningAnimationsByCard.keys()) cancelCardScroll(card);
  };

  function dispose() {
    cancelAll();
    teardownCallbacks.splice(0).forEach((teardown) => teardown());
    lifecycle?.removeEventListener("pagehide", onPageHide);
  }

  function onPageHide(pageHideEvent: PageTransitionEvent) {
    if (pageHideEvent.persisted) cancelAll();
    else dispose();
  }

  lifecycle?.addEventListener("pagehide", onPageHide);
  return { cancelAll, dispose };
}
