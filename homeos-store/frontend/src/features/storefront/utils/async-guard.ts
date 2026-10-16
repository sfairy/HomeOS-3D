/**
 * 异步竞态守卫：把「在途响应回来时，这次请求还算不算数」变成可测的纯判定。
 *
 * 商店前端有两处典型竞态，原先各自内联了一份守卫，且都只能靠手点浏览器才会发现回归：
 *
 * 1. 下单轮询（`stores/order.ts`）：用户关掉支付弹窗 / 换了单之后，在途的订单查询回来
 *    仍会写回 `currentOrder`，状态是 `fulfilled` 时还会把整页跳去账号中心；
 * 2. 优惠码试算（`views/store/ItemView.vue`）：防抖 450ms 之后发请求，用户继续打字时
 *    旧响应回来会把已经过期的折扣价盖回表单上。
 *
 * 两种场景的判定其实同一条：**这次响应是不是最新一次请求的**。区别只在「何时作废」——
 * 轮询由「关闭弹窗 / 换单」显式作废（:func:`createEpochGuard`），试算由「每一次新的输入」
 * 自动作废上一次（:func:`createLatestGuard`）。
 *
 * 本模块**不 import 任何东西**（不引 vue / pinia，也不读 `window`）：一旦引入这些，
 * `scripts/_store_frontend_race_smoke.mjs` 就得先把浏览器环境搭起来，纯函数的意义就没了。
 */

interface RequestGuard {
  /** 开始一次请求并拿到它的令牌；响应回来时用 :meth:`isCurrent` 判断是否仍有效。 */
  begin(): number;
  /** 作废当前所有在途请求（弹窗关闭 / 换单 / 输入变了）。 */
  invalidate(): void;
  /** 这份响应是否仍属于当前这次请求。 */
  isCurrent(token: number): boolean;
}

/**
 * 「显式作废」型守卫：令牌在开始请求时取得，只有调用 :meth:`invalidate` 才会换代。
 *
 * 适合「同一代里可能有多次请求并发」的场景（轮询：定时器与倒计时都会发查询，它们同属
 * 一次支付会话，弹窗一关就整代作废）。
 */
export function createEpochGuard(): RequestGuard {
  let epoch = 0;
  return {
    begin: () => epoch,
    invalidate: () => {
      epoch += 1;
    },
    isCurrent: (token) => token === epoch,
  };
}

/**
 * 「最新一次」型守卫：每次 :meth:`begin` 都自动作废上一次未完成的请求。
 *
 * 适合「后发先至」场景（防抖试算：用户停手 450ms 后发的那次才算数，之前所有在途响应
 * 全部丢弃）。
 */
export function createLatestGuard(): RequestGuard {
  const epochs = createEpochGuard();
  return {
    begin: () => {
      epochs.invalidate();
      return epochs.begin();
    },
    invalidate: () => epochs.invalidate(),
    isCurrent: (token) => epochs.isCurrent(token),
  };
}
