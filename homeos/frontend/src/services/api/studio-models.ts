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
import type { AxiosResponse } from 'axios'

import {
  DECORATION_MODELS_PATH,
  type DecorationLibraryState,
  type DecorationModel,
} from '@/studio/app/3d-studio/authoring/items/studio-user-decorations'

import { apiDelete, apiGet, apiPost } from './client'

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
