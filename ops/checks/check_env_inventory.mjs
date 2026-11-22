#!/usr/bin/env node
/**
 * 环境变量一致性门禁：`.env.example` 与「代码真正读取的键」对账。
 *
 * 两个方向都会烂，但代价不同：
 * - **文档有、没人读**：模板越长越像说明书，读了就等于维护一份假契约（历史上
 *   `APP_HA_*`、`APP_LICENSE_KEY_ID`、整段 `STORE_WECHAT_*` 都已失效）。→ **失败**
 * - **代码读、文档没有**：新增开关默认不可发现，但其中大量是内部派生值（镜像路径、
 *   测试覆盖），逼着每加一个变量就写一条只会制造噪音。→ **警告**
 *
 * 因此本门禁只对「失效文档」扣红；未文档化的键列成提示，供人工决定是否补。
 *
 * 用法：
 *   node ops/checks/check_env_inventory.mjs            # 跑检查
 *   node ops/checks/check_env_inventory.mjs --verbose  # 同时打印「读但未文档化」
 */

import { readConsumedEnvKeys, readDocumentedEnvKeys } from '../lib/env-inventory.mjs'

const VERBOSE = process.argv.includes('--verbose')

/**
 * 允许出现在模板里、但运行时并不读取的键。
 *
 * 两类：构建 / 部署工具的参数（compose、Docker、release 脚本），以及只在
 * 注释里给示例值的镜像标签。它们的作用是「文档即配置样例」，删掉反而让人
 * 不知道 compose 里该改哪一行。新增条目必须写明消费方。
 */
const DEPLOY_ONLY = new Map([
  ['HOMEOS_VERSION', 'ops/release/set-version.mjs（版本真源同步）+ Dockerfile ARG'],
  ['HOMEOS_IMAGE', 'ops/release/set-version.mjs；compose image 行的钉版样例'],
  ['HOMEOS_STORE_IMAGE', 'ops/release/set-version.mjs；compose image 行的钉版样例'],
  ['HOMEOS_BASE_MIRROR', 'ops/build.py（本地构建的基础镜像镜像站）'],
  ['STORE_DOMAIN', 'docker-compose.yml 的 caddy-public 段'],
  ['ACME_EMAIL', 'docker-compose.yml 的 caddy-public 段'],
  ['HOMEOS_CADDY_ACCESS_LOG', 'compose 传给内置 Caddy'],
  ['STORE_PUBLISH_PORT', 'compose 宿主端口映射'],
  ['APP_PUBLISH_PORT', 'compose 宿主端口映射；运行期由 network_info 读取'],
  ['APP_PROXY_PUBLISH_PORT', 'compose 宿主端口映射；运行期由 network_info 读取'],
])

/** 代码读取但故意不写进模板的键：内部派生值、镜像内置值、测试专用。 */
const INTERNAL_READS = new Set([
  'HOMEOS_DATABASE_URL',
  'HOMEOS_SCHEMA_MODE',
  'STORE_SCHEMA_MODE',
  'STORE_SETUP_TOKEN',
  'STORE_STATIC_DIR',
  'STORE_SHELL_DIR',
  'STORE_PRODUCTS_CACHE_TTL_SECONDS',
  'STORE_DEVICE_RELEASE_COOLDOWN_SECONDS',
  'STORE_LICENSE_KEY_RETIREMENT_DAYS',
  'STORE_SMTP_MAX_ATTEMPTS',
  'STORE_SMTP_TIMEOUT_SECONDS',
  'STORE_SMTP_RETRY_BACKOFF_SECONDS',
  'STORE_VERIFICATION_COOLDOWN_SECONDS',
  'STORE_VERIFICATION_TTL_SECONDS',
  'APP_RUNTIME_ACCESS_CACHE_SECONDS',
  'AUTHENTICATED_BODY_LIMIT_BYTES',
  'PUBLIC_BODY_LIMIT_BYTES',
  'CORS_ORIGINS',
  'JWT_SECRET',
  'METRICS_TOKEN',
  'HA_BASE_URL',
])

const documented = readDocumentedEnvKeys()
const read = readConsumedEnvKeys()
const deadDocs = [...documented].filter((key) => !read.has(key) && !DEPLOY_ONLY.has(key)).sort()
const undocumented = [...read].filter((key) => !documented.has(key) && !INTERNAL_READS.has(key)).sort()

if (VERBOSE) {
  console.log(`check-env-inventory：读但未写入模板的键（${undocumented.length}）`)
  for (const key of undocumented) console.log(`  hint  ${key}`)
}

if (deadDocs.length) {
  console.error(`\n.env.example 中有 ${deadDocs.length} 个键没有任何读取方（失效文档）：`)
  for (const key of deadDocs) {
    const owner = DEPLOY_ONLY.get(key)
    console.error(`  FAIL  ${key}${owner ? `（部署专用，请登记到 DEPLOY_ONLY：${owner}）` : ''}`)
  }
  console.error('\n修法：删掉该行，或在 DEPLOY_ONLY 里登记「谁在消费它」。')
  process.exit(1)
}

console.log(`check-env-inventory：模板 ${documented.size} 个键，全部有消费方（或已登记为部署专用）。`)
