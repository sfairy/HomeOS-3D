/**
 * @file server-backup.service.ts
 * @module system/backup
 * @description 服务器备份包文件管理服务。负责手动备份包的生成、列出、下载、导入本地包、还原与删除，
 * 全部为纯手动文件级操作，不涉及任何定时 / cron 调度（定时自动备份见 AutoBackupService）。
 *
 * 关键策略：
 *  - 备份包写入项目根 backups/ 目录，文件名按时间戳生成（nextBundleName）
 *  - 手动备份保留完整密钥（不脱敏），确保还原时真实配置不被占位符覆盖
 *  - 紧凑 JSON 序列化，避免 pretty-print 长时间占用事件循环拖垮 HA WS 心跳
 *  - 还原时校验文件名格式与白名单，防止目录穿越
 *
 * 依赖：
 *  - SystemBundleBackupService：完整备份包导出 / 导入
 *  - fs/promises：文件读写与目录管理
 */
import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { badRequest, notFound } from '../../../common/utils';
import { SystemBundleBackupService } from './system-bundle-backup.service';

type BackupFileEntry = {
  name: string;
  size: number;
  mtime: string;
  path: string;
};

/** 服务器备份目录（相对项目根） */
const BACKUP_DIR = 'backups';
const BUNDLE_NAME_RE = /^homeos-bundle-.+\.json$/i;

/**
 * 服务器备份包文件管理：手动备份、列出、下载、导入本地包、还原、删除。
 * 纯手动文件级操作，不涉及任何定时/cron 调度。
 */
@Injectable()
export class ServerBackupService {
  private readonly logger = new Logger(ServerBackupService.name);

  constructor(private readonly bundleBackup: SystemBundleBackupService) {}

  /** 手动生成一份完整备份包并写入服务器备份目录 */
  async createBackup(): Promise<{ file: string; name: string }> {
    const dir = this.resolveBackupDir();
    await mkdir(dir, { recursive: true });
    // 手动备份保留完整密钥，确保还原时不会被脱敏占位符覆盖真实配置
    const bundle = await this.bundleBackup.exportBundle(false, { includeEventLog: false });
    const name = this.nextBundleName();
    const file = join(dir, name);
    // 紧凑 JSON：pretty-print 大包会长时间占用事件循环，拖垮 HA WS 心跳
    await writeFile(file, JSON.stringify(bundle), 'utf8');
    this.logger.log(`备份包已写入 ${file}`);
    return { file, name };
  }

  /** 列出备份目录中的 homeos-bundle-*.json（新→旧） */
  async listFiles(): Promise<BackupFileEntry[]> {
    const dir = this.resolveBackupDir();
    try {
      await mkdir(dir, { recursive: true });
      const names = await readdir(dir);
      const entries: BackupFileEntry[] = [];
      for (const name of names) {
        if (!BUNDLE_NAME_RE.test(name)) continue;
        try {
          const full = join(dir, name);
          const st = await stat(full);
          if (!st.isFile()) continue;
          entries.push({
            name,
            size: st.size,
            mtime: st.mtime.toISOString(),
            path: full,
          });
        } catch {
          /* 跳过不可读项 */
        }
      }
      return entries.sort((a, b) => b.mtime.localeCompare(a.mtime));
    } catch (err) {
      this.logger.warn(`列出备份文件失败: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  async deleteFile(rawName: string): Promise<{ deleted: string }> {
    const name = this.assertSafeBundleName(rawName);
    const full = join(this.resolveBackupDir(), name);
    try {
      await unlink(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        notFound(API_ERROR.BACKUP_FILE_NOT_FOUND);
      }
      throw err;
    }
    this.logger.log(`已删除备份包 ${name}`);
    return { deleted: name };
  }

  /** 读取并解析服务器备份包（供下载与还原复用） */
  async readFileBundle(rawName: string): Promise<{ name: string; bundle: unknown }> {
    const name = this.assertSafeBundleName(rawName);
    const full = join(this.resolveBackupDir(), name);
    let raw: string;
    try {
      raw = await readFile(full, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        notFound(API_ERROR.BACKUP_FILE_NOT_FOUND);
      }
      throw err;
    }
    let bundle: unknown;
    try {
      bundle = JSON.parse(raw);
    } catch {
      badRequest(API_ERROR.BACKUP_BUNDLE_INVALID_JSON);
    }
    return { name, bundle };
  }

  /**
   * 将本地备份包写入服务器备份目录（不触发还原）。
   * preferredName 合法且未占用则沿用，否则生成新的时间戳文件名，避免覆盖已有文件。
   */
  async importLocalFile(
    rawBundle: unknown,
    preferredName?: string,
  ): Promise<{ file: string; name: string }> {
    const bundle = this.bundleBackup.normalizeBundleInput(rawBundle);
    const dir = this.resolveBackupDir();
    await mkdir(dir, { recursive: true });

    let name = '';
    const candidate = basename(String(preferredName || '').trim());
    if (BUNDLE_NAME_RE.test(candidate) && !candidate.includes('..')) {
      try {
        await stat(join(dir, candidate));
        // 已存在则改用新时间戳名
      } catch {
        name = candidate;
      }
    }
    if (!name) name = this.nextBundleName();

    const file = join(dir, name);
    await writeFile(file, JSON.stringify(bundle), 'utf8');
    this.logger.log(`本地备份包已导入服务器 ${file}`);
    return { file, name };
  }

  /** 从服务器备份包还原（复用 readFileBundle + 统一 importBundle 流程） */
  async restoreFile(
    rawName: string,
    opts: {
      confirm?: boolean;
      appConfigMode?: 'merge' | 'replace';
      /** 待还原分区（支持 layout/config 别名，服务端白名单校验） */
      sections?: string[];
    } = {},
  ) {
    if (opts.confirm !== true) {
      badRequest(API_ERROR.BACKUP_BUNDLE_CONFIRM_REQUIRED);
    }
    const { bundle } = await this.readFileBundle(rawName);
    return this.bundleBackup.importBundle({
      bundle,
      confirm: true,
      appConfigMode: opts.appConfigMode,
      sections: opts.sections,
    });
  }

  private nextBundleName(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `homeos-bundle-${stamp}.json`;
  }

  private assertSafeBundleName(rawName: string): string {
    const name = basename(String(rawName || '').trim());
    if (!BUNDLE_NAME_RE.test(name) || name.includes('..')) {
      badRequest(API_ERROR.BACKUP_FILE_INVALID_NAME);
    }
    return name;
  }

  private resolveBackupDir(): string {
    const cwd = process.cwd();
    const base = /[/\\]backend$/.test(cwd) ? join(cwd, '..') : cwd;
    return join(base, BACKUP_DIR);
  }
}
