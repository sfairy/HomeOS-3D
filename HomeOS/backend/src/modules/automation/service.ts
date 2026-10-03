/**
 * 自动化服务。
 *
 * 所属模块：backend/modules/automation
 * 职责：管理 Home Assistant 自动化规则的 CRUD 操作。
 *  自动化规则以 YAML 格式存储，可被 HA 执行引擎解析和运行。
 *
 * 功能：
 * - 基础 CRUD 操作（继承自 OrchestratorCrudService）
 * - 启用/禁用自动化
 * - 内置模板管理（提供常用自动化模板）
 * - geekGraph 与 YAML 互转（画布模式 ↔ YAML 模式）
 * - 占位符扫描与替换（未替换占位符的规则不会被同步到 HA）
 *
 * 内置模板包括：
 * - 午夜自动关灯
 * - 离家自动节能
 * - 人来灯亮
 * - 漏水保护
 * - 日落关窗帘
 * - 晚安模式
 * - 开窗关空调、高温开窗提醒、车库门未关提醒、定时浇花、暴雨关窗、雷暴通知、
 *   烟感紧急联动、回家欢迎、进入家区域、燃气泄漏紧急联动、高湿除湿、定时清扫
 * - 画布（geek）模板：人在且昏暗开灯、变量限次通知、最多执行 N 次、
 *   先开门后有人、设备触发→写变量
 * - 能源相关：低谷启动大功率设备、高峰关断非关键设备、总功率超限保护
 *
 * 关键依赖：PrismaService（DB）、@homeos/shared（YAML 解析与审计）、
 *  OrchestratorCrudService（通用 CRUD + 占位符替换基类）、builtin-templates.data。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import {
  OrchestratorCrudService,
  type BuiltinTemplateConfig,
} from '../../common/crud/orchestrator-crud.service';
import { BusinessException, ErrorCode } from '../../common/utils';
import {
  parseAutomationYamlCore,
  auditAutomationEngineSupport,
  findReplaceableEntityIdsInYaml,
  yamlContainsHomeosExtensions,
} from '@homeos/shared';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { buildAutomationGeekGraphFromYaml } from '../../shared/orchestrator/builtin-geek-graph.util';
import { AUTOMATION_BUILTIN_TEMPLATES } from './builtin-templates.data';
import { badRequest } from '../../common/utils/business-exception';

@Injectable()
/**
 * AutomationService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class AutomationService
 */
export class AutomationService extends OrchestratorCrudService<'automation'> {
  constructor(prisma: PrismaService) {
    super(prisma, { delegate: prisma.automation, modelName: 'automation' });
  }

  protected override listFindArgs() {
    return {
      orderBy: { createdAt: 'desc' as const },
      select: { ...this.listSelect(), enabled: true },
    };
  }

  /**
   * 本地引擎保存硬校验：runOnHa=false 时拒绝会被静默丢弃/无法执行的 mqtt/webhook/device 等。
   */
  private assertLocalEngineSupported(yaml: string, name: string) {
    const warnings: string[] = [];
    const parsed = parseAutomationYamlCore(yaml, name, (msg) => warnings.push(msg));
    if (!parsed) {
      if (warnings.length) {
        throw new BusinessException(
          ErrorCode.VALIDATION_FAILED,
          API_ERROR.AUTOMATION_LOCAL_UNSUPPORTED(warnings.join('; ')),
        );
      }
      return;
    }
    auditAutomationEngineSupport(
      parsed.core.name || name,
      parsed.core.triggers,
      parsed.core.conditions,
      parsed.rawActionCount,
      parsed.core.actions,
      (msg) => warnings.push(msg),
    );
    if (warnings.length) {
      throw new BusinessException(
        ErrorCode.VALIDATION_FAILED,
        API_ERROR.AUTOMATION_LOCAL_UNSUPPORTED(warnings.join('; ')),
      );
    }
  }

  private async assertLocalSaveAllowed(payload: Record<string, unknown>, existingId?: string) {
    let runOnHa = payload.runOnHa;
    let yaml = payload.yaml;
    let name = payload.name;

    if (existingId) {
      const existing = (await this.findOne(existingId)) as Record<string, unknown> | null;
      if (!existing) throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.AUTOMATION_NOT_FOUND);
      if (runOnHa === undefined) runOnHa = existing.runOnHa;
      if (yaml === undefined) yaml = existing.yaml;
      if (name === undefined) name = existing.name;
    }

