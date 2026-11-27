import { type AxiosResponse } from 'axios'
import { apiPost, apiPut, apiDelete, apiGet } from '../../kernel/http/index'
import { type LightRangeArchiveStore, type LightRegionOverrideStore } from '@/studio/authoring/plan/studio'
import { DECORATION_MODELS_PATH, type DecorationLibraryState, type DecorationModel } from '@/studio/authoring/items/studio-user-decorations'

/**
 * 3D 户型相关的 0.8.9 增量接口：**柔光范围局部保存** 与 **配置只读诊断**。
 *
 * 两者共用一个文件，是因为它们解决同一个问题：绘制页与 3D 控件之间那份「配置」需要
 * 能被**单独**读写，而不是每次都整份草稿来回搬。
 *
 * - `PUT /studio3d/light-ranges`（相对 `baseURL`，不要自己再加 `/api/v1`）：只提交受影响的场景，服务端合进草稿后走同一条保存链路
 *   （revision 乐观并发、校验、级联清理都复用），因此这里的 `revision` 必须带对；
 * - `POST /modules/interaction3d/config-diagnostics`：只读，**永不拒绝**，固定返回
 *   `{valid, findings}`，让编辑器把失败项逐条列出来。
 *
 * 失败一律由 4xx 表达（错误码见 `@/shared/constants/api-error-codes`）。
 */

/** 柔光范围局部保存的请求体。 */
export type StudioLightRangesUpdate = {
  /** 当前草稿 revision（不匹配 → 409）。 */
  revision: number
  /** 要更新的场景（`changes` 为 `null` 表示清空该场景）。 */
  sceneId: string
  changes: Record<string, unknown> | null
  /** 可选的撤销记录追加（与 changes 一起提交，省一次往返）。 */
  archive?: unknown[]
}

/** 柔光范围局部保存的响应。 */
export type StudioLightRangesResult = {
  revision: number
  lightRegionOverrides: LightRegionOverrideStore
  lightRangeArchive: LightRangeArchiveStore
}

/**
 * 只保存柔光范围（不重传整份户型）。
 *
 * 返回 `AxiosResponse` 而不是解包后的 body：与其它服务（`device-profiles` 等）保持同一口径，
 * 调用方按需取 `.data` —— 有些地方要在拦截器里读响应头。
 */
export function saveLightRanges(payload: StudioLightRangesUpdate): Promise<AxiosResponse<StudioLightRangesResult>> {
  return apiPut<StudioLightRangesResult>('/studio3d/light-ranges', payload)
}

/** 一条配置诊断结论（`scope` 是分区名，`reason` 可直接展示）。 */
export type ConfigDiagnosticFinding = {
  scope: string
  reason: string
}

/** 配置诊断结果。 */
export type ConfigDiagnosticResult = {
  valid: boolean
  findings: ConfigDiagnosticFinding[]
}

/**
 * 只读检查一份 3D 控件配置。
 *
 * 调用方拿到的永远是 200（除非未授权）：`valid: false` 时把 `findings` 逐条列给用户，
 * 而不是抛错 —— 这正是「检查失效配置」与「保存失败」的区别。
 */
export function diagnoseInteractionConfig(
  properties: Record<string, unknown>,
): Promise<AxiosResponse<ConfigDiagnosticResult>> {
  return apiPost<ConfigDiagnosticResult>('/api/v1/modules/interaction3d/config-diagnostics', { properties })
}

/**
 * 把一张导出图转成 WebP（Safari 兜底）。
 *
 * Safari 的 `canvas.toBlob('image/webp')` 会**静默回退成 PNG**，所以前端探测到
 * 「拿不到 WebP」时把 PNG 交给服务端转一次。
 *
 * 走 `apiPost` + `responseType: 'blob'`（而不是裸 fetch）：这样 CSRF 头、鉴权失效
 * 跳转、超时与错误信封全部复用统一 HTTP 栈。
 */
export async function convertExportImageToWebp(png: Blob): Promise<Blob> {
  const response = await apiPost<Blob>('/studio3d/exports/webp-fallback', png, {
    responseType: 'blob',
    headers: { 'content-type': png.type || 'image/png' },
  })
  return response.data
}

/**
 * 装饰模型库（0.8.9「我的装饰」）的接口客户端。
 *
 * 与 `studio-interaction.ts` 分开：那一份是**柔光/诊断**这类配置增量，这一份是**文件库**
 * （上传 / 列出 / 删除 GLB）。两者的失败语义也不同 —— 库的失败要能逐条告诉用户
 * 「太大 / 不是 GLB / 数量满了」，因此错误码由 `decorationErrorMessage` 统一分派。
 *
 * 上传走**裸字节**而不是 `multipart/form-data`：后端按流累计字节数，超限立刻 413，
 * 不必等整包落地；名字走 `x-model-name`（URL 编码，避免中文文件名在头里出问题）。
 *
 * 路径**不带** `/api/v1`：`client.ts` 的 `baseURL` 已经是它，再写一遍会变成
 * `/api/v1/api/v1/...`，服务端直接 404（症状是「请求的资源不存在」）。
 */



/** 列出库里的全部模型（带上限，前端据此禁用上传按钮并提示额度）。 */
export function listStudioModels(): Promise<AxiosResponse<DecorationLibraryState>> {
  return apiGet<DecorationLibraryState>(DECORATION_MODELS_PATH)
}

/**
 * 上传一件 GLB。
 *
 * `modelName` 只做**展示名**：后端会净化（去控制字符、压空白、截断、空名回落「我的装饰」），
 * 因此这里不做重名检查 —— 重名是允许的，assetId 才是身份。
 */
export function uploadStudioModel(modelName: string, payload: Blob): Promise<AxiosResponse<DecorationModel>> {
  return apiPost<DecorationModel>(DECORATION_MODELS_PATH, payload, {
    headers: {
      'Content-Type': 'model/gltf-binary',
      'x-model-name': encodeURIComponent(modelName),
    },
    // 上传不参与 5xx 重试：重试会重复落盘，且用户看不到「正在重试」。
    _idempotent: false,
    timeout: 120_000,
  })
}

/** 删除一件模型（`204`，重复删除返回 404）。 */
export function deleteStudioModel(assetId: string): Promise<AxiosResponse<void>> {
  return apiDelete<void>(`${DECORATION_MODELS_PATH}/${encodeURIComponent(assetId)}`)
}
