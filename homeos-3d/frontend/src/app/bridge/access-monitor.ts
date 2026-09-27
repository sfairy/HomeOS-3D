/**
 * 3D 交互授权状态监视器。
 */

import type { AccessGrant, AccessState } from "../types/document.js";

// 授权放行的时间窗与轮询节奏（毫秒）：放行窗 60 秒、续期与失败重试各 30 秒。
const ACCESS_GRANT_LIFETIME_MS = 60000;
const ACCESS_GRANT_REFRESH_MS = 30000;
const ACCESS_GRANT_RETRY_MS = 30000;

type AccessMonitorDeps = {
  requestGrant: () => Promise<AccessGrant | null | undefined>;
  now?: () => number;
  setTimer?: (handler: () => void, timeout: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
};

type AccessListener = (state: AccessState) => void;

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/**
 * 创建授权状态监视器。
 */
export function createAccessMonitor({
  requestGrant: requestGrant,
  now: now = () => performance.now(),
  setTimer: setTimer = setTimeout,
  clearTimer: clearTimer = clearTimeout
}: AccessMonitorDeps) {
  // 订阅者集合同时充当「有没有页面在用」的开关：无人订阅时连验证请求都不发。
  const subscribers = new Set<AccessListener>();
  // epoch 是丢弃过期响应的唯一凭据：停表或发起新请求时自增，
  let epoch = 0;
  let refreshTimerId: ReturnType<typeof setTimeout> | undefined;
  let expireTimerId: ReturnType<typeof setTimeout> | undefined;
  // checking 是中性态：既不放行也不报错，界面只显示「正在验证」。
  const pendingState = (): AccessState => ({
    allowed: false,
    status: "checking",
    message: "正在验证 3D 交互授权…"
  });
  let state = pendingState();
  // suspended 用于页面切走：保留订阅关系，但停掉所有定时器，回来时重新验证。
  let isSuspended = false;
  // 先赋值再广播，保证订阅者回调里读到的 state 与收到的通知一致。
  const publishState = (nextState: AccessState) => {
    state = nextState;
    for (const listener of subscribers) {
      listener(state);
    }
  };
  function stopTimers() {
    epoch += 1;
    if (refreshTimerId !== undefined) clearTimer(refreshTimerId);
    if (expireTimerId !== undefined) clearTimer(expireTimerId);
  }
  // 向后端确认一次授权。函数体内所有分支都以 epoch 为准绳：只要期间发生过停表或
  async function refreshGrant() {
    if (!subscribers.size || isSuspended) {
      return;
    }
    // 自增后立即取号：本次请求之后的任何停表 / 新请求都会让这个号失效。
    const requestEpoch = ++epoch;
    const startedAt = now();
    try {
      const grant = await requestGrant();
      // 三个条件缺一不可：过期响应、已无人订阅、已暂停，任一命中都丢弃本次结果。
      if (requestEpoch !== epoch || !subscribers.size || isSuspended) {
        return;
      }
      // 放行窗最多 60 秒：既不让本地状态长期脱离后端，也不因窗口太短把轮询打成高频请求。
      const lifetimeMs = Math.min(ACCESS_GRANT_LIFETIME_MS, Number(grant?.validForSeconds) * 1000);
      // allowed 必须严格为 true；寿命非法同样按拒绝处理，并补一个 403
      if (grant?.allowed !== true || !Number.isFinite(lifetimeMs) || lifetimeMs <= 0) {
        throw Object.assign(new Error("invalid grant"), {
          status: 403
        });
      }
      const remainingMs = lifetimeMs - (now() - startedAt);
      // 响应慢到寿命已经耗尽时按失败处理，让下一轮重新验证，而不是发布一个立刻过期的放行状态。
      if (remainingMs <= 0) {
        throw new Error("grant response arrived too late");
      }
      if (expireTimerId !== undefined) clearTimer(expireTimerId);
      // 到期只把状态改回 checking 并等下一轮验证，而不是直接 denied —— 短暂超时不等于无授权。
      expireTimerId = setTimer(() => {
        publishState({
          allowed: false,
          status: "checking",
          message: "正在重新验证 3D 交互授权…"
        });
      }, remainingMs);
      publishState({
        allowed: true,
        status: "allowed",
        message: "",
        deadline: now() + remainingMs
      });
      // 在寿命过半时提前续期；下限 100ms 防止后端给出极小有效期时打爆请求，
      refreshTimerId = setTimer(
        refreshGrant,
        Math.min(ACCESS_GRANT_REFRESH_MS, Math.max(100, remainingMs / 2))
      );
    } catch (error) {
      // 失败同样要按 epoch 判定：晚到的错误若照单全收，会把已恢复的放行状态改回不可用。
      if (requestEpoch !== epoch || !subscribers.size || isSuspended) {
        return;
      }
      if (expireTimerId !== undefined) clearTimer(expireTimerId);
      const status = errorStatus(error);
      // 403 是后端明确拒绝（未购买或已撤销），401 是登录态失效，其余按网络问题处理并自动重试。
      publishState(
        status === 403
          ? {
              allowed: false,
              status: "denied",
              message: "3D 交互授权不可用，请在授权信息中查看。"
            }
          : {
              allowed: false,
              status: "unavailable",
              message:
                status === 401
                  ? "登录状态已失效，请重新登录。"
                  : "连接暂时中断，正在重新验证…"
            }
      );
      // 失败固定 30 秒后重试（与上游同口径），不做指数退避：授权是页面可用性的硬前提，
      refreshTimerId = setTimer(refreshGrant, ACCESS_GRANT_RETRY_MS);
    }
  }
  return {
    subscribe(onStateChange: AccessListener) {
      subscribers.add(onStateChange);
      onStateChange(state);
      // 只有第一个订阅者才触发首次验证：之前没有任何页面在消费这条状态流。
      if (subscribers.size === 1) {
        refreshGrant();
      }
      return () => {
        subscribers.delete(onStateChange);
        // 最后一个订阅者离开后停表并复位：下次订阅重新从 checking 开始。
        if (!subscribers.size) {
          stopTimers();
          state = pendingState();
        }
      };
    },
    suspend() {
      isSuspended = true;
      stopTimers();
      publishState({
        allowed: false,
        status: "suspended",
        message: "3D 交互已暂停，返回页面后重新验证授权。"
      });
    },
    // 页面恢复时调用：先回到 checking 再立即验证，不等下一个续期周期。
    resume() {
      isSuspended = false;
      stopTimers();
      publishState(pendingState());
      refreshGrant();
    }
  };
}
