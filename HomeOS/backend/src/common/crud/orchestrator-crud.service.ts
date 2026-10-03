/**
 * 所属模块：backend/common/crud
 * 职责：
 *  - 编排域 CRUD 抽象基类（scene/automation/script/template 共享）；
 * 关键依赖：
 *  - PrismaModule、OrchestratorDomainHaSyncFactory；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Logger } from '@nestjs/common';
import { BusinessException, ErrorCode } from '../utils/business-exception';
import { BaseCrudService } from './base-crud.service';
import { normalizeGeekGraphInput } from '../../shared/orchestrator/geek-graph-input.util';
import { Prisma } from '../../generated/prisma/client';
import {
  installYamlBuiltinTemplate,
  installSceneBuiltinTemplate,
  type YamlBuiltinTemplate,
  type SceneBuiltinTemplate,
} from '../../shared/orchestrator/builtin-install.util';
import {
  summarizeYamlBuiltinTemplate,
  summarizeSceneBuiltinTemplate,
  type BuiltinTemplateListItem,
} from '@homeos/shared';
import {
  recordExecution as recordExecutionRow,
  getExecutionHistory as readExecutionHistory,
  clearExecutionHistory as deleteExecutionHistory,
  buildExecutionHistoryMapper,
} from '../../shared/orchestrator/execution-history-helper.util';

/** 执行历史委托：Prisma 执行历史模型的最小结构约束 */
interface ExecutionHistoryDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  findMany(args: { orderBy: { executedAt: 'desc' }; take: number }): Promise<unknown[]>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

/** 执行历史配置（delegate + label + maxHistory 参数化） */
export interface ExecutionHistoryConfig {
  delegate: ExecutionHistoryDelegate;
  /** 日志标签（如 "场景" / "脚本"） */
  label: string;
  /** 历史保留条数上限（超过自动裁剪） */
  maxHistory: number;
}

/** 内置模板配置：yaml 型（automation/script）与 scene 型二选一 */
export type BuiltinTemplateConfig =
  | {
      kind: 'yaml';
      templates: YamlBuiltinTemplate[];
      notFoundMessage: string;
      /** 从模板创建实体记录（内部需构建 geekGraph 并处理域特有字段） */
      createFromTemplate: (template: YamlBuiltinTemplate) => Promise<{
        id: string;
        yaml?: string;
      }>;
      /** 导出时附加字段（yaml 型默认无） */
      exportExtra?: (template: YamlBuiltinTemplate) => Record<string, unknown>;
    }
  | {
      kind: 'scene';
      templates: SceneBuiltinTemplate[];
      notFoundMessage: string;
      createFromTemplate: (template: SceneBuiltinTemplate) => Promise<{
        id: string;
        entities?: unknown;
      }>;
      exportExtra?: (template: SceneBuiltinTemplate) => Record<string, unknown>;
    };

export abstract class OrchestratorCrudService<
  K extends string = string,
