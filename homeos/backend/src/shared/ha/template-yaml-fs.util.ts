/**
 * @file template-yaml-fs.util.ts
 * @module shared/ha
 *
 * HA Template YAML 本地文件系统扫描与读写：
 *  - extractTemplateBlockFromConfigText(Fast) / extractTemplateFromLocalHaConfigDir
 *
 * 外部依赖：
 *  - fs/promises / path / fs.constants：文件系统读写
 *  - ../../common/http-security/path.util：路径安全校验（防止目录穿越）
 *  - ./template-yaml-blocks.util：块匹配与序列化
 *  - ./template-yaml-text.util：纯文本行级定位 / 增删
 *  - @homeos/shared：HA YAML 解析
 *
 * 安全约束：所有文件系统访问必须经 resolveConfigPath / resolveConfigEntryPath 校验，
 * 避免相对路径越界访问 HA 配置目录之外的文件。
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfigEntryPath, resolveConfigPath } from '../../common/http-security/path.util';
import { loadHaYaml, loadHaYamlObject } from '@homeos/shared';
import { findTemplateBlockByUniqueId, templateBlockToYaml } from './template-yaml-blocks.util';
import { extractTemplateBlockLinesFromText } from './template-yaml-text.util';

// 配置文件候选列表：按优先级依次尝试，覆盖 HA 主流配置组织方式
const CONFIG_FILE_CANDIDATES = [
  'configuration.yaml',
  'templates.yaml',
  'template.yaml',
  'template_sensors.yaml',
  'includes/templates.yaml',
  'includes/template.yaml',
];

// 扫描时跳过的目录：这些目录通常不含 template 配置，且数量大可能拖慢扫描
const TEMPLATE_SCAN_SKIP_DIRS = new Set([
  '.storage',
  '.cloud',
  'deps',
  'tts',
  'www',
  'image',
  'media',
  'blueprints',
  'node_modules',
]);

/**
 * 读取 YAML 文件并解析为对象（文件不存在或解析失败返回 null）。
 * @param filePath 文件绝对路径
 */
