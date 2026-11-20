/**
 * 统一的 API 错误文案（0.8.7）：把后端各类错误形状收敛成一句中文。
 *
 * 后端有**三种**错误形状同时存在，前端过去各页面各写一份判断，于是同一类失败在登录页、
 * 编辑器、3D 舞台上的文案互不一致：
 *
 * 1. Nest 信封：`{ statusCode, errorCode, message, detail?, traceId? }`
 * 2. 3D 原生 422：`{ detail: [{ loc, msg, type }] }`（Pydantic）
 * 3. 业务冲突：`{ detail: { code, message, currentRevision } }`
 *
 * 本模块只做「读一条最好的文案」，**不改**错误对象本身：调用方仍可读 `detail.code`。
 */

/** 字段名 → 中文（与后端 `FIELD_LABELS` 同源，未命中的回落到键名）。 */
const FIELD_LABELS: Record<string, string> = {
  username: '账号',
  password: '密码',
  passwordConfirmation: '确认密码',
  adminPassword: '管理员密码',
  activationCode: '激活码',
  backupPassword: '备份密码',
  pairingCode: '配对码',
  email: '邮箱',
  code: '验证码',
  name: '名称',
  entityId: '实体',
  projectId: '仪表盘',
  componentId: '控件',
  revision: '修订号',
  hours: '历史范围（小时）',
  document: '仪表盘配置',
  scene: '户型数据',
  properties: '属性',
  pages: '页面',
  components: '控件',
  data: '数据',
  service: '服务参数',
  baseUrl: 'HA服务地址',
  accessToken: 'HA访问令牌',
}

/** Pydantic 错误类型 → 中文原因（未命中的走兜底句）。 */
const VALIDATION_REASONS: Record<string, string> = {
  missing: '不能为空。',
  int_parsing: '需要填写整数。',
  int_type: '需要填写整数。',
  float_parsing: '需要填写有效数字。',
  float_type: '需要填写有效数字。',
  string_type: '需要填写文本。',
  string_too_short: '长度不足。',
  string_too_long: '长度超过限制。',
  literal_error: '不在允许的选项中。',
  extra_forbidden: '是不支持的字段。',
}

/** 区间类约束：[pydantic 键, 前置短语]。 */
const RANGE_REASONS: Array<[string, string]> = [
  ['ge', '需要大于或等于'],
  ['gt', '需要大于'],
  ['le', '需要小于或等于'],
  ['lt', '需要小于'],
  ['min_length', '长度至少为'],
  ['max_length', '长度最多为'],
]

const TIMEOUT_TEXT = '请求超时，请检查网络或稍后重试。'
const FALLBACK_TEXT = '请求未完成，请查看日志中的具体原因。'

type ValidationIssue = { loc?: unknown; msg?: unknown; type?: unknown; ctx?: Record<string, unknown> }

function fieldLabel(part: unknown): string {
  if (typeof part === 'number') return `第 ${part + 1} 项`
  const key = String(part ?? '')
  return FIELD_LABELS[key] ?? `字段（${key.slice(0, 30)}）`
}

function locLabel(loc: unknown): string {
  return Array.isArray(loc)
    ? loc
        .filter((part) => part !== 'body')
        .map(fieldLabel)
        .join(' › ')
    : ''
}

/** 区间类约束优先：`ge/gt/le/lt/min_length/max_length` 给出的上下限比类型文案更具体。 */
function rangeReason(ctx: Record<string, unknown>): string {
  for (const [key, prefix] of RANGE_REASONS) {
    const value = ctx[key]
    if (typeof value === 'number' && Number.isFinite(value)) return `${prefix} ${value}。`
  }
  return ''
}

function issueMessage(issue: ValidationIssue): string {
  const where = locLabel(issue.loc) || '请求参数'
  const raw = String(issue.msg ?? '')
  if (/[\u4e00-\u9fff]/.test(raw)) return `${where}${raw}`
  const range = rangeReason(issue.ctx ?? {})
  if (range) return where + range
  return where + (VALIDATION_REASONS[String(issue.type ?? '')] ?? '格式不正确，校验位置见日志详情。')
}

/** Pydantic 校验错误数组 → 一句中文（最多 4 条，其余归并为「另有 N 处」）。 */
export function validationErrorMessage(issues: unknown): string {
  if (!Array.isArray(issues)) return '请求参数未通过校验。'
  const shown = issues.slice(0, 4).filter((item): item is ValidationIssue => !!item && typeof item === 'object')
  const text = shown.map(issueMessage).join('；') || '请求参数未通过校验。'
  const extra = issues.length - shown.length
  return extra > 0 ? `${text}另有 ${extra} 处参数问题，见详情。` : text
}

/** `detail` 字段（字符串 / Pydantic 数组 / 业务冲突对象）→ 一句话。 */
function detailMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail.trim()
  if (Array.isArray(detail)) return validationErrorMessage(detail)
  if (!detail || typeof detail !== 'object') return ''
  const conflict = detail as Record<string, unknown>
  if (typeof conflict.message === 'string') return conflict.message.trim()
  if (typeof conflict.reason === 'string') return conflict.reason.trim()
  return Array.isArray(conflict.errors) ? validationErrorMessage(conflict.errors) : ''
}

/**
 * 从任意错误响应里取一条可展示的中文。
 *
 * @param payload 已解析的响应体（或 `null`）
 * @param fallback 兜底文案（默认「请求未完成，请查看日志中的具体原因。」）
 */
export function apiErrorMessage(payload: unknown, fallback: string = FALLBACK_TEXT): string {
  if (payload instanceof Error) {
    // 网络层失败（fetch 抛错 / AbortController 超时）走这里，避免各页面各写一份。
    return payload.name === 'TimeoutError' ? TIMEOUT_TEXT : payload.message || fallback
  }
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const detail = detailMessage(body.detail)
  if (detail) return detail
  return typeof body.message === 'string' && body.message.trim() ? body.message : fallback
}

/** 超时文案（供 fetch 包装层直接复用，避免各处硬编码）。 */
export const REQUEST_TIMEOUT_TEXT = TIMEOUT_TEXT
