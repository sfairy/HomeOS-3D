/**
 * 入口页状态甲板的自走读数（/setup、/login、/license、/pair、恢复页都引它）。
 *
 * 甲板是后端渲染好的静态标记（见 backend/http/telemetry.py），四格里最多有三格是
 * 「时间」：本机时钟、服务运行时长、距上次 HA 同步多久。它们每分每秒都在变，
 * 而这几页是**不可缓存**的（Cache-Control: no-store）—— 若交给服务端刷新，
 * 就等于给入口页装了一台每秒响一次的闹钟：每次请求都要重查一遍数据库、
 * 重跑一遍授权验签，只为了把「3 分」改成「4 分」。
 *
 * 所以分工是：后端只注入**绝对时刻**（data-since），前端负责把它变成「多久之前」。
 * 由此得到两条硬性质：
 *
 *   1. **不发任何请求。** 这个模块没有 fetch、没有 EventSource、没有轮询接口。
 *      它读的是页面里已经有的几个时间戳。刷新频率由 setInterval 决定，与网络无关。
 *   2. **缓存的页面不会显示错的时长。** data-since 是绝对时刻，所以一份被缓存了
 *      十分钟的 HTML 交到浏览器手里，算出来的「已运行 3 小时 12 分」照样是对的 ——
 *      这正是不把「已经过去多久」写进服务端标记的原因（那条路会让整页缓存每分钟失效，
 *      见 telemetry.deck_tiles 的 docstring）。
 *
 * CSP 是 style-src 'self'：这里只写 textContent，不碰 style 属性，也不插内联样式。
 * 长度与稠密感全部在 CSS 里按类名给（见 design/scene/panel.css 的 .hos-deck 段）。
 */

const decks = document.querySelectorAll('.hos-deck');
// 没有甲板就直接退出：这几个脚本同时被五个页面引用，缺一块不该在控制台留下一串 null 异常。
//
// 遍历**所有**甲板而不是只取第一个：同一份模板里可以有多块（/setup 的「表单 / 已初始化」
// 两屏各一块，商店的 store.html 更是认证三屏各一块）。只取第一个的写法在单屏页面上看不出
// 问题，却会让后面那几块永远停在服务端注入的破折号上 —— 而它们中有的是**唯一可见**的那块
// （按路径切屏时先出现在 DOM 里的那屏往往是隐藏的）。
if (decks.length) {
  // 降低动效偏好：秒级跳动的数字也是一种「持续动效」。这里改成每 30 秒一跳、
  // 并且时钟只到分钟 —— 读数仍然是活的，但不再一秒一闪。
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = calm ? 30_000 : 1_000;

  const pad = (value) => String(value).padStart(2, '0');

  /** 距某个时刻过去了多久。与后端 _elapsed_placeholder 的档位保持同一套读法。 */
  const elapsed = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return '刚刚启动';
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes} 分`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 时 ${minutes % 60} 分`;
    return `${Math.floor(hours / 24)} 天 ${hours % 24} 时`;
  };

  /** 一格读数的渲染函数；返回 null 表示这一格的 data-since 不可用，保持原样。 */
  const renderers = {
    clock: () => {
      const now = new Date();
      const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      return calm ? stamp : `${stamp}:${pad(now.getSeconds())}`;
    },
    uptime: (since) => elapsed((Date.now() - since) / 1000),
    since: (since) => {
      const seconds = (Date.now() - since) / 1000;
      // 「刚刚启动」是给运行时长用的措辞，套在「上次同步」上读起来像另一件事。
      if (seconds < 60) return '刚刚';
      return `${elapsed(seconds)}前`;
    },
  };

  const hooks = [];
  for (const deck of decks) {
    for (const node of deck.querySelectorAll('[data-deck]')) {
      const render = renderers[node.dataset.deck];
      if (!render) continue;
      // 缺时间戳的格子（服务端没给起点）保持原样：宁可显示一条静态读数，
      // 也不要让它变成 NaN 或「1970 年至今」。
      const since = node.dataset.since ? Date.parse(node.dataset.since) : Number.NaN;
      if (node.dataset.deck !== 'clock' && Number.isNaN(since)) continue;
      hooks.push({ node, render, since });
    }
  }

  const paint = () => {
    for (const { node, render, since } of hooks) {
      const next = render(since);
      // 只在文本真的变了才写 DOM：每 30 秒一轮里，多数格子的读数是不变的，
      // 无脑赋值会让无障碍朗读（aria-live 之外的轮询式朗读）反复念同一句话。
      if (node.textContent !== next) node.textContent = next;
    }
  };

  paint();
  // 对齐到下一个人为的边界再起跳，避免首屏出现「00:00:00 → 00:00:01」这种半秒偏差。
  window.setTimeout(() => {
    paint();
    window.setInterval(paint, tick);
  }, tick - (Date.now() % tick));
}