async function readYamlFileIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const parsed = loadHaYamlObject(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 合并目录下所有 YAML 文件的 template 段。
 *
 * @param dirPath 目录绝对路径
 * @returns 合并后的对象（template 段为数组）；目录不存在或无内容返回 null
 *
 * 用于处理 HA 的 !include_dir_merge_named 语义：将目录下所有 YAML 的 template 段合并为数组。
 */
async function mergeYamlDir(dirPath: string): Promise<Record<string, unknown> | null> {
  let names: string[];
  try {
    names = await fs.readdir(dirPath);
  } catch {
    return null;
  }
  const merged: Record<string, unknown> = {};
  const templates: unknown[] = [];
  for (const name of names) {
    if (!/\.ya?ml$/i.test(name)) continue;
    const parsed = await readYamlFileIfExists(path.join(dirPath, name));
    if (!parsed) continue;
    Object.assign(merged, parsed);
    const t = parsed.template;
    // template 段可能是数组或单对象，统一收集到 templates 数组
    if (Array.isArray(t)) templates.push(...t);
    else if (t && typeof t === 'object') templates.push(t);
  }
  if (templates.length) merged.template = templates;
  return Object.keys(merged).length ? merged : null;
}

/**
 * 解析 HA 的 !include / !include_dir 引用，递归读取被包含的文件或目录。
 *
 * @param value 配置值（字符串形式的开头为 !include 的引用）
 * @param configDir HA 配置目录（用于解析相对路径）
 * @returns 解析后的对象；非引用字符串原样返回；路径非法返回 null
 *
 * 支持：
 *  - !include_dir_merge_named <dir>：合并目录下所有 YAML
 *  - !include <file> / !include_dir <dir>：读取单个文件
 */
async function resolveIncludeRef(value: unknown, configDir: string): Promise<unknown> {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  // !include_dir_merge_named：合并目录下所有 YAML（named 合并语义）
  const dirNamed = trimmed.match(/^!include_dir_(?:merge_)?named\s+(.+)$/i);
  if (dirNamed) {
    const rel = dirNamed[1].trim().replace(/^['"]|['"]$/g, '');
    const dirPath = resolveConfigPath(configDir, rel);
    if (!dirPath) return null;
    return mergeYamlDir(dirPath);
  }
  // !include / !include_dir：读取单个文件
  const m = trimmed.match(/^!include(?:_dir)?\s+(.+)$/i);
  if (!m) return value;
  const rel = m[1].trim().replace(/^['"]|['"]$/g, '');
  const filePath = resolveConfigPath(configDir, rel);
  if (!filePath) return null;
  return readYamlFileIfExists(filePath);
}

/**
 * 收集配置目录下所有 template 根（含 !include 引用解析）。
 *
 * @param configDir HA 配置目录
 * @returns template 根对象数组
 *
 * 流程：
 *  1. 读取 configuration.yaml，若 template 为字符串则视为 !include 引用并解析
 *  2. 遍历 CONFIG_FILE_CANDIDATES，收集所有含 template 段的文件
 */
async function collectTemplateRoots(configDir: string): Promise<Record<string, unknown>[]> {
  const roots: Record<string, unknown>[] = [];

  const mainPath = resolveConfigPath(configDir, 'configuration.yaml');
  const main = mainPath ? await readYamlFileIfExists(mainPath) : null;
  if (main) {
    const templateRoot = main.template;
    // template 为字符串：HA 的 !include 引用语义，需递归解析
    if (typeof templateRoot === 'string') {
      const included = (await resolveIncludeRef(templateRoot, configDir)) as Record<
        string,
        unknown
      > | null;
      if (included) {
        roots.push({ template: included.template ?? included });
      }
    } else if (templateRoot) {
      roots.push({ template: templateRoot });
    }
  }

  // 遍历候选文件，收集所有含 template 段的文件
  for (const rel of CONFIG_FILE_CANDIDATES) {
    const filePath = resolveConfigPath(configDir, rel);
    if (!filePath) continue;
    const parsed = await readYamlFileIfExists(filePath);
    if (parsed?.template) roots.push({ template: parsed.template });
  }
  return roots;
}

/** 读取文本文件（不存在返回 null）。 */
async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * 递归扫描配置目录的 YAML 文件文本，定位含 unique_id 的 template 块。
 *
 * @param configDir 当前扫描目录
 * @param uniqueId 目标 unique_id
 * @param entityId 可选辅助匹配 entity_id
 * @param depth 当前递归深度（最大 4，防止过深扫描）
 * @returns 匹配的 template 块 YAML；未找到返回 null
 *
 * 先扫描当前目录的 YAML 文件，再递归子目录（跳过 TEMPLATE_SCAN_SKIP_DIRS 与隐藏目录）。
 */
async function scanConfigDirYamlText(
  configDir: string,
  uniqueId: string,
  entityId?: string,
  depth = 0,
): Promise<string | null> {
  // 深度限制：避免在深层嵌套目录中耗时过长
  if (depth > 4) return null;
  let names: string[];
  try {
    names = await fs.readdir(configDir);
  } catch {
    return null;
  }

  // 第一遍：扫描当前目录的 YAML 文件
  for (const name of names) {
    if (!/\.ya?ml$/i.test(name)) continue;
    const full = resolveConfigEntryPath(configDir, name);
    if (!full) continue;
    try {
      const st = await fs.stat(full);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    const hit = await extractTemplateBlockFromFileText(full, uniqueId, entityId);
    if (hit) return hit;
  }

  // 第二遍：递归子目录（跳过隐藏目录与已知无关目录）
  for (const name of names) {
    if (name.startsWith('.') || TEMPLATE_SCAN_SKIP_DIRS.has(name)) continue;
    const full = resolveConfigEntryPath(configDir, name);
    if (!full) continue;
    try {
      const st = await fs.stat(full);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    const hit = await scanConfigDirYamlText(full, uniqueId, entityId, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * 从单个 YAML 文件文本提取含 unique_id 的 template 块。
 *
 * @param filePath 文件绝对路径
 * @param uniqueId 目标 unique_id
 * @param _entityId 保留参数（当前未使用）
 * @returns template 块 YAML；未找到返回 null
 *
 * 流程：
 *  1. 行级截取 blockLines
 *  2. 包装为 template: 段后解析，用 findTemplateBlockByUniqueId 精确匹配
 *  3. 解析失败但 blockLines 含 trigger: 段时返回原文（保留 trigger 结构）
 *  4. 否则返回 null
 */
async function extractTemplateBlockFromFileText(
  filePath: string,
  uniqueId: string,
  _entityId?: string,
): Promise<string | null> {
  const text = await readTextFileIfExists(filePath);
  if (!text) return null;
  const blockLines = extractTemplateBlockLinesFromText(text, uniqueId);
  if (!blockLines?.length) return null;
  const wrapped = `template:\n${blockLines.join('\n')}`;
  try {
    const parsed = loadHaYaml(wrapped) as Record<string, unknown>;
    const block = findTemplateBlockByUniqueId(parsed, uniqueId);
    if (block) return templateBlockToYaml(block);
  } catch {
    /* 保留原文 */
  }
  // 解析失败但含 trigger 段：保留原文（trigger-based template 结构复杂，不宜丢弃）
  if (blockLines.some((l) => /^\s*trigger\s*:/.test(l))) return wrapped;
  return null;
}

/**
 * 快速扫描：主配置候选文件 + packages 目录（不递归全目录）。
 *
 * @param configDir HA 配置目录
 * @param uniqueId 目标 unique_id
 * @param entityId 可选辅助匹配 entity_id
 * @returns template 块 YAML；未找到返回 null
 *
 * 用于导入场景的快速路径，避免 SMB 挂载目录下递归扫描超时。
 */
export async function extractTemplateBlockFromConfigTextFast(
  configDir: string,
  uniqueId: string,
  entityId?: string,
): Promise<string | null> {
  // 优先扫描主配置候选文件
  for (const rel of CONFIG_FILE_CANDIDATES) {
    const filePath = resolveConfigPath(configDir, rel);
    if (!filePath) continue;
    const hit = await extractTemplateBlockFromFileText(filePath, uniqueId, entityId);
    if (hit) return hit;
  }
  // 扫描 packages 目录（HA 的 packages 集成常用组织方式）
  const pkgDir = resolveConfigPath(configDir, 'packages');
  if (pkgDir) {
    try {
      const names = await fs.readdir(pkgDir);
      for (const name of names) {
        if (!/\.ya?ml$/i.test(name)) continue;
        const pkgFile = resolveConfigEntryPath(pkgDir, name);
        if (!pkgFile) continue;
        const hit = await extractTemplateBlockFromFileText(pkgFile, uniqueId, entityId);
        if (hit) return hit;
      }
    } catch {
      /* packages 目录可选 */
    }
  }
  return null;
}

/**
 * 文本扫描：快速路径 + 递归全目录兜底。
 *
 * @param configDir HA 配置目录
 * @param uniqueId 目标 unique_id
 * @param entityId 可选辅助匹配 entity_id
 * @returns template 块 YAML；未找到返回 null
 *
 * 先用快速路径扫描主配置与 packages；未命中再递归扫描全目录（兜底）。
 */
async function extractTemplateBlockFromConfigText(
  configDir: string,
  uniqueId: string,
  entityId?: string,
): Promise<string | null> {
  const fast = await extractTemplateBlockFromConfigTextFast(configDir, uniqueId, entityId);
  if (fast) return fast;
  return scanConfigDirYamlText(configDir, uniqueId, entityId);
}
/**
 * 递归扫描配置目录的 YAML 文件（对象级解析），定位含 unique_id 的 template 块。
 *
 * 与 scanConfigDirYamlText 的区别：本函数走 YAML 对象级匹配（findTemplateBlockByUniqueId），
 * 而非文本行级匹配。用于文本匹配失败时的兜底。
 */
async function scanConfigDirYamlFiles(
  configDir: string,
  uniqueId: string,
  entityId?: string,
  depth = 0,
): Promise<string | null> {
  if (depth > 4) return null;
  let names: string[];
  try {
    names = await fs.readdir(configDir);
  } catch {
    return null;
  }

  for (const name of names) {
    if (!/\.ya?ml$/i.test(name)) continue;
    const full = resolveConfigEntryPath(configDir, name);
    if (!full) continue;
    try {
      const st = await fs.stat(full);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    const parsed = await readYamlFileIfExists(full);
    if (!parsed) continue;
    const block = findTemplateBlockByUniqueId(parsed, uniqueId, entityId);
    if (block) return templateBlockToYaml(block);
  }

  for (const name of names) {
    if (name.startsWith('.') || TEMPLATE_SCAN_SKIP_DIRS.has(name)) continue;
    const full = resolveConfigEntryPath(configDir, name);
    if (!full) continue;
    try {
      const st = await fs.stat(full);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    const hit = await scanConfigDirYamlFiles(full, uniqueId, entityId, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * 从本地 HA 配置目录（环境变量 HA_CONFIG_DIR）解析 template 块，支持 !include 与 trigger-based 结构。
 *
 * @param configDir HA 配置目录
 * @param uniqueId 目标 unique_id
 * @param entityId 可选辅助匹配 entity_id
 * @returns template 块 YAML；未找到返回 null
 *
 * 三级尝试：
 *  1. 文本扫描（extractTemplateBlockFromConfigText）：最快，保留注释与 trigger 结构
 *  2. 对象级扫描（collectTemplateRoots + findTemplateBlockByUniqueId）：解析 !include 引用
 *  3. 递归对象级扫描（scanConfigDirYamlFiles）：兜底
 */
export async function extractTemplateFromLocalHaConfigDir(
  configDir: string,
  uniqueId: string,
  entityId?: string,
): Promise<string | null> {
  const fromText = await extractTemplateBlockFromConfigText(configDir, uniqueId, entityId);
  if (fromText?.trim()) return fromText;

  const roots = await collectTemplateRoots(configDir);
  for (const root of roots) {
    const block = findTemplateBlockByUniqueId(root, uniqueId, entityId);
    if (block) return templateBlockToYaml(block);
  }
  return scanConfigDirYamlFiles(configDir, uniqueId, entityId);
}

