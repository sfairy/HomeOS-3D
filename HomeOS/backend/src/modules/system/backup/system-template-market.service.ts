/**
 * @file system-template-market.service.ts
 * @module backend/src/modules
 *
 * 配置模板市场：将内置模板库（自动化 / 场景 / 脚本）导出为可分享 JSON，
 * 并支持整体导入分享 JSON（内置 id 复用现有模板安装，其余按条目批量创建）。
 */
import { getErrorMessage } from '../../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { badRequest } from '../../../common/utils/business-exception';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { AUTOMATION_BUILTIN_TEMPLATES } from '../../automation/builtin-templates.data';
import { AutomationService } from '../../automation/service';
import { SceneService } from '../../scene/service';
import { ScriptService } from '../../script/service';

const TEMPLATE_SHARE_KIND = 'homeos-template-share';
const TEMPLATE_SHARE_SCHEMA = 1;
const TEMPLATE_SHARE_GROUP_TYPES = ['automation', 'scene', 'script'] as const;

type TemplateShareGroupType = (typeof TEMPLATE_SHARE_GROUP_TYPES)[number];

type TemplateShareGroup = {
  type: TemplateShareGroupType;
  templates: unknown[];
};

type TemplateSharePayload = {
  kind: typeof TEMPLATE_SHARE_KIND;
  schemaVersion: number;
  exportedAt: string;
  groups: TemplateShareGroup[];
};

@Injectable()
/**
 * SystemTemplateMarketService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class SystemTemplateMarketService
 */
export class SystemTemplateMarketService {
  private readonly logger = new Logger(SystemTemplateMarketService.name);

  constructor(
    private readonly automationService: AutomationService,
    private readonly sceneService: SceneService,
    private readonly scriptService: ScriptService,
  ) {}

  /**
   * 导出全部内置模板为可分享 JSON（含版本号、类型、模板列表）。
   * 结构：{ kind, schemaVersion, exportedAt, groups: [{ type, templates }] }
   */
  exportTemplates(): TemplateSharePayload {
    return {
      kind: TEMPLATE_SHARE_KIND,
      schemaVersion: TEMPLATE_SHARE_SCHEMA,
      exportedAt: new Date().toISOString(),
      groups: [
        { type: 'automation', templates: AUTOMATION_BUILTIN_TEMPLATES },
        { type: 'scene', templates: this.sceneService.exportBuiltinTemplatesRaw() },
        { type: 'script', templates: this.scriptService.exportBuiltinTemplatesRaw() },
      ],
    };
  }