    if (runOnHa === true) {
      if (typeof yaml === 'string' && yamlContainsHomeosExtensions(yaml)) {
        throw new BusinessException(
          ErrorCode.VALIDATION_FAILED,
          API_ERROR.AUTOMATION_RUN_ON_HA_HOMEOS_EXTENSIONS,
        );
      }
      return;
    }
    if (typeof yaml !== 'string' || !yaml.trim()) return;
    this.assertLocalEngineSupported(yaml, String(name || 'automation'));
  }

  /**
   * 占位符/启用状态统一解析：
   *  规则：目标状态 enabled=true 且 YAML 含占位实体 →
   *    - 若用户「显式」传入 enabled=true（非默认）：抛出 ORCHESTRATOR_PLACEHOLDERS_PENDING
   *    - 若 enabled 为默认值（create 默认 true / update 继承 enabled=true）：静默强制 disabled
   *  目标状态 enabled=false / 无占位符：不做处理
   *
   * @param yaml         当前 YAML（create 或更新后的 YAML）
   * @param explicitEnabled  调用方传入的 enabled（未传时为 undefined）
   * @param currentEnabled   当前 enabled（create 时为 undefined；update/toggle 时为 DB 现状）
   * @returns 解析后的最终 enabled 值；当返回 undefined 表示调用方维持现状
   */
  private resolveEnabledWithPlaceholders(opts: {
    yaml: unknown;
    explicitEnabled?: unknown;
    currentEnabled?: unknown;
  }): boolean | undefined {
    const hasPlaceholders =
      typeof opts.yaml === 'string' &&
      opts.yaml.trim() !== '' &&
      findReplaceableEntityIdsInYaml(opts.yaml).length > 0;
    if (!hasPlaceholders) {
      // 无占位符：显式/默认保持不变，仅当显式=false 时透传
      return opts.explicitEnabled === undefined ? undefined : Boolean(opts.explicitEnabled);
    }
    // 有占位符：
    // 1) 显式要求启用 → 拒绝（用户明确点了启用，不应被静默吞掉）
    if (opts.explicitEnabled === true) {
      badRequest(API_ERROR.ORCHESTRATOR_PLACEHOLDERS_PENDING);
    }
    // 2) 显式禁用 → OK，遵从
    if (opts.explicitEnabled === false) return false;
    // 3) 未显式指定：目标若为 true（默认 / 继承） → 自动强制禁用
    const target =
      opts.currentEnabled === undefined ? true : Boolean(opts.currentEnabled);
    if (target) return false;
    return false;
  }

  /**
   * 写入前校验钩子（create）：本地引擎支持性校验 + 占位实体统一解析。
   * 基类 create 已在规范化后调用本钩子，再执行委托写入。
   */
  override async validateBeforeCreate(payload: Record<string, unknown>): Promise<void> {
    await this.assertLocalSaveAllowed(payload);
    const resolved = this.resolveEnabledWithPlaceholders({
      yaml: payload.yaml,
      explicitEnabled: payload.enabled,
      // create 时 currentEnabled 未定义 → 默认目标为 true
    });
    if (resolved !== undefined) payload.enabled = resolved;
  }

  /**
   * 写入前校验钩子（update）：本地引擎支持性校验 + 占位实体统一解析。
   * 基类 update 已在规范化 + YAML 清图策略后调用本钩子，再执行存在性校验与委托写入。
   */
  override async validateBeforeUpdate(
    payload: Record<string, unknown>,
    id: string,
  ): Promise<void> {
    await this.assertLocalSaveAllowed(payload, id);
    const existing = (await this.findOne(id)) as Record<string, unknown> | null;
    const yaml = payload.yaml !== undefined ? payload.yaml : existing?.yaml;
    const resolved = this.resolveEnabledWithPlaceholders({
      yaml,
      explicitEnabled: payload.enabled,
      currentEnabled: existing?.enabled,
    });
    if (resolved !== undefined) payload.enabled = resolved;
  }

  /**
   * 删除自动化：先删规则（含 HA 同步），成功后再清理本规则变量。
   * 原「先删变量再删规则」在规则删除失败时会造成变量数据丢失；
   * 改为后清理后，失败仅残留无害孤儿变量（ruleId 已无对应规则，不可见）。
   */
  override async remove(id: string) {
    const result = await super.remove(id);
    await this.prisma.automationVariable.deleteMany({
      where: { scope: 'rule', ruleId: id },
    });
    return result;
  }

  /**
   * 切换自动化启用状态
   * @param id - 自动化 ID
   * @returns 更新后的自动化对象
   */
  async toggle(id: string) {
    const existing: Record<string, unknown> | null = (await this.findOne(id)) as Record<
      string,
      unknown
    > | null;
    if (!existing) throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.AUTOMATION_NOT_FOUND);
    const nextEnabled = !existing.enabled;
    // 复用统一占位符解析（显式要求启用=!existing.enabled）
    const resolved = this.resolveEnabledWithPlaceholders({
      yaml: existing.yaml,
      explicitEnabled: nextEnabled,
      currentEnabled: Boolean(existing.enabled),
    });
    const finalEnabled = resolved !== undefined ? resolved : nextEnabled;
    return this.delegate.update({ where: { id }, data: { enabled: finalEnabled } });
  }

  /**
   * 设置自动化启用状态（批量启停复用；启用前校验占位实体，与 toggle 一致）
   * @param id - 自动化 ID
   * @param enabled - 目标启用状态
   * @returns 更新后的自动化对象；记录不存在返回 null
   */
  async setEnabled(id: string, enabled: boolean) {
    const existing: Record<string, unknown> | null = (await this.findOne(id)) as Record<
      string,
      unknown
    > | null;
    if (!existing) return null;
    const resolved = this.resolveEnabledWithPlaceholders({
      yaml: existing.yaml,
      explicitEnabled: enabled,
      currentEnabled: Boolean(existing.enabled),
    });
    const finalEnabled = resolved !== undefined ? resolved : enabled;
    return this.delegate.update({ where: { id }, data: { enabled: finalEnabled } });
  }

  /**
   * 批量设置自动化启用状态：
   *  - 启用前统一校验占位实体（任一不合格则全部回滚，不做部分更新）
   *  - 使用 Prisma 事务保证所有 enabled 字段更新原子性
   *  - 返回 { succeeded, failed, rows } 供上层再做 HA 同步
   */
  async setEnabledBatch(
    ids: string[],
    enabled: boolean,
  ): Promise<{
    succeeded: string[];
    failed: string[];
    rows: Array<{ id: string; enabled?: boolean; yaml?: string; runOnHa?: boolean }>;
  }> {
    const idList = Array.isArray(ids)
      ? ids.filter((x) => typeof x === 'string' && x.trim() !== '')
      : [];
    if (idList.length === 0) {
      return { succeeded: [], failed: [], rows: [] };
    }
    // 1) 预查询：存在性 + 占位符统一解析（任一抛错 → 整体回滚）
    const existingList = (await this.delegate.findMany({
      where: { id: { in: idList } },
      select: {
        id: true,
        yaml: true,
        enabled: true,
        runOnHa: true,
      },
      take: idList.length,
    })) as Array<{ id: string; yaml?: string; enabled?: boolean; runOnHa?: boolean }>;
    const existMap = new Map(existingList.map((r) => [r.id, r]));
    const failed: string[] = [];
    for (const id of idList) {
      const row = existMap.get(id);
      if (!row) {
        failed.push(id);
        continue;
      }
      // 统一解析：若包含占位且显式=true 则在此抛 badRequest，整体中止
      this.resolveEnabledWithPlaceholders({
        yaml: row.yaml,
        explicitEnabled: enabled,
        currentEnabled: Boolean(row.enabled),
      });
    }
    // 2) 事务内批量 updateMany 更新 enabled 字段
    const updateIds = idList.filter((id) => existMap.has(id));
    const updatedRows: typeof existingList = [];
    if (updateIds.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.automation.updateMany({
          where: { id: { in: updateIds } },
          data: { enabled },
        });
        const r = await tx.automation.findMany({
          where: { id: { in: updateIds } },
          select: { id: true, yaml: true, enabled: true, runOnHa: true },
          take: updateIds.length,
        });
        updatedRows.push(...r);
      });
    }
    const succeeded = updatedRows.map((r) => r.id);
    for (const id of idList) {
      if (!succeeded.includes(id) && !failed.includes(id)) failed.push(id);
    }
    return { succeeded, failed, rows: updatedRows };
  }

  /**
   * 内置模板配置（yaml 型）：数据源 + 安装回调。
   * 安装时经 buildAutomationGeekGraphFromYaml 生成画布图，
   * 并依据占位实体情况决定默认启用状态。
   */
  protected builtinTemplateConfig(): BuiltinTemplateConfig {
    return {
      kind: 'yaml',
      templates: AUTOMATION_BUILTIN_TEMPLATES,
      notFoundMessage: API_ERROR.AUTOMATION_BUILTIN_TEMPLATE_NOT_FOUND,
      createFromTemplate: (template) => {
        const geekGraph =
          template.geekGraph ||
          buildAutomationGeekGraphFromYaml(template.name, template.yaml);
        return this.create({
          name: template.name,
          yaml: template.yaml,
          // 内置模板几乎都含占位实体：安装后默认禁用，映射完成再启用
          enabled: findReplaceableEntityIdsInYaml(template.yaml).length === 0,
          ...(geekGraph ? { geekGraph } : {}),
        }) as Promise<{ id: string; name: string; yaml?: string }>;
      },
    };
  }
}
