// 入口页状态甲板的自走读数（/setup、/login、/license、/pair、恢复页都引它）。
//
// 源：homeos-3d/frontend/src/app/auth/entry-deck.ts。
// 它只读页面里已经有的时间戳（data-since），不发任何请求；没有 .hos-deck 时自行退出，
// 所以五页共用一份不会互相干扰。
//
// ⚠ 当前状态：尚无 telemetry 读数源，五个入口页都**没有** .hos-deck 标记，
// 因此这个模块现在是无操作（挂上去立刻返回）。之所以照旧移植并接线，是为了保住这个插槽：
// 将来某页加上 .hos-deck 与 data-deck/data-since，这份读数就是现成的，不必再回头补脚本。
// 真要让甲板出场，参照 homeos-3d 的 backend/src/http/telemetry.py 的 deck_markup。
const decks = document.querySelectorAll(".hos-deck");
// 没有甲板就直接退出：这几个脚本同时被五个页面引用，缺一块不该在控制台留下一串 null 异常。
if (decks.length) {
  // 降低动效偏好、以及触摸设备：秒级跳动的数字也是一种「持续动效」。这里改成每 30 秒，
  // 与 scene.css 里 .hos-touch 把场景动画降级成静止一帧是同一条判据。
  const calm = window.matchMedia(
    "(prefers-reduced-motion: reduce), (pointer: coarse), (hover: none)",
  ).matches;
  const tick = calm ? 30_000 : 1_000;

  const pad = (value) => String(value).padStart(2, "0");

  /** 已运行多久。到小时就四舍五入到分：这一格比时间点宽，「1天0时」比「24时0分」好读。 */
  const elapsed = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return "刚刚启动";
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}时${minutes % 60}分`;
    return `${Math.floor(hours / 24)}天${hours % 24}时`;
  };

  /** 距某个时刻多久。到小时就不再给分：这一格比运行时长紧，「23时59分前」是七个字，
      而多出来的那 59 分钟对判断毫无帮助 —— 用户要看的是「同步是不是停住了」。 */
  const ago = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return "刚刚";
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
    // data-deck / data-since 都挂在元素上，所以按 HTMLElement 取（Element 没有 dataset）。
  for (const node of deck.querySelectorAll<HTMLElement>("[data-deck]")) {
      const render = renderers[node.dataset.deck];
      if (!render) continue;
      // 缺时间戳的格子（服务端没给起点）保持原样：宁可显示一条静态读数，
      // 也不要把它替换成「NaN天前」这种更像故障的东西。
      const since = node.dataset.since ? Date.parse(node.dataset.since) : Number.NaN;
      if (node.dataset.deck !== "clock" && Number.isNaN(since)) continue;
      hooks.push({ node, render, since });
    }
  }

  const paint = () => {
    for (const { node, render, since } of hooks) {
      const next = render(since);
      // 只在文本真的变了才写 DOM：每 30 秒一轮里，多数格子的读数是不变的，
      // 无条件赋值会让屏幕阅读器反复重读同一格。
      if (node.textContent !== next) node.textContent = next;
    }
  };

  paint();
  // 对齐到整拍再起 interval：否则每页的读数在各自加载时刻上错开，五页看起来像五个时钟。
  window.setTimeout(() => {
    paint();
    window.setInterval(paint, tick);
  }, tick - (Date.now() % tick));
}