  /** 解析并校验模板分享 JSON（kind / schemaVersion / groups 白名单） */
  normalizeShareInput(raw: unknown): TemplateSharePayload {
    if (!raw || typeof raw !== 'object') {
      badRequest(API_ERROR.TEMPLATE_SHARE_INVALID_JSON);
    }
    const obj = raw as Record<string, unknown>;
    if (obj.kind !== TEMPLATE_SHARE_KIND) {
      badRequest(API_ERROR.TEMPLATE_SHARE_KIND_INVALID);
    }
    if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > TEMPLATE_SHARE_SCHEMA) {
      badRequest(
        API_ERROR.TEMPLATE_SHARE_SCHEMA_TOO_NEW(obj.schemaVersion, TEMPLATE_SHARE_SCHEMA),
      );
    }
    if (!Array.isArray(obj.groups) || !obj.groups.length) {
      badRequest(API_ERROR.TEMPLATE_SHARE_GROUP_INVALID);
    }
    const groups: TemplateShareGroup[] = obj.groups.map((g) => {
      const group = (g ?? {}) as Record<string, unknown>;
      if (
        !TEMPLATE_SHARE_GROUP_TYPES.includes(group.type as TemplateShareGroupType) ||
        !Array.isArray(group.templates)
      ) {
        badRequest(API_ERROR.TEMPLATE_SHARE_GROUP_INVALID);
      }
      return { type: group.type as TemplateShareGroupType, templates: group.templates };
    });
    return {
      kind: TEMPLATE_SHARE_KIND,
      schemaVersion:
        typeof obj.schemaVersion === 'number' ? obj.schemaVersion : TEMPLATE_SHARE_SCHEMA,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      groups,
    };
  }

  /**
   * 整体导入模板分享 JSON：
   * - 模板 id 命中内置库 → 复用现有 installBuiltinTemplate（自动生成画布/图数据）；
   * - 其余条目 → 按类型批量创建（自动化/脚本用 yaml，场景用 entities）。
   */
  async importTemplates(raw: unknown) {
    const share = this.normalizeShareInput(raw);
    const stats: {
      total: number;
      reused: number;
      created: number;
      failed: number;
      errors: string[];
    } = { total: 0, reused: 0, created: 0, failed: 0, errors: [] };

    for (const group of share.groups) {
      for (const item of group.templates) {
        const tpl = (item ?? {}) as Record<string, unknown>;
        const id = typeof tpl.id === 'string' ? tpl.id.trim() : '';
        const name = typeof tpl.name === 'string' ? tpl.name.trim() : '';
        if (!id || !name) {
          stats.failed += 1;
          stats.errors.push(API_ERROR.TEMPLATE_SHARE_ITEM_INVALID);
          continue;
        }
        stats.total += 1;
        try {
          const reused = await this.installByType(group.type, id, tpl);
          if (reused) stats.reused += 1;
          else stats.created += 1;
        } catch (err) {
          stats.failed += 1;
          stats.errors.push(
            `${group.type}/${id}: ${getErrorMessage(err)}`,
          );
        }
      }
    }

    this.logger.log(
      `模板分享导入完成: total=${stats.total} reused=${stats.reused} created=${stats.created} failed=${stats.failed}`,
    );
    return { success: true, ...stats };
  }

  /** 单条模板按类型安装：内置 id 复用现有安装（返回 true），否则批量创建（返回 false） */
  private async installByType(
    type: TemplateShareGroupType,
    id: string,
    tpl: Record<string, unknown>,
  ): Promise<boolean> {
    if (type === 'automation') {
      if (AUTOMATION_BUILTIN_TEMPLATES.some((t) => t.id === id)) {
        await this.automationService.installBuiltinTemplate(id);
        return true;
      }
      await this.automationService.create({
        name: tpl.name,
        yaml: typeof tpl.yaml === 'string' ? tpl.yaml : '',
        ...(tpl.geekGraph && typeof tpl.geekGraph === 'object'
          ? { geekGraph: tpl.geekGraph }
          : {}),
      });
      return false;
    }

    if (type === 'scene') {
      if (this.sceneService.getBuiltinTemplates().some((t) => t.id === id)) {
        await this.sceneService.installBuiltinTemplate(id);
        return true;
      }
      await this.sceneService.create({
        name: tpl.name,
        entities: Array.isArray(tpl.entities) ? tpl.entities : [],
        yaml: typeof tpl.yaml === 'string' && tpl.yaml.trim() ? tpl.yaml : null,
        runOnHa: false,
        ...(tpl.geekSceneGraph && typeof tpl.geekSceneGraph === 'object'
          ? { geekSceneGraph: tpl.geekSceneGraph }
          : {}),
      });
      return false;
    }

    // script
    if (this.scriptService.getBuiltinTemplates().some((t) => t.id === id)) {
      await this.scriptService.installBuiltinTemplate(id);
      return true;
    }
    await this.scriptService.create({
      name: tpl.name,
      yaml: typeof tpl.yaml === 'string' ? tpl.yaml : '',
      runOnHa: false,
      ...(tpl.geekGraph && typeof tpl.geekGraph === 'object' ? { geekGraph: tpl.geekGraph } : {}),
    });
    return false;
  }
}
