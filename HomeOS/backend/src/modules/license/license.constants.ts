/**
 * 所属模块：backend/modules/license
 * 职责：
 *  - 许可证常量（公钥/算法/产品编码）；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { parseEnvBoolean } from '../../common/utils/parse-boolean.util';

/**
 * 商业授权常量（离线永久模型）
 *
 * 威胁模型：防误用与随手拷贝；不承诺防专业破解。无远程吊销。
 */

/** JWT iss */
export const LICENSE_ISSUER = 'HomeOS-Central';

/** Linux/Docker machine-id 指纹盐 */
export const LICENSE_HWID_SALT = 'HOMEOS_LICENSE_SALT_2026';

/** macOS IOPlatformUUID 指纹盐 */
export const LICENSE_HWID_SALT_MAC = 'HOMEOS_LICENSE_SALT_2026_MAC';

/** Windows MachineGuid 指纹盐 */
export const LICENSE_HWID_SALT_WIN = 'HOMEOS_LICENSE_SALT_2026_WIN';

/**
 * 构建内嵌验签公钥（须与卖家 HomeOS-Activate/keys/public.pem 一致）。
 * 可用 LICENSE_PUBLIC_KEY / LICENSE_PUBLIC_KEY_PATH 覆盖。
 * 指纹对照：sha256(PEM trim) 前 16 位 hex，当前为 4f97df748e22270a。
 */
export const DEFAULT_LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtNE7dAGmSmZawdLnHST3
iMdsM5MEildF4cfzk80b7ZB1afQXb8uGwckvlOkMS/9JFFUGAbL64QpkqFY4o2g6
E2W6eal0D+yutuDh6HQHkoXi0dlQLv5u8kplFy5yfvbvR5VfzasI2lmy5RyM8ZOQ
VXzXtMvlEfo/0veM8o9t3+/t9hH+4q3lKE7wuEt6S3FmX+BCYY0qS73OcLnt4dgn
+8ZjRGERgw8BvfxWL8XhrhIQXxr3Lfpci+PPJOzikLaY+olkNfBONrxBGbOa5Scu
rcBpRLvafl5roccirohadisItrAezd89LArhrWyE9CO+ypgChhgY+oWJnhAQ4nha
9QIDAQAB
-----END PUBLIC KEY-----`;

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
