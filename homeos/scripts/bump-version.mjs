/**
 * 按北京时间生成 YYYY.MM.DD.HH，同步根/frontend/shared package.json 与 README 页眉版本。
 *
 * Python 后端版本经 ``backend/src/_version.py`` 回退读取仓库根 package.json，
 * 因此无需单独写入后端版本文件。
 */
import fs from 'node:fs'
import { absFromRoot, relFromRoot } from './lib/repo.mjs'

const chinaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
const yyyy = chinaTime.getFullYear()
const mm = String(chinaTime.getMonth() + 1).padStart(2, '0')
const dd = String(chinaTime.getDate()).padStart(2, '0')
const hh = String(chinaTime.getHours()).padStart(2, '0')
const newVersion = `${yyyy}.${mm}.${dd}.${hh}`
const releaseDate = `${yyyy}-${mm}-${dd}`

const PACKAGE_PATHS = [
  absFromRoot('package.json'),
  absFromRoot('frontend', 'package.json'),
  absFromRoot('packages', 'shared', 'package.json'),
]
const readmePath = absFromRoot('README.md')

function updatePackage(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`   ⏭ 跳过（不存在）: ${relFromRoot(filePath)}`)
    return
  }
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  pkg.version = newVersion
  fs.writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
  console.log(`   ✓ ${relFromRoot(filePath)}`)
}

function updateReadme(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`   ⏭ 跳过（不存在）: ${relFromRoot(filePath)}`)
    return
  }

  const before = fs.readFileSync(filePath, 'utf-8')
  let content = before
  let touched = false

  if (/当前版本：`\d{4}\.\d{2}\.\d{2}\.\d{2}`/.test(content)) {
    content = content.replace(
      /当前版本：`\d{4}\.\d{2}\.\d{2}\.\d{2}`/,
      `当前版本：\`${newVersion}\``,
    )
    touched = true
  }

  if (/ghcr\.io\/sfairy\/homeos:v\d{4}\.\d{2}\.\d{2}\.\d{2}/.test(content)) {
    content = content.replace(
      /ghcr\.io\/sfairy\/homeos:v\d{4}\.\d{2}\.\d{2}\.\d{2}/g,
      'ghcr.io/sfairy/homeos:latest',
    )
    touched = true
  }

  if (/HOMEOS_IMAGE=ghcr\.io\/sfairy\/homeos:v\d{4}\.\d{2}\.\d{2}\.\d{2}/.test(content)) {
    content = content.replace(
      /HOMEOS_IMAGE=ghcr\.io\/sfairy\/homeos:v\d{4}\.\d{2}\.\d{2}\.\d{2}/g,
      'HOMEOS_IMAGE=ghcr.io/sfairy/homeos:latest',
    )
    touched = true
  }

  if (!touched) {
    console.log(`   ⚠ 未找到 README 可更新内容: ${relFromRoot(filePath)}`)
    return
  }
  if (content === before) {
    console.log(`   ⏭ README 已是 ${newVersion}: ${relFromRoot(filePath)}`)
    return
  }
  fs.writeFileSync(filePath, content, 'utf-8')
  console.log(`   ✓ ${relFromRoot(filePath)}（页眉版本）`)
}

for (const pkgPath of PACKAGE_PATHS) updatePackage(pkgPath)

updateReadme(readmePath)
console.log(`✅ 版本号已更新：${newVersion}（${releaseDate}）`)
