/**
 * 构建期资源版本（`build-rev`）的跨文件契约测试。
 *
 * 这套机制由三处**互不相识**的代码共同维持，任何一处改名都不会编译报错，只会安静地退化成
 * 「版本号写死在源码里」—— 那正是上游 0.8.1 缓存混用的成因：
 *
 * 1. `homeos/frontend/vite.config.ts` 写 `resource-version.json` + 替换 `sw.js` 的占位符；
 * 2. `homeos/frontend/public/sw.js` 提供占位符（没被替换时退化成固定缓存名）；
 * 3. `homeos/backend/src/platform/core/http/frontend_resources.py` 读同一个文件名、同一套 16 位十六进制。
 *
 * 所以这里断言的不是「实现怎么写」，而是「三处说的是同一件事」：文件名、占位符字面量、
 * revision 口径。真正跑一次构建的断言在 `03-migration-report.md` 的验收记录里。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL('../../../../' + relativePath, import.meta.url)), 'utf8')

const swSource = read('homeos/frontend/public/sw.js')
const viteConfig = read('homeos/frontend/vite.config.ts')
const backendSource = read('homeos/backend/src/platform/core/http/frontend_resources.py')
const shellHtml = read('homeos/frontend/index.html')

const TOKEN = '__HOMEOS_RESOURCE_REVISION__'
const MANIFEST = 'resource-version.json'

test('sw.js 里恰好有一个版本占位符，且与 vite.config.ts 用的是同一条字面量', () => {
  assert.equal(
    swSource.split(TOKEN).length - 1,
    1,
    '占位符必须出现且只出现一次：多写一处就会有一处没被替换，缓存名出现两种版本',
  )
  assert.ok(
    viteConfig.includes(`'${TOKEN}'`),
    'vite.config.ts 的 RESOURCE_VERSION_TOKEN 必须与 sw.js 的占位符逐字相同',
  )
})

test('sw.js 的缓存名由占位符拼出，不再手写版本号', () => {
  assert.match(swSource, /const CACHE_SHELL = `homeos-shell-\$\{BUILD_REVISION\}`/)
  assert.match(swSource, /const CACHE_STATIC = `homeos-static-\$\{BUILD_REVISION\}`/)
})

test('前后端对资源版本清单的文件名一致', () => {
  assert.ok(viteConfig.includes(`'${MANIFEST}'`))
  assert.ok(backendSource.includes(`"${MANIFEST}"`))
})

test('revision 口径一致：16 位小写十六进制', () => {
  assert.match(backendSource, /_REVISION_PATTERN = re\.compile\(r"\[0-9a-f\]\{16\}"\)/)
  assert.match(
    viteConfig,
    /digest\('hex'\)\.slice\(0, 16\)/,
    'vite 侧必须截到 16 位，否则后端校验会直接抛 ValueError',
  )
})

test('外壳 HTML 自身不带 ?v=，改写只发生在构建收尾', () => {
  assert.equal(
    /\?v=/.test(shellHtml),
    false,
    'index.html 里写死 ?v= 会与构建期替换叠加成两个 v 参数，等于制造缓存碎片',
  )
})

test('构建收尾按顺序：先算 revision，再写清单、改写外壳、替换 SW', () => {
  const writeBody = viteConfig.slice(viteConfig.indexOf('function writeResourceVersion'))
  const computeAt = writeBody.indexOf('computeResourceRevision()')
  const manifestAt = writeBody.indexOf('RESOURCE_VERSION_FILE')
  const stampAt = writeBody.indexOf('stampShellResourceUrls')
  const swAt = writeBody.indexOf('RESOURCE_VERSION_TOKEN')
  assert.ok(computeAt > 0 && manifestAt > computeAt, '必须先算 revision 再写清单')
  assert.ok(stampAt > computeAt, '外壳改写必须用同一份 revision')
  assert.ok(swAt > stampAt, 'SW 替换放在最后：它引用的是最终产物的版本')
})

test('只给稳定 URL 加 ?v=，内容哈希产物保持原样', () => {
  const stampBody = viteConfig.slice(
    viteConfig.indexOf('function stampShellResourceUrls'),
    viteConfig.indexOf('function writeResourceVersion'),
  )
  assert.ok(stampBody.includes("path.startsWith('/static/assets/')"))
  assert.ok(stampBody.includes("path.startsWith('/static/vendor/')"))
})
