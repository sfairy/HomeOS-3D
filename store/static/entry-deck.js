/**
 * 商店入口页状态甲板的自走读数（/user/authentication/login、/register、/forget、
 * /admin、/setup 都引它）。
 *
 * 甲板是后端渲染好的静态标记（见 store/api/telemetry.py），四格里有最多两格是
 * 「时间」：本机时钟、服务运行时长。它们每分每秒都在变，而这几页是 no-store 的 ——
 * 若交给服务端刷新，就等于给入口页装了一台每秒响一次的闹钟：每次请求都要重读一遍
 * 站点配置、重渲染整页，只为了把「3 分」改成「4 分」。
 *
 * 所以分工是：后端只注入**绝对时刻**（data-since），前端负责把它变成「多久之前」。
 *
 * 与主应用那份（frontend/static/auth/entry-deck.js）是**两份文件、一套契约**：
 * 商店是独立构建上下文（store/app.py 只挂 /store-static，拿不到 /static），
 * import 不到应用侧那一份，只能各留一份。契约只有两个属性名 ——
 * ``data-deck``（钩子名）与 ``data-since``（绝对时刻）—— 两边必须逐字相同，
 * 改一处就要改另一处，否则某一侧的四格会安静地停在破折号上。
 *
 * 由此得到两条硬性质：
 *
 *   1. **不发任何请求。** 这个模块没有 fetch、没有 EventSource、没有轮询接口。
 *      它读的是页面里已经有的几个时间戳，刷新频率由 setInterval 决定，与网络无关。
 *   2. **缓存的页面不会显示错的时长。** data-since 是绝对时刻，所以一份被缓存了
 *      十分钟的 HTML 交到浏览器手里，算出来的「已运行 3 小时 12 分」照样是对的。
 *
 * 商店的 CSP 是 ``script-src 'self' 'nonce-…'``：这个文件是同源外部脚本，不带 nonce
 * 也能执行；它只写 textContent，不碰 style 属性，也不插内联脚本。
 * 长度与稠密感全部在 CSS 里按类名给（见 store/static/scene/panel.css 的 .hos-deck 段）。
 */

const decks = document.querySelectorAll('.hos-deck');
// 没有甲板就直接退出：这个脚本同时被三块入口壳引用，缺一块不该在控制台留下一串异常。
//
// 遍历**所有**甲板而不是只取第一个：商店的 store.html 一份文档里就有三块（登录 / 注册 /
// 找回三屏各一块），而按路径切屏时先出现在 DOM 里的那屏往往正是隐藏的那屏 ——
// 只取第一个会让用户真正看到的那一块永远停在服务端注入的破折号上。
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

  /** 一格读数的渲染函数。与主应用那份逐行对应 —— 两份文件，一套行为。 */
  const renderers = {
    clock: () => {
      const now = new Date();
      const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      return calm ? stamp : `${stamp}:${pad(now.getSeconds())}`;
    },
    uptime: (since) => elapsed((Date.now() - since) / 1000),
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
      // 无脑赋值会让无障碍朗读反复念同一句话。
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
