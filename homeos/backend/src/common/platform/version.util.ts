/**
 * 应用版本号加载工具
 *
 * 文件职责：
 * - 从 package.json 或 version.js 加载应用版本号，供健康检查与日志输出使用
 * - 兼容开发态（backend/package.json）与生产态（构建产物 version.js）两种布局
 *
 * 关键依赖：node:fs / node:path
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 从 package.json / version.js 加载应用版本号（backend 共用）
 *
 * 查找顺序：
 * 1. `${cwd}/package.json`（开发态：backend/package.json）
 * 2. `${cwd}/../package.json`（生产态：monorepo 根 package.json）
 * 3. `${cwd}/version.js` 中形如 `CURRENT_VERSION: 'x.y.z'` 的字面量
 *
 * @param cwd - 查找起始目录，默认 process.cwd()
 * @returns 版本号字符串；全部查找失败时返回 'unknown'
 */
export function loadAppVersion(cwd = process.cwd()): string {
  // 优先尝试 package.json：开发态与本目录、生产态与上级目录均覆盖
  for (const rel of ['package.json', '../package.json']) {
    try {
      const pkgPath = path.join(cwd, rel);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      /* 读取失败：尝试下一个候选位置 */
    }
  }
  // 兜底：从 version.js 提取 CURRENT_VERSION 字面量
  try {
    const versionPath = path.join(cwd, 'version.js');
    if (fs.existsSync(versionPath)) {
      const content = fs.readFileSync(versionPath, 'utf-8');
      // 匹配形如 CURRENT_VERSION: '1.2.3' 的赋值；不使用 eval 以避免副作用
      const match = content.match(/CURRENT_VERSION:\s*'([^']+)'/);
      if (match?.[1]) return match[1];
    }
  } catch {
    /* 忽略版本读取错误，回退到 unknown */
  }
  return 'unknown';
}