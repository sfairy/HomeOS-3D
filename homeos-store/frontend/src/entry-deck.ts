/** 商店入口页状态甲板的自走读数（/user/authentication/login、/register、/forget、 */

const decks = document.querySelectorAll('.hos-deck');

if (decks.length) {

  const calm = window.matchMedia(
    '(prefers-reduced-motion: reduce), (pointer: coarse), (hover: none)'
  ).matches;
  const tick = calm ? 30_000 : 1_000;

  const pad = (value: number) => String(value).padStart(2, '0');

  const elapsed = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return '刚刚启动';
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}时${minutes % 60}分`;
    return `${Math.floor(hours / 24)}天${hours % 24}时`;
  };

  /** 一格读数的渲染函数。 */
  const renderers: Record<string, (since: number) => string> = {
    clock: () => {
      const now = new Date();
      const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      return calm ? stamp : `${stamp}:${pad(now.getSeconds())}`;
    },
    uptime: (since) => elapsed((Date.now() - since) / 1000),
  };

  type DeckHook = {
    node: HTMLElement;
    render: (since: number) => string;
    since: number;
  };

  const hooks: DeckHook[] = [];
  for (const deck of decks) {
    for (const node of deck.querySelectorAll<HTMLElement>('[data-deck]')) {
      const key = node.dataset.deck || '';
      const render = renderers[key];
      if (!render) continue;

      const since = node.dataset.since ? Date.parse(node.dataset.since) : Number.NaN;
      if (node.dataset.deck !== 'clock' && Number.isNaN(since)) continue;
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
  window.setTimeout(() => {
    paint();
    window.setInterval(paint, tick);
  }, tick - (Date.now() % tick));
}
