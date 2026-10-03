/**
 * 所属模块：backend/shared/app-config
 * 职责：
 *  - 配置分层合并解析管线；
 * 关键依赖：
 *  - validate/* 系列 zod schemas；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 配置优先级集中解析。
 *
 * HomeOS 存在双轨配置来源：`.env`（基础设施）与 `AppConfigService`（DB 持久化业务配置）。
 * 为避免各处散落各自实现的「先读哪个」，此处统一约定优先级：
 *
 *   AppConfig（DB，可运行时修改） > 环境变量（部署期） > 代码默认值
 *
 * 需要不同优先级（如强制 env 覆盖）时应显式说明，不要在业务代码里内联 parseInt 逻辑。
 */

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 解析一个「正整数」配置项，按 AppConfig > env > default 优先级返回。
 * @param fromConfig AppConfig 中的值（<=0 或非数字视为未设置）
 * @param envKeys    候选环境变量名（按顺序取第一个有效的正整数）
 * @param fallback   兜底默认值
 */
export function resolvePositiveInt(
  fromConfig: number | undefined | null,
  envKeys: string[],
  fallback: number,
): number {
  if (typeof fromConfig === 'number' && fromConfig > 0) return fromConfig;
  for (const key of envKeys) {
    const fromEnv = parsePositiveInt(process.env[key]);
    if (fromEnv !== null) return fromEnv;
  }
  return fallback;
}
