/**
 * 所属模块：backend/modules/template-entity
 * 职责：
 *  - 模板实体服务（CRUD/安装/预览/签名）；
 * 关键依赖：
 *  - ha-sync.factory；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { BaseCrudService } from '../../common/crud/base-crud.service';
import { BusinessException, ErrorCode } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { hashContent } from '../../shared/orchestrator/ha-sync.internals';
import { upsertOrchestratorFromHaPull } from '../../shared/orchestrator/ha-sync.internals';
import {
  findPlaceholderEntityIdsInYaml,
  normalizeSlotPayload,
  validateApplianceSlotMapping,
  APPLIANCE_TEMPLATE_TYPES,
  inferTemplateEntityImportMeta,
} from '@homeos/shared';
import { validateTemplateYamlLocal } from '../../shared/orchestrator/config.util';

/** 列表查询时选取的字段（避免泄露无关列） */
const LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  yaml: true,
  slotMapping: true,
  haConfigId: true,
  haEntityId: true,
  haConfigEntryId: true,
  yamlSource: true,
  yamlComplete: true,
  contentHash: true,
  haSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** 列表行类型，与 LIST_SELECT 字段对齐 */
type TemplateEntityListRow = {
  id: string;
  name: string;
  type: string;
  yaml: string;
  slotMapping: unknown;
  haConfigId: string | null;
  haEntityId: string | null;
  haConfigEntryId: string | null;
  yamlSource: string | null;
  yamlComplete: boolean;
  contentHash: string | null;
  haSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 持久化模式：user 为用户手编，import 为 HA / 配置包导入 */
type TemplatePersistMode = 'user' | 'import';

/** 模板实体写入请求体（创建 / 更新通用） */
interface TemplateEntityWriteBody {
  name?: string;
  type?: string;
  yaml?: string;
  slotMapping?:
    Record<string, string> | { mapping: Record<string, string>; slotsMeta?: unknown[] } | null;
  yamlComplete?: boolean;
  yamlSource?: string;
}

/** HA 导入输入（拉取 / 粘贴 YAML 共用） */
export interface TemplateEntityHaImportInput {
  name: string;
  yaml: string;
  haConfigId: string;
  entityId?: string;
  type?: string;
  yamlSource?: string;
  yamlComplete?: boolean;
  haConfigEntryId?: string;
  slotMapping?: TemplateEntityWriteBody['slotMapping'];
}

/**
 * 模板实体服务（@Injectable）
 *
 * 继承 BaseCrudService<'templateEntity'>，复用分页 / 排序基础设施。
 * 负责写入前校验、槽位规范化、contentHash 计算以及 HA 导入 upsert。
 */
@Injectable()
export class TemplateEntityService extends BaseCrudService<'templateEntity'> {
  constructor(prisma: PrismaService) {
    super(prisma, { delegate: prisma.templateEntity, modelName: 'templateEntity' });
  }
  /** 列表查询参数：按创建时间降序，仅选取 LIST_SELECT 字段 */
  protected listFindArgs() {
    return { orderBy: { createdAt: 'desc' as const }, select: LIST_SELECT };
  }

  /**
   * 更新写入钩子（覆盖基类默认）：template 模型无 geek 图字段，
   * YAML 变更不适用"清空 geekGraph"策略（基类默认面向 automation/script 的 geekGraph 列）。
   */
  protected override applyYamlChangeGraphPolicy(_payload: Record<string, unknown>): void {
    // 无操作：templateEntity 模型没有 geekGraph 字段
  }

  /**
   * 序列化数据库行为 API 响应：
   * - needsAttention：YAML 不完整，需用户补全
   * - stubYaml：来源为 stub 或 YAML 不完整
   */
  private serializeRow(row: TemplateEntityListRow) {
    // YAML 不完整，或已写入 HA 配置但 reload/同步未完成 → 需用户关注
    const syncPending = Boolean(row.haConfigId) && !row.haSyncedAt;
    return {
      ...row,
      needsAttention: row.yamlComplete === false || syncPending,
      stubYaml: row.yamlSource === 'stub' || row.yamlComplete === false,
    };
  }

  /** 获取全部模板实体（已序列化） */
  async findAll() {
    const rows = (await this.delegate.findMany(this.listFindArgs())) as TemplateEntityListRow[];
    return rows.map((row) => this.serializeRow(row));
  }

  /** 分页获取模板实体（已序列化） */
  async findAllPaginated(pageNum: number, pageSize: number) {
    const result = await super.findAllPaginated(pageNum, pageSize);
    const items = (result.items as TemplateEntityListRow[]).map((row) => this.serializeRow(row));
    return { ...result, items };
  }

  /** 根据 ID 获取单条模板实体；不存在返回 null */
  async findOne(
    id: string,
  ): Promise<(TemplateEntityListRow & { needsAttention: boolean; stubYaml: boolean }) | null> {
    const row = (await this.delegate.findUnique({
      where: { id },
      select: LIST_SELECT,
    })) as TemplateEntityListRow | null;
    return row ? this.serializeRow(row) : null;
  }

  /** 规范化 YAML 文本（trim） */
  private normalizeYaml(yaml: string, _type: string): string {
    return yaml?.trim() || '';
  }

  /**
   * 写入前校验：名称 / 类型 / YAML 非空，本地 YAML 校验，
   * 占位实体 ID 检测，家电模板槽位映射校验。
   * @param body 写入请求体
   * @param mode 持久化模式（import 模式允许 YAML 不完整）
   * @returns 校验结果
   */
  validateBeforeWrite(
    body: TemplateEntityWriteBody,
    mode: TemplatePersistMode = 'user',
  ): { valid: boolean; message: string } {
    const type = String(body.type || '');
    const yaml = String(body.yaml || '');
    if (!body.name?.trim()) return { valid: false, message: '名称不能为空' };
    if (!type) return { valid: false, message: '类型不能为空' };
    if (!yaml.trim()) return { valid: false, message: 'YAML 不能为空' };

    const normalized = this.normalizeYaml(yaml, type);
    const local = validateTemplateYamlLocal(normalized);
    if (!local.valid) return local;

    // import 模式且 yamlComplete=false 时跳过占位符与槽位校验，
    // 允许先落库再由用户补全 configuration.yaml 原文。
    const allowIncomplete = mode === 'import' && body.yamlComplete === false;
    if (!allowIncomplete) {
      const placeholders = findPlaceholderEntityIdsInYaml(normalized);
      if (placeholders.length) {
        return { valid: false, message: `YAML 含占位实体 ID：${placeholders.join(', ')}` };
      }

      const slotMapping = body.slotMapping;
      const mappingPayload = slotMapping
        ? normalizeSlotPayload(slotMapping)
        : { mapping: {}, slotsMeta: [] };
      if (APPLIANCE_TEMPLATE_TYPES.has(type)) {
        const slotCheck = validateApplianceSlotMapping(type, mappingPayload);
        if (!slotCheck.valid) return slotCheck;
      } else if (mappingPayload.mapping && Object.keys(mappingPayload.mapping).length) {
        const slotCheck = validateApplianceSlotMapping(type, mappingPayload);
        if (!slotCheck.valid) return slotCheck;
      }
    }

    return { valid: true, message: '' };
  }
  /**
   * 校验通过后规范化字段、计算 contentHash，准备持久化数据。
   * 校验失败时抛出 BusinessException。
   */
  prepareForPersist(
    body: TemplateEntityWriteBody & Record<string, unknown>,
    mode: TemplatePersistMode = 'user',
  ) {
    const check = this.validateBeforeWrite(body, mode);
    if (!check.valid) throw new BusinessException(ErrorCode.VALIDATION_FAILED, check.message);
    return this.enrichPayload(body);
  }

  /**
   * 规范化字段：trim YAML、规范化槽位映射、计算 contentHash、
   * 填充默认 yamlComplete=true / yamlSource='homeos'。
   */
  private enrichPayload(data: Record<string, unknown>) {
    const type = String(data.type || '');
    const yaml = this.normalizeYaml(String(data.yaml || ''), type);
    const slotMapping = data.slotMapping;
    const normalizedSlots = slotMapping ? normalizeSlotPayload(slotMapping) : undefined;
    return {
      ...data,
      yaml,
      slotMapping:
        normalizedSlots &&
        (Object.keys(normalizedSlots.mapping).length || normalizedSlots.slotsMeta.length)
          ? normalizedSlots
          : undefined,
      contentHash: yaml ? hashContent(yaml) : null,
      yamlComplete: data.yamlComplete ?? true,
      yamlSource: data.yamlSource ?? 'homeos',
    };
  }

  /** 创建模板实体（user 模式） */
  async create(data: Record<string, unknown> | object) {
    const body = data as TemplateEntityWriteBody;
    const payload = this.prepareForPersist(body as Record<string, unknown>, 'user');
    const { slotMapping, ...rest } = payload;
    return this.delegate.create({
      data: {
        ...rest,
        slotMapping: slotMapping as object | undefined,
      },
    });
  }

  /** 从 JSON 配置包导入并创建记录；追加 unit_of_measurement / device_class / icon 等额外字段 */
  async importFromConfigJson(data: {
    name: string;
    type: string;
    yaml: string;
    slotMapping?: TemplateEntityWriteBody['slotMapping'];
    extraUnit?: string;
    extraDeviceClass?: string;
    extraIcon?: string;
  }) {
    let yaml = String(data.yaml || '');
    const extras: string[] = [];
    const inline = (v: string) =>
      String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    if (data.extraUnit) extras.push(`unit_of_measurement: "${inline(data.extraUnit)}"`);
    if (data.extraDeviceClass) extras.push(`device_class: "${inline(data.extraDeviceClass)}"`);
    if (data.extraIcon) extras.push(`icon: "${inline(data.extraIcon)}"`);
    // 仅在 YAML 尚未包含这些字段时追加，避免重复覆盖
    if (
      extras.length &&
      !yaml.includes('unit_of_measurement:') &&
      !yaml.includes('device_class:')
    ) {
      yaml = `${yaml.trim()}\n      ${extras.join('\n      ')}`;
    }
    const inferred = inferTemplateEntityImportMeta(yaml, {
      storedType: data.type,
      entName: data.name,
    });
    return this.create({
      name: data.name,
      type: inferred.type || data.type,
      yaml,
      slotMapping: data.slotMapping ?? inferred.slotMapping,
    });
  }

  /** 更新模板实体；合并已有字段，按 yamlComplete 判定持久化模式 */
  async update(id: string, data: Record<string, unknown> | object) {
    const raw = data as TemplateEntityWriteBody;
    const existing = await this.findOne(id);
    if (!existing)
      throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.TEMPLATE_ENTITY_NOT_FOUND);
    const merged: TemplateEntityWriteBody = {
      name: raw.name ?? existing?.name,
      type: raw.type ?? existing?.type,
      yaml: raw.yaml ?? existing?.yaml,
      slotMapping:
        raw.slotMapping !== undefined
          ? raw.slotMapping
          : ((existing?.slotMapping as Record<string, string> | null) ?? undefined),
      yamlComplete: raw.yamlComplete ?? existing?.yamlComplete,
    };
    const mode: TemplatePersistMode =
      raw.yamlComplete === false || existing?.yamlComplete === false ? 'import' : 'user';
    const payload = this.prepareForPersist(merged as Record<string, unknown>, mode);

    const patch: Record<string, unknown> = { ...raw };
    patch.yaml = payload.yaml;
    patch.contentHash = payload.contentHash;
    if (raw.slotMapping !== undefined) {
      patch.slotMapping = payload.slotMapping;
    }
    // 用户显式修改 YAML 时，恢复 yamlComplete=true 与 yamlSource='homeos'
    if (typeof raw.yaml === 'string') {
      if (raw.yamlComplete == null) patch.yamlComplete = true;
      if (!raw.yamlSource) patch.yamlSource = 'homeos';
    }
    return this.delegate.update({ where: { id }, data: patch });
  }
  /**
   * HA 导入 / 粘贴 YAML 统一落库（含校验、类型与槽位推断）。
   * 通过 upsertOrchestratorFromHaPull 实现"存在则更新、不存在则创建"，
   * 并根据 yamlComplete 决定是否附加补全提示。
   * @param input HA 导入输入
   * @returns 导入结果（success / templateId / message）
   */
  async upsertFromHaImport(input: TemplateEntityHaImportInput): Promise<{
    success: boolean;
    templateId?: string;
    message: string;
  }> {
    const inferred = inferTemplateEntityImportMeta(input.yaml, {
      storedType: input.type,
      uniqueId: input.haConfigId,
      entName: input.name,
    });
    const resolvedType = inferred.type || input.type || 'yaml_import';
    const slotMapping = input.slotMapping ?? inferred.slotMapping;

    const mode: TemplatePersistMode = input.yamlComplete === false ? 'import' : 'user';
    const body: TemplateEntityWriteBody = {
      name: input.name,
      type: resolvedType,
      yaml: input.yaml,
      slotMapping,
      yamlComplete: input.yamlComplete ?? true,
      yamlSource: input.yamlSource,
    };
    const data = this.prepareForPersist(body as Record<string, unknown>, mode);
    const hint = data.yamlComplete
      ? ''
      : '（YAML 不完整：请配置 haConfigDir 或使用「粘贴 YAML 导入」）';

    const rowData = {
      name: input.name,
      type: resolvedType,
      yaml: String(data.yaml),
      slotMapping: data.slotMapping as object | undefined,
      contentHash: data.contentHash as string | null,
      yamlComplete: input.yamlComplete ?? true,
      yamlSource: input.yamlSource || String(data.yamlSource || ''),
      haConfigId: input.haConfigId,
      haEntityId: input.entityId || null,
      haConfigEntryId: input.haConfigEntryId || null,
      haSyncedAt: new Date(),
    };

    const pull = await upsertOrchestratorFromHaPull({
      findExisting: async () =>
        this.prisma.templateEntity.findFirst({ where: { haConfigId: input.haConfigId } }),
      updateExisting: async (id) => {
        await this.prisma.templateEntity.update({ where: { id }, data: rowData });
      },
      createNew: async () =>
        this.prisma.templateEntity.create({ data: rowData }) as Promise<{ id: string }>,
      updatedMessage: `已从 HA 更新本地模板${hint}`,
      importedMessage: `已从 HA 导入模板${hint}`,
    });
    return { success: true, templateId: pull.localId || '', message: pull.message };
  }
}