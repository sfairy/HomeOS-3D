/**
 * 入口页状态甲板的自走读数（/setup、/login、/license、/pair、恢复页都引它）。
 */

const decks = document.querySelectorAll('.hos-deck');
// 没有甲板就直接退出：这几个脚本同时被五个页面引用，缺一块不该在控制台留下一串 null 异常。
if (decks.length) {
  // 降低动效偏好、以及触摸设备：秒级跳动的数字也是一种「持续动效」。这里改成每 30 秒
  const calm = window.matchMedia(
    '(prefers-reduced-motion: reduce), (pointer: coarse), (hover: none)'
  ).matches;
  const tick = calm ? 30_000 : 1_000;

  const pad = (value) => String(value).padStart(2, '0');

  const elapsed = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return '刚刚启动';
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}时${minutes % 60}分`;
    return `${Math.floor(hours / 24)}天${hours % 24}时`;
  };

  /** 距某个时刻多久。到小时就不再给分：这一格比运行时长紧，「23时59分前」是七个
      ——「同步是不是停住了」。 */
  const ago = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return '刚刚';
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  /** 一格读数的渲染函数；返回 null 表示这一格的 data-since 不可用，保持原样。 */
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
    for (const node of deck.querySelectorAll('[data-deck]')) {
      const render = renderers[node.dataset.deck];
      if (!render) continue;
      // 缺时间戳的格子（服务端没给起点）保持原样：宁可显示一条静态读数，
      const since = node.dataset.since ? Date.parse(node.dataset.since) : Number.NaN;
      if (node.dataset.deck !== 'clock' && Number.isNaN(since)) continue;
      hooks.push({ node, render, since });
    }
  }

  const paint = () => {
    for (const { node, render, since } of hooks) {
      const next = render(since);
      // 只在文本真的变了才写 DOM：每 30 秒一轮里，多数格子的读数是不变的，
      if (node.textContent !== next) node.textContent = next;
    }
  };

  paint();
  window.setTimeout(() => {
    paint();
    window.setInterval(paint, tick);
  }, tick - (Date.now() % tick));
}
