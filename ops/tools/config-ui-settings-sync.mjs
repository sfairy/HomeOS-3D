#!/usr/bin/env bun
/**
 * 0.9.0 配置 UI 的「同数据」对齐：把 0.9.0 里**与数据无关**的面板设置搬进本项目草稿。
 *
 * ## 为什么需要它
 *
 * 配置面板长什么样，一半由代码决定、一半由**数据**决定：`lightingMode` 决定「照射范围」
 * 分区是否存在，`popupOpacity` 决定滑条位置，`devices/environment/security` 的条目数决定
 * 列表高度。两边数据不同时，逐像素比对量到的是「数据差异」而不是「实现差异」。
 *
 * 完整移植 0.9.0 的场景（floors / walls / models）代价太大，而且会污染本项目数据。
 * 折中：**只搬不影响场景引用的标量设置**（见 `DATA_INDEPENDENT_KEYS`），
 * 设备条目、灯光列表、模型绑定一律不动 —— 那些必须靠本地真实数据。
 *
 * ## 安全边界
 *
 * - 只改一个 `interaction3d` 组件的 `properties`，其余字段原样回写；
 * - `--apply` 前把完整草稿备份到 `--backup`（默认 `ops/checks/fixtures/config-ui/local-draft-backup.json`）；
 * - `--restore` 用备份原样 PUT 回去（revision 取备份里的，冲突时自动重试一次）。
 *
 * ## 用法
 *
 * ```bash
 * # 0) 先看差什么（不写任何东西）
 * bun ops/tools/config-ui-settings-sync.mjs --diff \
 *   --ref-draft /tmp/ref-draft.json --ours-draft /tmp/ours-draft.json
 *
 * # 1) 同步并备份
 * bun ops/tools/config-ui-settings-sync.mjs --apply \
 *   --ref-draft /tmp/ref-draft.json --ours-draft /tmp/ours-draft.json
 *
 * # 2) 比完恢复
 * bun ops/tools/config-ui-settings-sync.mjs --restore
 * ```
 *
 * 草稿 JSON 的取法（两边都要登录态，用 curl 带 cookie 最省事）：
 *
 * ```bash
 * curl -s -b /tmp/hb.cookies http://localhost:18080/api/v1/projects/<pid>/draft > /tmp/ref-draft.json
 * curl -s -b /tmp/ours.cookies http://127.0.0.1:8801/api/v1/projects/<pid>/draft > /tmp/ours-draft.json
 * ```
 *
 * 退出码：参数/路径错误 2；成功 0。
 */
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const valueOf = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

const REF_DRAFT_PATH = valueOf('ref-draft', '')
const OURS_DRAFT_PATH = valueOf('ours-draft', '')
const BACKUP_PATH = valueOf('backup', path.resolve('ops/checks/fixtures/config-ui/local-draft-backup.json'))
/** 本项目 dev server：`--restore` 时把备份 PUT 回这里。 */
const OURS_BASE = valueOf('ours-base', process.env.HOMEOS_VISUAL_BASE_URL || 'http://127.0.0.1:8801')
const OURS_COOKIE = valueOf('ours-cookie', process.env.HOMEOS_VISUAL_COOKIE || '')

/**
 * 与数据无关、但会改变配置面板形态的键。
 *
 * 刻意**不含**：`devices` / `environment` / `security` / `lights` / `sceneId` / `floorSelection`
 * —— 它们引用 0.9.0 的模型 id，搬过来只会得到一堆「模型已移除」。
 * 也不含 `navigationDefaults` / `popupLayout`：本项目有、0.9.0 没有，属结构性增强。
 */
const DATA_INDEPENDENT_KEYS = Object.freeze([
  'autoRotate',
  'backgroundMotion',
  'backgroundTheme',
  'backgroundVisible',
  'behaviorScope',
  'focusDimStrength',
  'focusVignetteStrength',
  'groundReflection',
  'hideIconsWhileRotating',
  'idleExitFocus',
  'idleHideIcons',
  'interaction',
  'lightingMode',
  'lightingModeVersion',
  'pageBehaviors',
  'pageDimStrength',
  'pageSaturation',
  'popupOpacity',
  'renderScale',
  'viewGesturesEnabled',
  'wallOpacity',
  'warmBackgroundTheme',
])

