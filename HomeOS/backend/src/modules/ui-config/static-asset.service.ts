/**
 * 所属模块：backend/modules/ui-config
 * 职责：
 *  - 静态资源服务（上传+CDN URL）；
 * 关键依赖：
 *  - multer、AppConfigService；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { badRequest } from '../../common/utils/business-exception';
import { publicAssetUrl } from '../../common/utils/public-url.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { sanitizeUploadedSvg } from '../../common/http-security/path.util';
import {
  getBackgroundsDir,
  getFloorplansDir,
  getIconsDir,
  getRoomImagesDir,
} from '../../common/platform/project-paths.util';
import * as fs from 'fs';
import * as path from 'path';

/** 平面图资源根目录 */
const FLOORPLANS_DIR = getFloorplansDir();
/** 背景图资源根目录 */
const BACKGROUNDS_DIR = getBackgroundsDir();
/** 图标资源根目录 */
const ICONS_DIR = getIconsDir();
/** 竖屏房间背景图资源根目录 */
const ROOM_IMAGES_DIR = getRoomImagesDir();

/** 允许上传的平面图 / 背景图 / 房间图文件扩展名 */
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

/** 拼接平面图公开访问 URL（将反斜杠转为正斜杠） */
const floorplanPublicUrl = (...segments: string[]) => publicAssetUrl('floorplans', ...segments);

/** 拼接背景图公开访问 URL */
const backgroundPublicUrl = (...segments: string[]) => publicAssetUrl('backgrounds', ...segments);

/** 拼接图标公开访问 URL */
const iconPublicUrl = (...segments: string[]) => publicAssetUrl('icons', ...segments);

/** 拼接房间图公开访问 URL */
const roomImagePublicUrl = (...segments: string[]) => publicAssetUrl('room_images', ...segments);

/** 在根目录下解析安全路径（防止目录穿越） */
function resolveSafePath(rootDir: string, subPath: string = '') {
  const root = path.resolve(rootDir);
  const target = path.resolve(path.join(root, subPath));
  // 使用 path.relative 防止同前缀目录绕过（如根 /data/floorplans 被 /data/floorplans-evil 伪造）；
  // relative === '' 表示 target === root（根目录本身），同样拒绝以防递归删除根目录。
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || relative === '') {
    badRequest(API_ERROR.UI_CONFIG_PATH_TRAVERSAL);
  }
  return target;
}

/** 列出图片资源目录下的文件与子目录（平面图 / 背景图 / 房间图共用） */
function listImageAssets(
  rootDir: string,
  publicUrl: (...segments: string[]) => string,
  subPath: string,
  logLabel: string,
  logger: Logger,
) {
  try {
    // subPath 为空时直接使用根目录（resolveSafePath 会拒绝根目录本身）
    const targetDir = subPath ? resolveSafePath(rootDir, subPath) : path.resolve(rootDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
    }
    const items = fs.readdirSync(targetDir, { withFileTypes: true });
    const mapped = items
      .filter(
        (item) => item.isDirectory() || ALLOWED_EXTS.has(path.extname(item.name).toLowerCase()),
      )
      .map((item) => {
        const fullPath = path.join(targetDir, item.name);
        const stat = fs.statSync(fullPath);
        if (item.isDirectory()) return { name: item.name, type: 'dir' as const };
        return {
          name: item.name,
          type: 'file' as const,
          url: publicUrl(subPath, item.name),
          size: stat.size,
        };
      });
    return mapped.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  } catch (e: unknown) {
    logger.error(
      `列出${logLabel}失败,路径 "${subPath}":${getErrorMessage(e)}`,
    );
    return [];
  }
}

/**
 * 在图片资源根目录下创建子目录。
 * subPath 为空时使用根目录（会被 resolveSafePath 拒绝），已存在则抛 BadRequest。
 */
function createImageDirectory(rootDir: string, subPath: string, logLabel: string, logger: Logger) {
  // subPath 为空时直接使用根目录（resolveSafePath 会拒绝根目录本身）
  const targetDir = subPath ? resolveSafePath(rootDir, subPath) : path.resolve(rootDir);
  if (fs.existsSync(targetDir)) {
    badRequest(API_ERROR.UI_CONFIG_DIR_EXISTS);
  }
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
  logger.log(`${logLabel}目录已创建:${subPath}`);
  return { success: true, path: subPath };
}

