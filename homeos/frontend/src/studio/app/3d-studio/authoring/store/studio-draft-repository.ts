/**
 * C3 —— studio 草稿仓储（把 C2 保存状态机接到真实 HTTP 契约上）。
 *
 * 职责边界：本文件只做**传输**——URL、请求体、CSRF、超时、错误归一化；
 * 状态机（dirty / saving / conflict / blocked）在 save-store，文档与版本线在 document-store。
 * 因此它是 \`SaveTransport\` 的一个实现，不持有任何 UI 或 DOM 状态。
 *
 * 后端契约（homeos/backend/src/api/studio3d.py + domains/studio3d/service.py）：
 * - GET  /api/v1/studio3d                      → {revision, scene, updatedAt}；空场景是 {revision:0, scene:null, updatedAt:null}
 * - PUT  /api/v1/studio3d {revision, scene, interactionConfirmation}
 *                                              → 200 {revision, scene, updatedAt}
 * - 409 detail {code:"STUDIO3D_REVISION_CONFLICT", message, currentRevision}
 * - 428 detail {code:"STUDIO3D_INTERACTION_CONFIRMATION", token, message, impacts, projects}
 * - 413 体积超限 / 422 非法请求 / 401、403 鉴权
 *
 * 传输失败（断网、超时、非 JSON 响应）一律归一化成 \`status: undefined\`，
 * 由 save-store 的 classifySaveError 判成可重试；绝不吞掉 409/428 的结构化 detail。
 */

import { withCsrf } from "@/services/api/csrf";
import type {
  SaveRequestError,
  SaveTransport,
  SaveTransportPutRequest,
  SaveTransportResult,
} from "./save-store";
import type { StudioDraftPayload } from "./document-store";

const STUDIO3D_DRAFT_URL = "/api/v1/studio3d";
const STUDIO3D_REQUEST_TIMEOUT_MS = 15000;

interface StudioDraftRepositoryOptions {
  /** 默认 \`/api/v1/studio3d\`；测试可覆盖成全路径。 */
  url?: string;
  /** 注入 fetch（测试用）；默认 \`globalThis.fetch.bind(globalThis)\`。 */
  fetchImpl?: typeof fetch;
  /** 注入 CSRF 头（测试用）；默认走 \`withCsrf\`，与 studio 其它裸 fetch 一致。 */
  csrfHeaders?: (method: string) => Record<string, string>;
  /** 单次请求超时；超时按网络错误处理（可重试）。 */
  timeoutMs?: number;
  /** 读取 csrf cookie 的方法，仅供 beacon 兜底路径使用。 */
  csrfToken?: () => string;
}

function nonNegativeInteger(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

/** 从后端响应体里取 detail；字符串 detail 也保留，便于上报原始文案。 */
function draftErrorDetail(body: any): any {
  return body && typeof body === "object" ? body.detail : undefined;
}

/** HTTP 错误 → \`SaveRequestError\`；保留 detail.code / currentRevision / token。 */
function draftHttpError(status: number, body: any): SaveRequestError {
  const detail = draftErrorDetail(body);
  const message =
    (detail && typeof detail === "object" && typeof detail.message === "string" && detail.message) ||
    (typeof detail === "string" && detail) ||
    "请求失败（HTTP " + status + "）";
  return { status, detail, message };
}

/** 传输层失败（断网 / 超时 / 非 JSON）：不带 status，状态机会按可重试处理。 */
function draftTransportError(message: string): SaveRequestError {
  return { message };
}

function isRecord(value: any): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** 校验并归一化 GET / PUT 成功响应；缺字段时抛出可重试的传输错误。 */
function normalizeDraftPayload(body: any, fallbackScene: any = null): StudioDraftPayload {
  if (!isRecord(body)) throw draftTransportError("草稿响应不是 JSON 对象。");
  if (!("revision" in body)) throw draftTransportError("草稿响应缺少 revision。");
  const scene = "scene" in body ? body.scene : fallbackScene;
  if (scene !== null && scene !== undefined && !isRecord(scene))
    throw draftTransportError("草稿响应的 scene 不是对象。");
  const payload: StudioDraftPayload = {
    revision: nonNegativeInteger(body.revision),
    scene: scene ?? null,
  };
  if (typeof body.updatedAt === "string" || body.updatedAt === null) {
    payload.updatedAt = body.updatedAt;
  }
  return payload;
}

async function readJsonBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 建立真实 HTTP 传输。
 *
 * \`load()\` 用 GET（\`cache: "no-store"\`，避免浏览器把空草稿缓存住）；
 * \`put()\` 用 JSON body + CSRF 头；\`beacon()\` 走 fetch keepalive，
 * 让 pagehide 时的最后一笔保存在标签页销毁后仍能发出去。
 */
export function createStudioDraftRepository(
  options: StudioDraftRepositoryOptions = {},
): SaveTransport {
  const url = options.url || STUDIO3D_DRAFT_URL;
  const timeoutMs = options.timeoutMs ?? STUDIO3D_REQUEST_TIMEOUT_MS;
  const csrfHeaders = options.csrfHeaders || ((method: string) => withCsrf(undefined, method));
  const csrfToken = options.csrfToken || (() => "");
  const fetchImpl: typeof fetch =
    options.fetchImpl || ((input: any, init?: any) => globalThis.fetch(input, init));

  async function request(method: "GET" | "PUT", body?: any): Promise<SaveTransportResult> {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer =
      controller && timeoutMs > 0
        ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
        : null;
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...csrfHeaders(method),
      };
      const response = await fetchImpl(url, {
        method,
        cache: "no-store",
        credentials: "same-origin",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
      if (response.status === 204) return { ok: true, payload: { revision: 0, scene: null } };
      const parsed = await readJsonBody(response);
      if (!response.ok) return { ok: false, error: draftHttpError(response.status, parsed) };
      try {
        return { ok: true, payload: normalizeDraftPayload(parsed, body?.scene) };
      } catch (error: any) {
        return { ok: false, error: error?.message ? draftTransportError(String(error.message)) : draftTransportError("草稿响应无法解析。") };
      }
    } catch (error: any) {
      const reason =
        error && (error.name === "AbortError" || /abort/i.test(String(error.message || "")))
          ? "保存请求超时。"
          : String(error?.message || "网络请求失败。");
      return { ok: false, error: draftTransportError(reason) };
    } finally {
      if (timer !== null) globalThis.clearTimeout(timer);
    }
  }

  function putBody(requestBody: SaveTransportPutRequest): any {
    const body: any = { revision: nonNegativeInteger(requestBody.revision), scene: requestBody.scene };
    if (requestBody.interactionConfirmation) body.interactionConfirmation = requestBody.interactionConfirmation;
    return body;
  }

  return {
    load: () => request("GET"),
    put: (requestBody) => request("PUT", putBody(requestBody)),
    /** pagehide 尽力而为：keepalive fetch 成功排队即返回 true，结果不阻塞卸载。 */
    beacon: (requestBody) => {
      try {
        const body = JSON.stringify(putBody(requestBody));
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...csrfHeaders("PUT"),
        };
        if (!headers["X-CSRF-Token"]) {
          const token = csrfToken();
          if (token) headers["X-CSRF-Token"] = token;
        }
        const pending = fetchImpl(url, {
          method: "PUT",
          keepalive: true,
          credentials: "same-origin",
          headers,
          body,
        }) as Promise<any>;
        if (pending && typeof pending.catch === "function") pending.catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
  };
}