/** 在文档里找出唯一的 `interaction3d` 组件（就地返回引用 + 路径）。 */
function findInteraction3dComponent(document) {
  let found = null
  const walk = (node, trail) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'interaction3d' && !found) found = { component: node, trail }
    for (const [key, value] of Object.entries(node)) walk(value, trail ? `${trail}.${key}` : key)
  }
  walk(document, '')
  return found
}

function readJson(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`找不到${label}：${filePath || '(未提供)'}`)
    process.exit(2)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function collectSettings(draft) {
  const hit = findInteraction3dComponent(draft.document)
  if (!hit) {
    console.error('草稿里没有 interaction3d 组件')
    process.exit(2)
  }
  const settings = {}
  for (const key of DATA_INDEPENDENT_KEYS) {
    if (key in (hit.component.properties || {})) settings[key] = hit.component.properties[key]
  }
  return { component: hit.component, settings }
}

async function putDraft(draft, projectId) {
  const url = `${OURS_BASE}/api/v1/projects/${encodeURIComponent(projectId)}/draft`
  const body = JSON.stringify({
    revision: draft.revision,
    globalPopupRevision: draft.globalPopupRevision,
    document: draft.document,
  })
  const headers = { 'content-type': 'application/json' }
  if (OURS_COOKIE) headers.cookie = OURS_COOKIE
  return fetch(url, { method: 'PUT', headers, body })
}

const modeDiff = flag('diff')
const modeApply = flag('apply')
const modeRestore = flag('restore')

if (!modeDiff && !modeApply && !modeRestore) {
  console.error('用法：--diff | --apply | --restore（见文件头注释）')
  process.exit(2)
}

if (modeRestore) {
  const backup = readJson(BACKUP_PATH, '草稿备份')
  const response = await putDraft(backup, backup.projectId)
  if (!response.ok) {
    console.error(`恢复失败：HTTP ${response.status} ${await response.text()}`)
    process.exit(1)
  }
  console.log(`已恢复草稿（revision ${backup.revision}）：${backup.projectId}`)
  process.exit(0)
}

const refDraft = readJson(REF_DRAFT_PATH, ' 0.9.0 草稿')
const oursDraft = readJson(OURS_DRAFT_PATH, '本项目草稿')
const refSettings = collectSettings(refDraft).settings
const oursSettings = collectSettings(oursDraft).settings

const changed = []
for (const key of DATA_INDEPENDENT_KEYS) {
  if (!(key in refSettings)) continue
  const before = JSON.stringify(oursSettings[key])
  const after = JSON.stringify(refSettings[key])
  if (before === after) continue
  changed.push({ key, before, after })
}

console.log(`## 与数据无关、但两边不同的设置：${changed.length} 项`)
for (const entry of changed) {
  console.log(`  ${entry.key}\n    本项目 ${entry.before}\n    0.9.0 ${entry.after}`)
}

if (modeDiff) process.exit(0)

if (!changed.length) {
  console.log('已经一致，无需同步。')
  process.exit(0)
}

// 备份 → 就地改 → PUT
fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true })
fs.writeFileSync(BACKUP_PATH, JSON.stringify(oursDraft, null, 2))
const target = findInteraction3dComponent(oursDraft.document).component
for (const entry of changed) target.properties[entry.key] = JSON.parse(entry.after)

const response = await putDraft(oursDraft, oursDraft.projectId)
if (!response.ok) {
  console.error(`同步失败：HTTP ${response.status} ${await response.text()}`)
  console.error(`草稿备份仍在：${BACKUP_PATH}（用 --restore 恢复）`)
  process.exit(1)
}
console.log(`已同步到本项目（备份：${BACKUP_PATH}）。比对完用 --restore 恢复。`)