/**
 * 保存上传的图片文件到指定资源根目录。
 * 校验扩展名白名单（ALLOWED_EXTS），用 path.basename 防止路径穿越，
 * 自动创建缺失的子目录，写入后返回公开访问 URL。
 */
async function saveImageAsset(
  rootDir: string,
  publicUrl: (...segments: string[]) => string,
  filename: string,
  buffer: Buffer,
  subPath: string,
  logLabel: string,
  logger: Logger,
) {
  // subPath 为空时直接使用根目录（resolveSafePath 会拒绝根目录本身）
  const targetDir = subPath ? resolveSafePath(rootDir, subPath) : path.resolve(rootDir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
  }
  const safeName = path.basename(filename);
  const ext = path.extname(safeName).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    badRequest(API_ERROR.UI_CONFIG_FILE_TYPE_DENIED(ext));
  }
  const dest = path.join(targetDir, safeName);
  await fs.promises.writeFile(dest, buffer, { mode: 0o644 });
  logger.log(`${logLabel}已保存到 ${subPath}:${safeName}(${buffer.length} 字节)`);
  return { name: safeName, url: publicUrl(subPath, safeName) };
}

/**
 * 删除资源文件或目录（支持递归删除目录）。
 * 经 resolveSafePath 校验防止目录穿越，不存在则抛 BadRequest。
 */
function deleteImageAsset(rootDir: string, fullPath: string, logLabel: string, logger: Logger) {
  const target = resolveSafePath(rootDir, fullPath);
  if (!fs.existsSync(target)) {
    badRequest(API_ERROR.UI_CONFIG_FILE_NOT_FOUND);
  }
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true });
    logger.log(`${logLabel}目录已删除:${fullPath}`);
  } else {
    fs.unlinkSync(target);
    logger.log(`${logLabel}已删除:${fullPath}`);
  }
}

/**
 * UI 配置静态资源服务（@Injectable）。
 *
 * 管理平面图 / 背景图 / 房间图 / 图标四类静态资源的文件系统操作，
 * 所有路径操作经 resolveSafePath 防止目录穿越。
 * 由 UiConfigService 委托调用，本身不直接暴露为 REST 端点。
 */
@Injectable()
export class UiConfigStaticAssetService implements OnModuleInit {
  private readonly logger = new Logger(UiConfigStaticAssetService.name);

