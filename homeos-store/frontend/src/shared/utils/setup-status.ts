/**
 * 初始化状态（`GET /store/v1/setup/status`）的**首帧前快照**。
 *
 * 为什么要有这个模块：`SetupView` 原先在 `onMounted` 里才问服务端「有没有管理员」，
 * 于是首帧必定是「正在检查初始化状态…」那一屏，几百毫秒后再整套换成创建表单 ——
 * 抬头、说明、表单一起换，坞体高度从两行跳到一屏。这正是入户页闪烁清单里的
 * 「先从骨架切状态」。
 *
 * 现在探测上移到路由守卫（见 `router/index.ts`），结果写进这里的模块级快照，
 * 视图在 `setup()` 里**同步**读出来：首帧就是最终形态。
 *
 * 三条约束：
 * 1. 快照只是「最近一次已知」的缓存，服务端仍是权威；落库失败时本模块不兜底。
 * 2. 探测要能带引导密钥（`#token=…`）—— 远程访问时服务端要靠它决定能不能初始化。
 * 3. 失败不抛给调用方：返回 `unreachable` 快照，页面照常渲染并说明原因。
 */

/** 初始化状态的三种终态（没有「检查中」：检查发生在首帧之前）。 */
export type SetupState = "open" | "initialized" | "unreachable";

/** 一次探测的结果。字符串字段一律给空串，方便视图直接 bind。 */
export interface SetupSnapshot {
  state: SetupState;
  /** 远程访问时是否必须携带引导密钥（`STORE_SETUP_TOKEN`）。 */
  requiresToken: boolean;
  /** 服务端给的密钥提示文案（可能为空）。 */
  hint: string;
  /** `unreachable` 时要显示的原因。 */
  error: string;
}

/** 服务端响应体里我们真正用到的字段。 */
interface SetupStatusPayload {
  initialized?: boolean;
  canInitialize?: boolean;
  requiresSetupToken?: boolean;
  setupTokenHint?: string;
  detail?: string;
}

let snapshot: SetupSnapshot | null = null;
let inflight: Promise<SetupSnapshot> | null = null;

/** 读最近一次快照（没有则为 null，调用方按保守形态处理）。 */
export function peekSetupStatus(): SetupSnapshot | null {
  return snapshot;
}

/** 记下快照（探测函数与测试都会用到）。 */
export function rememberSetupStatus(next: SetupSnapshot): SetupSnapshot {
  snapshot = next;
  return next;
}

/**
 * 从地址片段里取引导密钥。
 *
 * 服务端把 token 放在 `#token=…`，前端读到后要立刻从地址栏抹掉（见 `SetupView`）；
 * 守卫在页面挂载前就需要它，所以解析逻辑放在这里共用。
 *
 * @param hash 目标路由的 `hash`（形如 `#token=abc`），含前导 `#`
 * @returns 解析出的 token；没有或格式坏掉时返回空串
 */
export function setupTokenFromHash(hash: string | undefined): string {
  const match = /(?:^|[#&])token=([^&]+)/.exec(hash || "");
  if (!match) return "";
  try {
    return decodeURIComponent(match[1] ?? "").trim();
  } catch {
    // 片段被手工改坏（非法 % 转义）时会抛：当作没带 token，用户仍可手填。
    return "";
  }
}

/**
 * 问一次初始化状态，结果落进快照。
 *
 * @param token 可选的引导密钥（远程访问时必须带，否则服务端只会回「不可初始化」）
 * @param options.force 为 true 时忽略已有快照重新探测
 */
export function probeSetupStatus(
  token = "",
  options: { force?: boolean } = {},
): Promise<SetupSnapshot> {
  if (!options.force && snapshot) return Promise.resolve(snapshot);
  if (inflight) return inflight;
  inflight = (async (): Promise<SetupSnapshot> => {
    try {
      const response = await fetch("/store/v1/setup/status", {
        method: "GET",
        credentials: "same-origin",
        headers: token ? { "X-Setup-Token": token } : {},
      });
      const data = (await response.json().catch(() => ({}))) as SetupStatusPayload;
      if (!response.ok) {
        // 服务端暂不能给状态（如 503 装配异常）：既不能装作可初始化，更不能谎报已初始化。
        return rememberSetupStatus({
          state: "unreachable",
          requiresToken: false,
          hint: "",
          error: data?.detail || "无法读取初始化状态，请确认商店服务已启动。",
        });
      }
      if (data?.initialized) {
        return rememberSetupStatus({
          state: "initialized",
          requiresToken: false,
          hint: "",
          error: "",
        });
      }
      return rememberSetupStatus({
        state: "open",
        requiresToken: Boolean(data?.requiresSetupToken),
        hint: (data?.setupTokenHint || "").trim(),
        error: "",
      });
    } catch {
      return rememberSetupStatus({
        state: "unreachable",
        requiresToken: false,
        hint: "",
        error: "网络错误：读不到初始化状态。请确认商店服务已启动后重试。",
      });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
