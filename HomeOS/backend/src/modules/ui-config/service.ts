/**
 * UI 配置服务
 *
 * 负责管理前端布局配置和静态资源（平面图、图标）。
 *
 * 功能模块：
 * - 项目配置的 CRUD（数据库存储，ProjectConfig 表）
 * - 配置的导入 / 导出（备份与恢复）
 * - 平面图文件管理（上传 / 删除 / 列表 / 目录遍历防护）
 * - 图标资源发现（内置 + 自定义）
 * - 终端 display profile 绑定与解析
 * - HA 连接配置变更检测与重连通知
 *
 * 依赖：PrismaService、EventEmitter2、EventBusService、AppConfigService、
 * UiConfigStaticAssetService
 */
import { Injectable, Logger } from '@nestjs/common';
import { badRequest, getErrorMessage, rethrowIfHttpException, BusinessException, ErrorCode } from '../../common/utils';
import { PrismaService } from '../../shared/prisma/service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { AppConfigService } from '../../shared/app-config/service';
import {
  extractHaConfigFingerprint,
  maskLayoutForRole,
  mergeLayoutSecretsOnSave,
} from './ha.util';
import { validateHaUrlForDeployOrThrow } from '../../shared/ha/rest-fetch.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import type { AppConfigData } from '../../shared/app-config/types';
import { UiConfigStaticAssetService } from './static-asset.service';
import { toInputJson } from '../../common/utils/json-field.util';
import type { Prisma } from '../../generated/prisma/client';

/**
 * UI 配置服务（@Injectable）
 *
 * 负责管理前端布局配置和静态资源（平面图、图标）。
 *
 * 功能模块：
 * - 项目配置的 CRUD（数据库存储）
 * - 配置的导入/导出（备份与恢复）
 * - 平面图文件管理（上传/删除/列表/目录遍历防护）
 * - 图标资源发现（内置 + 自定义）
 */
@Injectable()
export class UiConfigService {
  private readonly logger = new Logger(UiConfigService.name);

  /** @param prisma 数据库；@param eventEmitter 本地事件；@param eventBus 跨实例事件总线；@param appConfig 应用配置；@param staticAssets 静态资源服务 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: EventBusService,
    private readonly appConfig: AppConfigService,
    private readonly staticAssets: UiConfigStaticAssetService,
  ) {}

  /**
   * 获取项目配置
   * 如果项目不存在，返回空的默认配置
   * @param projectId - 项目 ID，默认为 'default'
   * @returns 包含 projectId 和 layout 对象的配置
   */
  async getConfig(projectId: string = 'default') {
    const config = await this.prisma.projectConfig.findUnique({
      where: { projectId },
    });

    if (!config) {
      return {
        projectId,
        layout: {},
      };
    }

    return config;
  }

  /**
   * 解析 layout 为对象（API / 备份导入可能仍传入 JSON 字符串）。
   * @returns 解析后的 layout 对象与 parseError 标志
   */
  parseLayoutField(layout: unknown): {
    layout: Record<string, unknown>;
    parseError: boolean;
  } {
    if (layout == null || layout === '') return { layout: {}, parseError: false };
    if (typeof layout === 'object' && !Array.isArray(layout)) {
      return { layout: layout as Record<string, unknown>, parseError: false };
    }
    if (typeof layout === 'string') {
      try {
        return { layout: JSON.parse(layout) as Record<string, unknown>, parseError: false };
      } catch (e) {
        const msg = getErrorMessage(e);
        this.logger.error(`布局 JSON 解析失败: ${msg}`);
        return { layout: {}, parseError: true };
      }
    }
    return { layout: {}, parseError: true };
  }

  /** API：获取项目配置（含已解析 layout；非 admin 脱敏 HA token） */
  async getConfigForApi(projectId: string, role?: string) {
    try {
      const data = await this.getConfig(projectId);
      const { layout, parseError } = this.parseLayoutField(data.layout);
      return {
        success: true,
        data: {
          ...data,
          layout: maskLayoutForRole(layout, role),
          layoutParseError: parseError,
        },
      };
    } catch (err: unknown) {
      rethrowIfHttpException(err);
      const errMsg = getErrorMessage(err);
      throw new BusinessException(ErrorCode.CONFIG_ERROR, API_ERROR.UI_CONFIG_LOAD_FAILED(errMsg));
    }
  }
  /** API：设置当前激活的配置方案 ID */
  async setActiveProfile(projectIdRaw: string | undefined) {
    const projectId = String(projectIdRaw || '').trim();
    if (!projectId) badRequest(API_ERROR.UI_CONFIG_PROJECT_ID_REQUIRED);
    if (projectId === 'default') {
      await this.ensureDefaultProfile();
    } else {
      await this.assertProfileExists(projectId);
    }
    if (this.resolveActiveProjectId() === projectId) {
      return { success: true, activeProfileId: projectId };
    }
    await this.appConfig.update({ profiles: { activeProfileId: projectId } });
    this.eventBus.emit('SYSTEM_CONFIG_UPDATED');
    this.eventEmitter.emit('layout.config.updated');
    return { success: true, activeProfileId: projectId };
  }