> extends BaseCrudService<K> {
  /** 日志实例（以运行时类名作为上下文，与子类各自 new Logger(Xxx.name) 等价） */
  protected readonly logger = new Logger(this.constructor.name);

  /**
   * 写入前规范化（联动器域默认）：规范 geek 图字段（geekGraph：null → DbNull，对象 → Json）。
   * scene 覆盖为 geekSceneGraph 字段并叠加 entities / YAML 持久化规范化。
   */
  protected override normalizeWritePayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return normalizeGeekGraphInput(payload);
  }

  /**
   * 更新写入钩子（联动器域默认）：仅变更 yaml、未显式传图时，
   * 视为 YAML 覆盖图 → 清空为 DbNull（automation/script 语义）。
   * scene 覆盖为保留库内原图（未传 geekSceneGraph 时不清空）。
   */
  protected override applyYamlChangeGraphPolicy(payload: Record<string, unknown>): void {
    if (
      Object.prototype.hasOwnProperty.call(payload, 'yaml') &&
      !Object.prototype.hasOwnProperty.call(payload, 'geekGraph')
    ) {
      payload.geekGraph = Prisma.DbNull;
    }
  }

  /**
   * 内置模板配置（子类覆盖）。
   * @throws 未配置模板的域调用内置模板方法时抛错
   */
  protected builtinTemplateConfig(): BuiltinTemplateConfig {
    throw new BusinessException(
      ErrorCode.CONFIG_ERROR,
      `${this.constructor.name}: 未配置内置模板`,
    );
  }

  /**
   * 执行历史配置（子类覆盖；无执行历史的域无需覆盖）。
   * @throws 未配置执行历史的域调用执行历史方法时抛错
   */
  protected executionHistoryConfig(): ExecutionHistoryConfig {
    throw new BusinessException(
      ErrorCode.CONFIG_ERROR,
      `${this.constructor.name}: 未配置执行历史`,
    );
  }

  /** 图字段名（automation/script 为 geekGraph；scene 覆盖为 geekSceneGraph） */
  protected graphField(): Record<string, boolean> {
    return { geekGraph: true };
  }

  /** 列表查询字段骨架：id/name/yaml/图字段/HA 元信息/时间戳 */
  protected listSelect(): Record<string, boolean> {
    return {
      ...this.graphField(),
      id: true,
      name: true,
      yaml: true,
      haConfigId: true,
      runOnHa: true,
      haSyncedAt: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  /** 列表查询参数（按创建时间倒序 + select 骨架） */
  protected listFindArgs() {
    return { orderBy: { createdAt: 'desc' as const }, select: this.listSelect() };
  }

  /**
   * 获取内置模板列表（摘要信息）。
   * yaml 型经 summarizeYamlBuiltinTemplate，scene 型经 summarizeSceneBuiltinTemplate。
   */
  getBuiltinTemplates(): BuiltinTemplateListItem[] {
    const cfg = this.builtinTemplateConfig();
    if (cfg.kind === 'yaml') {
      return cfg.templates.map((t) => summarizeYamlBuiltinTemplate(t));
    }
    return cfg.templates.map((t) =>
      summarizeSceneBuiltinTemplate({
        id: t.id,
        name: t.name,
        description: t.description,
        entities: t.entities as string | unknown[],
      }),
    );
  }

  /**
   * 导出内置模板完整数据（含导出附加字段），供「模板市场」分享导出使用。
   * 不修改内置模板源数据；返回浅拷贝副本（与既有实现一致）。
   */
  exportBuiltinTemplatesRaw(): unknown[] {
    const cfg = this.builtinTemplateConfig();
    if (cfg.kind === 'yaml') {
      return cfg.templates.map((t) => ({
        ...t,
        ...(cfg.exportExtra ? cfg.exportExtra(t) : {}),
      }));
    }
    return cfg.templates.map((t) => ({
      ...t,
      ...(cfg.exportExtra ? cfg.exportExtra(t) : {}),
    }));
  }

  /**
   * 安装内置模板（创建实体记录）。
   * yaml 型经 installYamlBuiltinTemplate（占位符从 YAML 扫描），
   * scene 型经 installSceneBuiltinTemplate（占位符从 entities 扫描）。
   * @param templateId 模板 ID
   * @throws BusinessException 模板不存在
   */
  async installBuiltinTemplate(templateId: string) {
    const cfg = this.builtinTemplateConfig();
    if (cfg.kind === 'yaml') {
      return installYamlBuiltinTemplate(
        cfg.templates,
        templateId,
        cfg.notFoundMessage,
        cfg.createFromTemplate,
      );
    }
    return installSceneBuiltinTemplate(
      cfg.templates,
      templateId,
      cfg.notFoundMessage,
      cfg.createFromTemplate,
    );
  }

  /**
   * 异步记录一次执行结果（后台写入 + 自动裁剪）。
   * @param input 执行结果摘要（entityId/entityName 由调用方映射）
   * @param errors 失败动作的错误列表
   * @param extraFields 关联实体附加字段（如 {sceneId, sceneName}）
   */
  protected recordExecution(
    input: {
      entityId: string;
      entityName: string;
      success: boolean;
      executed: number;
      total: number;
    },
    errors: string[],
    extraFields?: Record<string, unknown>,
  ) {
    const cfg = this.executionHistoryConfig();
    recordExecutionRow(
      cfg.delegate,
      this.logger,
      cfg.label,
      cfg.maxHistory,
      input,
      errors,
      extraFields,
    );
  }

  /**
   * 获取执行历史（以数据库为唯一数据源）。
   * 泛型 TExtra 用于声明执行记录的域附加字段（如 {sceneId, sceneName}）。
   * @param limit 返回条数上限（缺省为 maxHistory）
   */
  async getExecutionHistory<TExtra = Record<string, never>>(
    limit?: number,
    where?: Record<string, unknown>,
  ) {
    const cfg = this.executionHistoryConfig();
    return readExecutionHistory(
      cfg.delegate,
      this.logger,
      cfg.label,
      limit ?? cfg.maxHistory,
      cfg.maxHistory,
      buildExecutionHistoryMapper<TExtra>(),
      where,
    );
  }

  /** 清空执行历史。 */
  async clearExecutionHistory(): Promise<{ deleted: number }> {
    return deleteExecutionHistory(this.executionHistoryConfig().delegate);
  }
}
