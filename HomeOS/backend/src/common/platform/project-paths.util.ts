/**
 * 项目路径解析工具：统一处理静态资源目录、前端构建产物与授权文件路径。
 *
 * 所属模块：common/platform。
 * 职责：
 *   - 识别开发态（backend 与 frontend 并列于 monorepo 根）与生产态（backend cwd）布局；
 *   - 解析各可替换静态资源目录（平面图 / 图标 / 背景 / 房间图 / Logo / 音效），
 *     支持环境变量覆盖（Docker 挂载卷场景）；
 *   - 解析前端 SPA 构建产物目录与商业授权 JWT 文件路径；
 *   - 从数据库加载激活的 UI 配置方案布局 JSON。
 * 关键依赖：
 *   - ../../shared/app-config/service#AppConfigService：读取激活的 UI 配置方案
 *   - ../../shared/prisma/service#PrismaService：查询 ProjectConfig 布局
 *   - ../utils/json-field.util#readJsonObject：JSON 字段安全读取
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfigService } from '../../shared/app-config/service';
import type { PrismaService } from '../../shared/prisma/service';
import { readJsonObject } from '../utils/json-field.util';

/** 开发模式：backend 与 frontend 并列于 monorepo 根目录 */
function isDevMonorepoLayout(): boolean {
  return fs.existsSync(path.join(process.cwd(), '..', 'frontend'));
}

/** 解析项目根目录下的相对路径（开发态为 monorepo 根，生产态为 backend cwd） */
function projectRootDir(...segments: string[]): string {
  const base = isDevMonorepoLayout() ? path.join(process.cwd(), '..') : process.cwd();
  return path.join(base, ...segments);
}

/** 平面图目录（用户上传 SVG/PNG，对外 URL `/floorplans/...`） */
export function getFloorplansDir(): string {
  return process.env.FLOORPLANS_DIR || projectRootDir('assets', 'floorplans');
}

/**
 * 图标目录（自定义图标 SVG，对外 URL `/icons/...`）
 */
export function getIconsDir(): string {
  return process.env.ICONS_DIR || projectRootDir('assets', 'icons');
}

/** 仪表盘背景图目录（开灯/关灯氛围图等，对外 URL `/backgrounds/...`） */
export function getBackgroundsDir(): string {
  return process.env.BACKGROUNDS_DIR || projectRootDir('assets', 'backgrounds');
}

/** 竖屏房间背景图目录（对外 URL `/room_images/...`） */
export function getRoomImagesDir(): string {
  return process.env.ROOM_IMAGES_DIR || projectRootDir('assets', 'room_images');
}

/** 品牌 Logo 目录（对外 URL `/logo/...`，默认文件 logo.svg） */
export function getLogoDir(): string {
  return process.env.LOGO_DIR || projectRootDir('assets', 'logo');
}

/** 音效目录（门铃等，对外 URL `/sounds/...`） */
export function getSoundsDir(): string {
  return process.env.SOUNDS_DIR || projectRootDir('assets', 'sounds');
}

/** 商业授权目录（宿主机 ./license 挂载）；内放 license.jwt */
function getLicenseDir(): string {
  return process.env.LICENSE_DIR || projectRootDir('license');
}

/** 商业授权 JWT 文件路径；可用 LICENSE_FILE 覆盖 */
export function getLicenseJwtPath(): string {
  const explicit = process.env.LICENSE_FILE?.trim();
  if (explicit) return explicit;
  return path.join(getLicenseDir(), 'license.jwt');
}

/** 前端 SPA 构建产物目录（Vue 构建产物，由 ServeStaticModule 托管） */
export function getFrontendDistDir(): string {
  return projectRootDir('dist', 'frontend');
}

/** 服务端当前激活的 UI 配置方案（与前端 activeProfileId 同步） */
function resolveActiveProjectId(appConfig: AppConfigService): string {
  const profiles = appConfig.get('profiles') as { activeProfileId?: string } | undefined;
  const id = String(profiles?.activeProfileId || '').trim();
  return id || 'default';
}

/**
 * 从数据库加载指定方案的布局 JSON（ProjectConfig.layout）。
 * 记录不存在或字段非法时返回空对象，不抛错。
 *
 * @param prisma    PrismaService 实例
 * @param projectId UI 配置方案 ID
 * @returns 布局对象；无记录时返回 {}
 */
export async function loadProjectLayoutJson(
  prisma: PrismaService,
  projectId: string,
): Promise<Record<string, unknown>> {
  try {
    const row = await prisma.projectConfig.findUnique({ where: { projectId } });
    if (!row?.layout) return {};
    return readJsonObject(row.layout);
  } catch {
    return {};
  }
}

/**
 * 加载当前激活方案的布局（组合 resolveActiveProjectId + loadProjectLayoutJson）。
 *
 * @returns 激活方案 ID 与其布局对象
 */
export async function loadActiveProjectLayout(
  prisma: PrismaService,
  appConfig: AppConfigService,
): Promise<{ projectId: string; layout: Record<string, unknown> }> {
  const projectId = resolveActiveProjectId(appConfig);
  const layout = await loadProjectLayoutJson(prisma, projectId);
  return { projectId, layout };
}
