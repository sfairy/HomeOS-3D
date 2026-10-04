/**
 * 场景仪表盘读数（时钟 / 在线时长 / 连接时长）。由认证类 Vue 视图在挂载时调用一次。
 *
 * 返回一个清理函数：SPA 客户端导航离开时调用，避免定时器在旧文档里空转。
 */
export function initEntryDeck(): () => void {
  const decks = document.querySelectorAll(".hos-deck");
  if (!decks.length) return () => {};

  const calm = window.matchMedia(
    "(prefers-reduced-motion: reduce), (pointer: coarse), (hover: none)",
  ).matches;
  const tick = calm ? 30_000 : 1_000;

  const pad = (value) => String(value).padStart(2, "0");

  /** 已运行多久。 */
  const elapsed = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return "刚刚启动";
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}时${minutes % 60}分`;
    return `${Math.floor(hours / 24)}天${hours % 24}时`;
  };

  /** 距某个时刻多久。 */
  const ago = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return "刚刚";
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  /** 一格读数的渲染函数； */
  const renderers = {
    clock: () => {
      const now = new Date();
      const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      return calm ? stamp : `${stamp}:${pad(now.getSeconds())}`;
    },
    uptime: (since) => elapsed((Date.now() - since) / 1000),
    since: (since) => ago((Date.now() - since) / 1000),
  };

  const hooks = [];
  for (const deck of decks) {
    for (const node of deck.querySelectorAll<HTMLElement>("[data-deck]")) {
      const render = renderers[node.dataset.deck];
      if (!render) continue;

      const since = node.dataset.since ? Date.parse(node.dataset.since) : Number.NaN;
      if (node.dataset.deck !== "clock" && Number.isNaN(since)) continue;
      hooks.push({ node, render, since });
    }
  }

  const paint = () => {
    for (const { node, render, since } of hooks) {
      const next = render(since);
      if (node.textContent !== next) node.textContent = next;
    }
  };

  paint();

  let intervalId = 0;
  const timeoutId = window.setTimeout(() => {
    paint();
    intervalId = window.setInterval(paint, tick);
  }, tick - (Date.now() % tick));

  return () => {
    clearTimeout(timeoutId);
    clearInterval(intervalId);
  };
}
