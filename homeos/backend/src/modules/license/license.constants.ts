/**
 * 职责：
 *  - 授权常量（商店地址默认值、硬件指纹盐、门禁开关解析）。
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 授权采用联网租约模型（Ed25519 签名租约 + X25519 加密传输），不再是离线 RS256 JWT；
 *  - 对外方法遇非法输入显式抛出 Error / HttpException。
 */

import { parseEnvBoolean } from '../../common/utils/parse-boolean.util';

/**
 * 商业授权常量（联网租约模型）
 *
 * 威胁模型：防误用与随手拷贝；不承诺防专业破解。
 * 授权商店可吊销 / 解绑，客户端按租约续期。
 */

/** 授权商店默认地址（同机自测口径，生产由部署注入 APP_LICENSE_SERVER_URL）。 */
export const DEFAULT_LICENSE_SERVER_URL = 'http://127.0.0.1:8802';

/** Linux/Docker machine-id 指纹盐 */
export const LICENSE_HWID_SALT = 'HOMEOS_LICENSE_SALT_2026';

/** macOS IOPlatformUUID 指纹盐 */
export const LICENSE_HWID_SALT_MAC = 'HOMEOS_LICENSE_SALT_2026_MAC';

/** Windows MachineGuid 指纹盐 */
export const LICENSE_HWID_SALT_WIN = 'HOMEOS_LICENSE_SALT_2026_WIN';

/**
 * 是否启用商业授权门禁。
 * LICENSE_REQUIRED 显式 0/false/no/off → 关闭；1/true/yes/on → 开启；
 * 未设置时：production 默认开启，其它环境默认关闭。
 */
export function isLicenseRequiredFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicit = parseEnvBoolean(env.LICENSE_REQUIRED);
  if (explicit !== null) return explicit;
  return env.NODE_ENV === 'production';
}
