/** 环境变量读取点扫描：门禁（`ops/checks/contract/check_env_inventory.mjs`）与审计报告共用。
 *
 * 为什么单点：这段正则此前有两份（门禁一份、审计脚本一份），各自漏掉不同的取值写法 ——
 * `_port("APP_PUBLISH_PORT", …)`、`environment.get("APP_CLIENT_KEYS_FETCH")`、
 * `STATUS_DEDUPE_ENV_VAR = "STORE_LOG_…"` 都曾只被其中一份认出来，于是同一份
 * `.env.example` 在两个工具里得出不同结论。差异必须写在调用点上，而不是藏在副本里。
 */
import fs from 'node:fs'
import path from 'node:path'

import { REPO_ROOT } from './repo.mjs'
import { walkFiles } from './walk.mjs'

/** 取值帮助函数 / 直接环境查询的写法。 */
export const ENV_READER_PATTERNS = [
  /\bos\.getenv\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /\bos\.environ\.get\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /\bos\.environ\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /\benvironment\.get\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /\b_environment_[a-z_]+\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /\b_?(?:env|environment|setting|read|get)_[a-z_]*\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  // `_port("APP_PUBLISH_PORT", ...)` 这类直接以用途命名的取值帮手。
  /\b[a-z_]*port[a-z_]*\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /\bprocess\.env\.([A-Z][A-Z0-9_]{2,})/g,
  /\bprocess\.env\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]/g,
  // 以模块常量间接引用（`STATUS_DEDUPE_ENV_VAR = "STORE_LOG_..."`）：常量名要带 ENV/VAR，
  // 否则状态机里的 `STATUS = "PAUSE"` 也会被当成环境变量。
  /^[A-Z][A-Z0-9_]*(?:ENV|VAR)[A-Z0-9_]*\s*=\s*['"]([A-Z][A-Z0-9_]{2,})['"]/gm,
]

/** 形如 `RSA2` 的算法名、HTTP 方法名会被通用规则误收。 */
const NOT_ENV = new Set(['RSA2', 'SHA256', 'GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'CNY', 'UTF8'])

/** `.env.example` 里出现的全部键（含被注释掉的模板行）。 */
export function readDocumentedEnvKeys(envExample = path.join(REPO_ROOT, '.env.example')) {
  const text = fs.readFileSync(envExample, 'utf8')
  const keys = new Set()
  for (const match of text.matchAll(/^#?\s*([A-Z][A-Z0-9_]{2,})\s*=/gm)) keys.add(match[1])
  return keys
}

/** 代码与部署层真正读取的键。 */
export function readConsumedEnvKeys() {
  const roots = [
    path.join(REPO_ROOT, 'homeos', 'backend', 'src'),
    path.join(REPO_ROOT, 'homeos-store', 'backend', 'src'),
    path.join(REPO_ROOT, 'ops'),
  ]
  const skip = new Set(['node_modules', 'dist', 'build', '.git', '__pycache__', 'cleanup-reports'])
  const extensions = new Set(['.py', '.mjs', '.js', '.mts', '.ts'])
  const keys = new Set()

  for (const root of roots) {
    for (const file of walkFiles(root, { extensions, skipDirs: skip })) {
      const text = fs.readFileSync(file, 'utf8')
      for (const pattern of ENV_READER_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
          if (!NOT_ENV.has(match[1])) keys.add(match[1])
        }
      }
    }
  }

  // compose 的 `${VAR:-默认}` 插值与 `VAR:` 环境键同样算「有消费方」：模板里给
  // macOS / Docker Desktop 的那组 `HOMEOS_MACHINE_ID_PATH` 就是只被 compose 读的。
  for (const name of ['docker-compose.yml', 'docker-compose.app.yml']) {
    const file = path.join(REPO_ROOT, name)
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\$\{([A-Z][A-Z0-9_]{2,})/g)) keys.add(match[1])
    for (const match of text.matchAll(/^\s+([A-Z][A-Z0-9_]{2,})\s*:/gm)) keys.add(match[1])
  }
  return keys
}
