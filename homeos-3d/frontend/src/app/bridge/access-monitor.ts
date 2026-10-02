const MAX_GRANT_MS = 60000,
  MAX_REFRESH_DELAY_MS = 30000,
  RETRY_DELAY_MS = 30000;

/** 授权状态快照，会原样交给每个订阅者。 */
type AccessMonitorState = {
  allowed: boolean;
  status: string;
  message: string;
  deadline?: number;
};
export function createAccessMonitor({
  requestGrant: requestGrant,
  now: now = () => performance.now(),
  setTimer: setTimer = setTimeout,
  clearTimer: clearTimer = clearTimeout,
}) {
  const subscriberSet = new Set<(state: AccessMonitorState) => void>();
  let generation = 0,
    refreshTimer,
    expiryTimer;
  const checkingState = () => ({
    allowed: false,
    status: "checking",
    message: "正在验证 3D 交互授权…",
  });
  let currentState = checkingState(),
    isSuspended = false;
  const publishState = (state) => {
    currentState = state;
    for (const listener of subscriberSet) listener(currentState);
  };
  function clearTimers() {
    ((generation += 1), clearTimer(refreshTimer), clearTimer(expiryTimer));
  }
  async function refreshGrant() {
    if (!subscriberSet.size || isSuspended) return;
    const requestGeneration = ++generation,
      startedAt = now();
    try {
      const grant = await requestGrant();
      if (requestGeneration !== generation || !subscriberSet.size || isSuspended) return;
      const validFor = Math.min(60000, Number(grant?.validForSeconds) * 1000);
      if (grant?.allowed !== true || !Number.isFinite(validFor) || validFor <= 0)
        throw Object.assign(new Error("invalid grant"), {
          status: 403,
        });
      const remainingMs = validFor - (now() - startedAt);
      if (remainingMs <= 0) throw new Error("grant response arrived too late");
      (clearTimer(expiryTimer),
        (expiryTimer = setTimer(() => {
          publishState({
            allowed: false,
            status: "checking",
            message: "正在重新验证 3D 交互授权…",
          });
        }, remainingMs)),
        publishState({
          allowed: true,
          status: "allowed",
          message: "",
          deadline: now() + remainingMs,
        }),
        (refreshTimer = setTimer(refreshGrant, Math.min(30000, Math.max(100, remainingMs / 2)))));
    } catch (grantError) {
      if (requestGeneration !== generation || !subscriberSet.size || isSuspended) return;
      (clearTimer(expiryTimer),
        publishState(
          grantError?.status === 403
            ? {
                allowed: false,
                status: "denied",
                message: "3D 交互授权不可用，请在授权信息中查看。",
              }
            : {
                allowed: false,
                status: "unavailable",
                message:
                  grantError?.status === 401
                    ? "登录状态已失效，请重新登录。"
                    : "连接暂时中断，正在重新验证…",
              },
        ),
        (refreshTimer = setTimer(refreshGrant, 30000)));
    }
  }
  return {
    subscribe(subscriber) {
      return (
        subscriberSet.add(subscriber),
        subscriber(currentState),
        subscriberSet.size === 1 && refreshGrant(),
        () => {
          (subscriberSet.delete(subscriber),
            subscriberSet.size || (clearTimers(), (currentState = checkingState())));
        }
      );
    },
    suspend() {
      ((isSuspended = true),
        clearTimers(),
        publishState({
          allowed: false,
          status: "suspended",
          message: "3D 交互已暂停，返回页面后重新验证授权。",
        }));
    },
    resume() {
      ((isSuspended = false), clearTimers(), publishState(checkingState()), refreshGrant());
    },
  };
}