  onModuleInit() {
    this.logger.log(`平面图资源目录:${FLOORPLANS_DIR}`);
    if (!fs.existsSync(FLOORPLANS_DIR)) {
      this.logger.log(`正在创建资源目录:${FLOORPLANS_DIR}`);
      fs.mkdirSync(FLOORPLANS_DIR, { recursive: true, mode: 0o755 });
    }
    this.logger.log(`背景图资源目录:${BACKGROUNDS_DIR}`);
    if (!fs.existsSync(BACKGROUNDS_DIR)) {
      this.logger.log(`正在创建资源目录:${BACKGROUNDS_DIR}`);
      fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true, mode: 0o755 });
    }
    this.logger.log(`房间图资源目录:${ROOM_IMAGES_DIR}`);
    if (!fs.existsSync(ROOM_IMAGES_DIR)) {
      this.logger.log(`正在创建资源目录:${ROOM_IMAGES_DIR}`);
      fs.mkdirSync(ROOM_IMAGES_DIR, { recursive: true, mode: 0o755 });
    }
  }

  getSafePath(subPath: string = '') {
    return resolveSafePath(FLOORPLANS_DIR, subPath);
  }

  getSafeBackgroundPath(subPath: string = '') {
    return resolveSafePath(BACKGROUNDS_DIR, subPath);
  }

  getSafeIconPath(subPath: string = '') {
    return resolveSafePath(ICONS_DIR, subPath);
  }

  getSafeRoomImagePath(subPath: string = '') {
    return resolveSafePath(ROOM_IMAGES_DIR, subPath);
  }

  listFloorplans(subPath: string = '') {
    return listImageAssets(FLOORPLANS_DIR, floorplanPublicUrl, subPath, '平面图', this.logger);
  }

  listBackgrounds(subPath: string = '') {
    return listImageAssets(BACKGROUNDS_DIR, backgroundPublicUrl, subPath, '背景图', this.logger);
  }

  listRoomImages(subPath: string = '') {
    return listImageAssets(ROOM_IMAGES_DIR, roomImagePublicUrl, subPath, '房间图', this.logger);
  }

  createDirectory(subPath: string) {
    return createImageDirectory(FLOORPLANS_DIR, subPath, '平面图', this.logger);
  }

  createBackgroundDirectory(subPath: string) {
    return createImageDirectory(BACKGROUNDS_DIR, subPath, '背景图', this.logger);
  }

  createRoomImageDirectory(subPath: string) {
    return createImageDirectory(ROOM_IMAGES_DIR, subPath, '房间图', this.logger);
  }

  createIconDirectory(subPath: string) {
    // subPath 为空时直接使用根目录（getSafeIconPath 会拒绝根目录本身）
    const targetDir = subPath ? this.getSafeIconPath(subPath) : path.resolve(ICONS_DIR);
    if (fs.existsSync(targetDir)) {
      badRequest(API_ERROR.UI_CONFIG_DIR_EXISTS);
    }
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
    this.logger.log(`图标目录已创建:${subPath}`);
    return { success: true, path: subPath };
  }

  listIcons(subPath: string = '') {
    try {
      // subPath 为空时直接使用根目录（getSafeIconPath 会拒绝根目录本身）
      const targetDir = subPath ? this.getSafeIconPath(subPath) : path.resolve(ICONS_DIR);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
      }
      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      const mapped = items
        .filter((item) => item.isDirectory() || path.extname(item.name).toLowerCase() === '.svg')
        .map((item) => {
          const fullPath = path.join(targetDir, item.name);
          const stat = fs.statSync(fullPath);
          if (item.isDirectory()) return { name: item.name, type: 'dir' as const };
          return {
            name: item.name,
            type: 'file' as const,
            url: iconPublicUrl(subPath, item.name),
            size: stat.size,
          };
        });
      return mapped.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
    } catch (e: unknown) {
      this.logger.error(
        `列出图标失败,路径 "${subPath}":${getErrorMessage(e)}`,
      );
      return [];
    }
  }

  async saveIcon(filename: string, buffer: Buffer, subPath: string = '') {
    // subPath 为空时直接使用根目录（getSafeIconPath 会拒绝根目录本身）
    const targetDir = subPath ? this.getSafeIconPath(subPath) : path.resolve(ICONS_DIR);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
    }
    const safeName = path.basename(filename);
    if (!/\.svg$/i.test(safeName)) {
      badRequest(API_ERROR.UI_CONFIG_SVG_ONLY);
    }
    const dest = path.join(targetDir, safeName);
    const safeBuffer = sanitizeUploadedSvg(buffer);
    await fs.promises.writeFile(dest, safeBuffer, { mode: 0o644 });
    this.logger.log(`图标已保存到 ${subPath}:${safeName}(${safeBuffer.length} 字节)`);
    return { name: safeName, url: iconPublicUrl(subPath, safeName), size: safeBuffer.length };
  }

  deleteIcon(fullPath: string) {
    const target = this.getSafeIconPath(fullPath);
    if (!fs.existsSync(target)) {
      badRequest(API_ERROR.UI_CONFIG_ICON_NOT_FOUND);
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
      this.logger.log(`图标目录已删除:${fullPath}`);
    } else {
      fs.unlinkSync(target);
      this.logger.log(`图标已删除:${fullPath}`);
    }
  }

  async saveFloorplan(filename: string, buffer: Buffer, subPath: string = '') {
    return saveImageAsset(
      FLOORPLANS_DIR,
      floorplanPublicUrl,
      filename,
      buffer,
      subPath,
      '平面图',
      this.logger,
    );
  }

  async saveBackground(filename: string, buffer: Buffer, subPath: string = '') {
    return saveImageAsset(
      BACKGROUNDS_DIR,
      backgroundPublicUrl,
      filename,
      buffer,
      subPath,
      '背景图',
      this.logger,
    );
  }

  async saveRoomImage(filename: string, buffer: Buffer, subPath: string = '') {
    return saveImageAsset(
      ROOM_IMAGES_DIR,
      roomImagePublicUrl,
      filename,
      buffer,
      subPath,
      '房间图',
      this.logger,
    );
  }

  deleteFloorplan(fullPath: string) {
    deleteImageAsset(FLOORPLANS_DIR, fullPath, '平面图', this.logger);
  }

  deleteBackground(fullPath: string) {
    deleteImageAsset(BACKGROUNDS_DIR, fullPath, '背景图', this.logger);
  }

  deleteRoomImage(fullPath: string) {
    deleteImageAsset(ROOM_IMAGES_DIR, fullPath, '房间图', this.logger);
  }
}