  /** 当前激活 display profile ID（空则 fallback `default`） */
  resolveActiveProjectId(): string {
    return String(this.appConfig.get('profiles')?.activeProfileId || '').trim() || 'default';
  }

  /** API：读取当前激活方案与新终端默认策略 */
  getActiveProfileSettings() {
    const profiles = this.appConfig.get('profiles') as AppConfigData['profiles'];
    return {
      success: true,
      data: {
        activeProfileId: profiles.activeProfileId || 'default',
        newTerminalDefault: profiles.newTerminalDefault || 'activeProfile',
      },
    };
  }

  /** API：更新新终端默认策略（activeProfile / default） */
  async setNewTerminalDefault(strategy: string | undefined) {
    const val = String(strategy || '').trim();
    if (val !== 'activeProfile' && val !== 'default') {
      badRequest(API_ERROR.UI_CONFIG_TERMINAL_DEFAULT_INVALID);
    }
    await this.appConfig.update({
      profiles: { newTerminalDefault: val as 'activeProfile' | 'default' },
    });
    return { success: true, newTerminalDefault: val };
  }

  /** API：列出全部终端绑定（按更新时间降序） */
  listTerminalBindings() {
    const profiles = this.appConfig.get('profiles') as AppConfigData['profiles'];
    return {
      success: true,
      data: [...(profiles.terminalBindings || [])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    };
  }

  /**
   * API：为终端解析应使用的 display profile。
   * 优先级：终端绑定 → 新终端默认策略（activeProfile → 激活方案）→ default
   */
  async resolveProfileForTerminal(clientIdRaw: string | undefined) {
    const clientId = String(clientIdRaw || '').trim();
    if (!clientId) badRequest(API_ERROR.UI_CONFIG_CLIENT_ID_REQUIRED);

    const profiles = this.appConfig.get('profiles') as AppConfigData['profiles'];
    const binding = (profiles.terminalBindings || []).find((b) => b.clientId === clientId);

    // 优先使用终端绑定的 profileId
    if (binding?.profileId) {
      const exists = await this.prisma.projectConfig.findUnique({
        where: { projectId: binding.profileId },
        select: { projectId: true },
      });
      if (exists) {
        return {
          success: true,
          data: { profileId: binding.profileId, source: 'binding' as const },
        };
      }
    }

    // 其次按新终端默认策略：activeProfile 时取激活方案
    const strategy = profiles.newTerminalDefault || 'activeProfile';
    if (strategy === 'activeProfile') {
      const activeId = String(profiles.activeProfileId || '').trim() || 'default';
      const exists = await this.prisma.projectConfig.findUnique({
        where: { projectId: activeId },
        select: { projectId: true },
      });
      if (exists) {
        return {
          success: true,
          data: { profileId: activeId, source: 'activeProfile' as const },
        };
      }
    }

    // 兜底返回 default
    return {
      success: true,
      data: { profileId: 'default', source: 'default' as const },
    };
  }

  /** API：绑定 / 更新终端 display profile（admin） */
  async upsertTerminalBinding(
    body: { clientId?: string; profileId?: string; label?: string },
    boundByUserId?: string,
  ) {
    const clientId = String(body.clientId || '').trim();
    const profileId = String(body.profileId || '').trim();
    if (!clientId) badRequest(API_ERROR.UI_CONFIG_CLIENT_ID_REQUIRED);
    if (!profileId) badRequest(API_ERROR.UI_CONFIG_PROFILE_ID_REQUIRED);
    await this.assertProfileExists(profileId);

    const profiles = this.appConfig.get('profiles') as AppConfigData['profiles'];
    const bindings = [...(profiles.terminalBindings || [])];
    const idx = bindings.findIndex((b) => b.clientId === clientId);
    const row = {
      clientId,
      profileId,
      label: body.label != null ? String(body.label).trim() : undefined,
      boundBy: boundByUserId,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      // 更新时保留已有 boundBy（防止 admin 更新时意外清除所有权标记）
      bindings[idx] = { ...bindings[idx], ...row, boundBy: row.boundBy ?? bindings[idx].boundBy };
    } else {
      bindings.push(row);
    }

    await this.appConfig.update({ profiles: { terminalBindings: bindings } });
    return { success: true, data: row };
  }

  /**
   * API：本机绑定当前方案（admin / adult / child）。
   *
   * 权限策略：
   * - admin：可绑定 / 修改任意终端（含他人终端），委托 upsertTerminalBinding。
   * - 非 admin（adult / child）：仅允许修改自己创建的绑定（boundBy 匹配），
   *   防止越权篡改他人终端绑定；可为未绑定的 clientId 创建新绑定。
   *
   * 注意：当前无终端注册表，clientId 仍由请求体控制；boundBy 仅作为软所有权标记，
   * 无法防止非 admin 为不存在的 clientId 创建新绑定（需设备注册表彻底解决）。
   */
  async bindSelfTerminal(
    body: { clientId?: string; profileId?: string; label?: string },
    caller?: { role?: string; userId?: string },
  ) {
    const clientId = String(body.clientId || '').trim();
    const profileId = String(body.profileId || '').trim();
    if (!clientId) badRequest(API_ERROR.UI_CONFIG_CLIENT_ID_REQUIRED);
    if (!profileId) badRequest(API_ERROR.UI_CONFIG_PROFILE_ID_REQUIRED);
    await this.assertProfileExists(profileId);

    // admin 可绑定 / 修改任意终端（含他人终端）
    if (caller?.role === 'admin') {
      return this.upsertTerminalBinding(body, caller.userId);
    }

    const profiles = this.appConfig.get('profiles') as AppConfigData['profiles'];
    const bindings = [...(profiles.terminalBindings || [])];
    const idx = bindings.findIndex((b) => b.clientId === clientId);

    if (idx >= 0) {
      const existing = bindings[idx];
      // 非 admin：仅允许修改自己创建的绑定
      if (!caller?.userId || existing.boundBy !== caller.userId) {
        badRequest(API_ERROR.UI_CONFIG_TERMINAL_BINDING_FORBIDDEN);
      }
      const row = {
        ...existing,
        clientId,
        profileId,
        label: body.label != null ? String(body.label).trim() : existing.label,
        boundBy: caller?.userId || existing.boundBy,
        updatedAt: new Date().toISOString(),
      };
      bindings[idx] = row;
      await this.appConfig.update({ profiles: { terminalBindings: bindings } });
      this.logger.warn(
        `非 admin 用户 ${caller?.userId || 'unknown'}(${caller?.role}) 更新终端 ${clientId} 绑定 → 方案 ${profileId}`,
      );
      return { success: true, data: row };
    }

    // 创建新绑定
    const row = {
      clientId,
      profileId,
      label: body.label != null ? String(body.label).trim() : undefined,
      boundBy: caller?.userId,
      updatedAt: new Date().toISOString(),
    };
    bindings.push(row);
    await this.appConfig.update({ profiles: { terminalBindings: bindings } });
    this.logger.warn(
      `非 admin 用户 ${caller?.userId || 'unknown'}(${caller?.role}) 绑定终端 ${clientId} → 方案 ${profileId}`,
    );
    return { success: true, data: row };
  }

  /** API：解除终端绑定 */
  async removeTerminalBinding(clientIdRaw: string) {
    const clientId = String(clientIdRaw || '').trim();
    if (!clientId) badRequest(API_ERROR.UI_CONFIG_CLIENT_ID_REQUIRED);

    const profiles = this.appConfig.get('profiles') as AppConfigData['profiles'];
    const bindings = (profiles.terminalBindings || []).filter((b) => b.clientId !== clientId);
    await this.appConfig.update({ profiles: { terminalBindings: bindings } });
    return { success: true, removed: clientId };
  }

  /** 空库首次激活 default：落一行空 layout，避免「方案不存在」 */
  private async ensureDefaultProfile() {
    await this.prisma.projectConfig.upsert({
      where: { projectId: 'default' },
      create: { projectId: 'default', layout: {} },
      update: {},
    });
  }

  /** 断言配置方案存在，不存在则抛出 BadRequest */
  private async assertProfileExists(projectId: string) {
    const exists = await this.prisma.projectConfig.findUnique({
      where: { projectId },
      select: { projectId: true },
    });
    if (!exists) {
      badRequest(API_ERROR.UI_CONFIG_PROFILE_NOT_FOUND(projectId));
    }
  }
  /** API：批量导入（含请求体验证） */
  async importAllConfigsValidated(body: {
    configs?: Array<{ projectId?: string; layout?: string | Record<string, unknown> }>;
  }) {
    if (!body.configs || !Array.isArray(body.configs)) {
      badRequest(API_ERROR.UI_CONFIG_DATA_INVALID);
    }
    return this.importAllConfigs(body.configs);
  }

  /** API：保存配置（含 layout 序列化、HA URL 校验、密钥合并） */
  async saveConfigFromBody(projectId: string, body: { layout?: string | Record<string, unknown> }) {
    const { layout: layoutObjRaw, parseError } = this.parseLayoutField(body.layout);
    if (parseError) {
      badRequest(API_ERROR.UI_CONFIG_DATA_INVALID);
    }

    // 校验 HA URL 格式，不合法则抛出 BusinessException
    try {
      const haUrl = (layoutObjRaw?.haConfig as { url?: string } | undefined)?.url;
      if (haUrl?.trim()) {
        validateHaUrlForDeployOrThrow(haUrl);
      }
    } catch (e: unknown) {
      rethrowIfHttpException(e);
      throw e;
    }

    const existing = await this.prisma.projectConfig.findUnique({
      where: { projectId },
      select: { layout: true },
    });

    // 若新建方案（无已有布局），从当前激活方案获取真实密钥作为合并源，
    // 防止前端脱敏回传导致密钥丢失。
    let existingForMerge = existing?.layout;
    if (!existingForMerge) {
      const activeProfileId = this.appConfig.get('profiles')?.activeProfileId as
        | string
        | undefined;
      if (activeProfileId && activeProfileId !== projectId) {
        const activeConfig = await this.prisma.projectConfig.findUnique({
          where: { projectId: activeProfileId },
          select: { layout: true },
        });
        if (activeConfig?.layout) {
          existingForMerge = activeConfig.layout;
        }
      }
    }

    // 合并密钥：若 incoming 中密钥为占位符/空值，保留数据库中的真实值
    const mergedLayout = mergeLayoutSecretsOnSave(layoutObjRaw, existingForMerge);
    const result = await this.saveConfig(projectId, mergedLayout);
    return { success: true, data: result };
  }

  /** API：删除配置方案（业务错误转 BadRequest） */
  async deleteProfileSafe(projectId: string) {
    try {
      await this.deleteProfile(projectId);
      return { success: true };
    } catch (e: unknown) {
      rethrowIfHttpException(e);
      badRequest(getErrorMessage(e));
    }
  }

  /** API：批量上传平面图 */
  async uploadFloorplanFiles(files: Express.Multer.File[], subPath: string = '') {
    if (!files || files.length === 0) {
      badRequest(API_ERROR.UI_CONFIG_FILE_REQUIRED);
    }
    const saved = await Promise.all(
      files.map((f) => this.staticAssets.saveFloorplan(f.originalname, f.buffer, subPath)),
    );
    return { success: true, uploaded: saved.length, data: saved };
  }

  /** API：批量上传背景图 */
  async uploadBackgroundFiles(files: Express.Multer.File[], subPath: string = '') {
    if (!files || files.length === 0) {
      badRequest(API_ERROR.UI_CONFIG_FILE_REQUIRED);
    }
    const saved = await Promise.all(
      files.map((f) => this.staticAssets.saveBackground(f.originalname, f.buffer, subPath)),
    );
    return { success: true, uploaded: saved.length, data: saved };
  }

  /** API：批量上传图标 */
  async uploadIconFiles(files: Express.Multer.File[], subPath: string = '') {
    if (!files || files.length === 0) {
      badRequest(API_ERROR.UI_CONFIG_FILE_REQUIRED);
    }
    const saved = await Promise.all(
      files.map((f) => this.staticAssets.saveIcon(f.originalname, f.buffer, subPath)),
    );
    return { success: true, uploaded: saved.length, data: saved };
  }

  /** API：批量上传房间图 */
  async uploadRoomImageFiles(files: Express.Multer.File[], subPath: string = '') {
    if (!files || files.length === 0) {
      badRequest(API_ERROR.UI_CONFIG_FILE_REQUIRED);
    }
    const saved = await Promise.all(
      files.map((f) => this.staticAssets.saveRoomImage(f.originalname, f.buffer, subPath)),
    );
    return { success: true, uploaded: saved.length, data: saved };
  }

  /**
   * 保存或更新项目配置
   * 使用 upsert 实现创建或更新，保存后触发 SYSTEM_CONFIG_UPDATED 事件通知 HA 连接器重连
   * @param projectId - 项目 ID
   * @param layout - 布局配置（对象或 JSON 字符串）
   * @returns 保存后的配置记录
   */
  async saveConfig(
    projectId: string = 'default',
    layout: string | Record<string, unknown> | Prisma.InputJsonValue,
  ) {
    this.logger.log(`正在保存项目布局配置:${projectId}`);
    const layoutJson = toInputJson(layout, {});

    const existing = await this.prisma.projectConfig.findUnique({
      where: { projectId },
      select: { layout: true },
    });
    const oldHaFp = extractHaConfigFingerprint(existing?.layout);
    const newHaFp = extractHaConfigFingerprint(layoutJson);

    const result = await this.prisma.projectConfig.upsert({
      where: { projectId },
      update: { layout: layoutJson },
      create: { projectId, layout: layoutJson },
    });

    // 布局内含 agentConfig / channelConfig 等，须始终通知监听方热更新；
    // HA 连接器内部会比对指纹，未变更则不会重连。
    this.eventBus.emit('SYSTEM_CONFIG_UPDATED');
    if (oldHaFp !== newHaFp) {
      this.logger.log('检测到 HA 连接配置变更,已触发 SYSTEM_CONFIG_UPDATED');
    }
    this.eventEmitter.emit('layout.config.updated');
    return result;
  }
  /**
   * 列出所有项目配置概要
   * 仅返回 projectId 和更新时间，不包含完整的 layout 数据
   * @returns 按更新时间降序排列的项目概要列表
   */
  async listProfiles() {
    return this.prisma.projectConfig.findMany({
      select: {
        projectId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * 删除项目配置
   * 受保护操作：不允许删除 'default' 默认配置
   * @param projectId - 项目 ID
   * @throws Error 当尝试删除默认配置时
   */
  async deleteProfile(projectId: string) {
    if (projectId === 'default') {
      badRequest(API_ERROR.UI_CONFIG_DEFAULT_DELETE_DENIED);
    }

    return this.prisma.projectConfig.delete({
      where: { projectId },
    });
  }

  /**
   * 导出所有项目配置
   * 用于全量备份配置数据
   * @returns 全部项目配置数组
   */
  async exportAllConfigs() {
    return this.prisma.projectConfig.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  /** UI 布局方案清单（备份 summary，不含 layout JSON） */
  async getProfilesSummary() {
    const rows = await this.prisma.projectConfig.findMany({
      select: { projectId: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return {
      count: rows.length,
      profiles: rows.map((r) => ({
        projectId: r.projectId,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * 批量导入项目配置
   * 使用 upsert 逐个创建或更新，覆盖已存在的配置。
   * 导入时合并密钥：若备份中密钥为占位符/空值，保留数据库中的真实值；
   * 若为新建方案，从当前激活方案获取真实密钥作为合并源。
   * @param configs - 配置数据数组
   * @returns {success, count} 导入结果
   */
  async importAllConfigs(
    configs: Array<{ projectId?: string; layout?: unknown }>,
  ) {
    this.logger.log(`正在恢复所有项目配置(${configs.length} 项)...`);

    const validConfigs = configs.filter((item) => item.projectId && item.layout != null);

    // 批量查询已存在的配置，用于密钥合并
    const existingConfigs = new Map<string, unknown>();
    if (validConfigs.length) {
      const existing = await this.prisma.projectConfig.findMany({
        where: { projectId: { in: validConfigs.map((c) => c.projectId as string) } },
        select: { projectId: true, layout: true },
        take: 100,
      });
      for (const row of existing) {
        existingConfigs.set(row.projectId, row.layout);
      }
    }

    // 获取当前激活方案作为新建方案的密钥回退源
    const activeProfileId = this.appConfig.get('profiles')?.activeProfileId as
      | string
      | undefined;
    let activeLayout: unknown = null;
    if (activeProfileId) {
      const activeConfig = await this.prisma.projectConfig.findUnique({
        where: { projectId: activeProfileId },
        select: { layout: true },
      });
      if (activeConfig?.layout) {
        activeLayout = activeConfig.layout;
      }
    }

    const rows = validConfigs
      .map((item) => {
        try {
          const { layout: layoutObj, parseError } = this.parseLayoutField(item.layout);
          if (parseError) {
            this.logger.warn(`跳过损坏的布局配置 projectId=${item.projectId}`);
            return null;
          }
          const haUrl = (layoutObj?.haConfig as { url?: string } | undefined)?.url;
          if (haUrl?.trim()) {
            validateHaUrlForDeployOrThrow(haUrl);
          }

          // 密钥合并：保留数据库中的真实密钥
          const projectId = item.projectId as string;
          const existingLayout = existingConfigs.get(projectId);
          const layoutForMerge = existingLayout || activeLayout || undefined;
          const mergedLayout = mergeLayoutSecretsOnSave(layoutObj, layoutForMerge);

          return {
            projectId,
            layout: toInputJson(mergedLayout, {}),
          };
        } catch (e: unknown) {
          rethrowIfHttpException(e);
          return null;
        }
      })
      .filter(
        (item): item is { projectId: string; layout: Prisma.InputJsonValue } => item != null,
      );

    await this.prisma.$transaction(
      rows.map((item) =>
        this.prisma.projectConfig.upsert({
          where: { projectId: item.projectId },
          update: { layout: item.layout },
          create: { projectId: item.projectId, layout: item.layout },
        }),
      ),
    );

    this.eventBus.emit('SYSTEM_CONFIG_UPDATED');
    return { success: true, count: rows.length };
  }

  // 以下为委托 UiConfigStaticAssetService 的静态资源操作方法

  /** 委托：解析平面图安全路径 */
  getSafePath(subPath: string = '') {
    return this.staticAssets.getSafePath(subPath);
  }

  /** 委托：解析背景图安全路径 */
  getSafeBackgroundPath(subPath: string = '') {
    return this.staticAssets.getSafeBackgroundPath(subPath);
  }

  /** 委托：解析图标安全路径 */
  getSafeIconPath(subPath: string = '') {
    return this.staticAssets.getSafeIconPath(subPath);
  }

  /** 委托：列出平面图文件 */
  listFloorplans(subPath: string = '') {
    return this.staticAssets.listFloorplans(subPath);
  }

  /** 委托：列出背景图文件 */
  listBackgrounds(subPath: string = '') {
    return this.staticAssets.listBackgrounds(subPath);
  }

  /** 委托：列出房间图文件 */
  listRoomImages(subPath: string = '') {
    return this.staticAssets.listRoomImages(subPath);
  }

  /** 委托：创建平面图目录 */
  createDirectory(subPath: string) {
    return this.staticAssets.createDirectory(subPath);
  }

  /** 委托：创建背景图目录 */
  createBackgroundDirectory(subPath: string) {
    return this.staticAssets.createBackgroundDirectory(subPath);
  }

  /** 委托：创建房间图目录 */
  createRoomImageDirectory(subPath: string) {
    return this.staticAssets.createRoomImageDirectory(subPath);
  }

  /** 委托：创建图标目录 */
  createIconDirectory(subPath: string) {
    return this.staticAssets.createIconDirectory(subPath);
  }

  /** 委托：列出图标文件 */
  listIcons(subPath: string = '') {
    return this.staticAssets.listIcons(subPath);
  }

  /** 委托：保存图标文件 */
  saveIcon(filename: string, buffer: Buffer, subPath: string = '') {
    return this.staticAssets.saveIcon(filename, buffer, subPath);
  }

  /** 委托：删除图标文件 */
  deleteIcon(fullPath: string) {
    return this.staticAssets.deleteIcon(fullPath);
  }

  /** 委托：保存平面图文件 */
  saveFloorplan(filename: string, buffer: Buffer, subPath: string = '') {
    return this.staticAssets.saveFloorplan(filename, buffer, subPath);
  }

  /** 委托：保存背景图文件 */
  saveBackground(filename: string, buffer: Buffer, subPath: string = '') {
    return this.staticAssets.saveBackground(filename, buffer, subPath);
  }

  /** 委托：删除平面图文件 */
  deleteFloorplan(fullPath: string) {
    return this.staticAssets.deleteFloorplan(fullPath);
  }

  /** 委托：删除背景图文件 */
  deleteBackground(fullPath: string) {
    return this.staticAssets.deleteBackground(fullPath);
  }

  /** 委托：保存房间图文件 */
  saveRoomImage(filename: string, buffer: Buffer, subPath: string = '') {
    return this.staticAssets.saveRoomImage(filename, buffer, subPath);
  }

  /** 委托：删除房间图文件 */
  deleteRoomImage(fullPath: string) {
    return this.staticAssets.deleteRoomImage(fullPath);
  }
}