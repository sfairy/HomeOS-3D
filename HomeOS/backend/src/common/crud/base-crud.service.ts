/**
 * 泛型 CRUD 基类 Service
 *
 * 所属模块：backend/src/common/crud
 * 职责：消除各领域 Service 重复的 findMany/findUnique/create/update/delete 模式，
 *   统一通过注入的 Prisma 委托（Prisma delegate）完成数据库访问。
 * 注入方式：构造时传入 { delegate, modelName } 配置对象（如 super(prisma, { delegate: prisma.scene, modelName: 'scene' })），
 *   基类不再限定可用的模型名单列，任意 Prisma 委托均可复用。
 * 关键依赖：
 *   - PrismaService：注入 Prisma 客户端（子类仍可直接访问其余模型委托）
 *   - business-exception.notFound：抛出标准 404 业务异常
 *   - crud-pagination.util#buildPaginatedResult：组装分页响应结构
 * 钩子体系（子类按需覆盖）：
 *   - listFindArgs：默认列表查询参数
 *   - normalizeWritePayload：写入前规范化（默认原样返回；联动器 geek 图语义由 OrchestratorCrudService 启用）
 *   - applyYamlChangeGraphPolicy：更新时 YAML/图关系策略（默认无操作；联动器语义由 OrchestratorCrudService 启用）
 *   - validateBeforeCreate / validateBeforeUpdate：写入前校验（可变更 payload）
 *   - writeInclude：写入（create/update）返回时的关联装载
 *   - beforeRemove：删除前钩子（存在性校验通过后、委托删除前）
 *   - afterWrite：写入成功后钩子（create/update/remove，可区分操作类型并拿到前后数据）
 *   - notFoundMessage：404 文案定制
 */
import type { PrismaService } from '../../shared/prisma/service';
import { BusinessException, ErrorCode, notFound } from '../utils/business-exception';
import { buildPaginatedResult } from './pagination.util';

/**
 * Prisma 委托类型：定义所有 CRUD 委托共有的方法签名。
 * 以最小化接口约束，避免与 Prisma 自动生成的强类型委托冲突；
 * 字段均为可选参数对象，便于 BaseCrudService 用泛型统一调用。
 */
interface CrudDelegate {
  /** 列表查询：支持 orderBy/where/select/include/skip/take 等过滤参数 */
  findMany(args?: {
    orderBy?: Record<string, string> | Array<Record<string, string>>;
    where?: Record<string, unknown>;
    select?: Record<string, boolean>;
    include?: Record<string, unknown>;
    skip?: number;
    take?: number;
  }): Promise<unknown[]>;
  /** 计数查询：通常配合 findMany 计算 totalPages */
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
  /** 唯一记录查询：以 id 作为主键定位 */
  findUnique(args: {
    where: { id: string };
    select?: Record<string, boolean>;
    include?: Record<string, unknown>;
  }): Promise<unknown | null>;
  /** 新建记录：data 为字段键值集合 */
  create(args: {
    data: Record<string, unknown>;
    include?: Record<string, unknown>;
  }): Promise<unknown>;
  /** 更新数据：先按 id 定位，再写入 data */
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
    include?: Record<string, unknown>;
  }): Promise<unknown>;
  /** 删除单条记录：若不存在会抛 PrismaKnownRequestError */
  delete(args: { where: { id: string } }): Promise<unknown>;
  /** 批量删除：可选方法，对不存在的记录幂等返回而不抛错 */
  deleteMany?(args: { where: { id: string } }): Promise<unknown>;
}

/** BaseCrudService 构造注入配置 */
interface BaseCrudOptions<K extends string = string> {
  /**
   * Prisma 委托实例（如 prisma.scene / prisma.area）。
   * Prisma 7 生成委托与最小结构接口间的完整类型体操不划算，
   * 基类内部单点收窄为 CrudDelegate（子类经构造注入保持精确类型，无需散布 any）。
   */
  delegate: object;
  /** 模型名，用于业务异常文案（如 "scene 不存在"）与配置诊断 */
  modelName: K;
}

/** 写入成功后事件：区分操作类型，携带写入前后数据 */
export interface CrudWriteEvent {
  /** 操作类型 */
  op: 'create' | 'update' | 'remove';
  /** 记录主键（create 为新记录 id；其余为入参 id） */
  id?: string;
  /** 写入前记录快照（update/remove 为存在性校验查询结果；create 为 undefined） */
  before?: unknown;
  /** 委托返回的写入结果 */
  result: unknown;
}

/**
 * 泛型 CRUD 基类：子类通过 `super(prisma, { delegate: prisma.xxx, modelName: 'xxx' })` 注入委托。
 * 泛型参数 K 仅承载模型名标签（供子类声明如 `BaseCrudService<'scene'>` 保持签名可读）。
 */
export class BaseCrudService<K extends string = string> {
  /** Prisma 委托实例，封装实际的数据库操作 */
  protected readonly delegate: CrudDelegate;
  /** 当前模型名，用于业务异常文案（如 "scene 不存在"） */
  private readonly modelName: string;

  /**
   * @param prisma  PrismaService 注入实例（子类可直接访问其余模型委托）
   * @param options delegate + modelName 配置
   * @throws Error 当 delegate 缺失或非对象时抛错，提示配置错误
   */
  constructor(
    protected readonly prisma: PrismaService,
    options: BaseCrudOptions<K>,
  ) {
    if (!options || !options.delegate || typeof options.delegate !== 'object') {
      throw new BusinessException(
        ErrorCode.CONFIG_ERROR,
        `BaseCrudService: Prisma 委托 '${options?.modelName}' 不存在`,
      );
    }
    this.delegate = options.delegate as CrudDelegate;
    this.modelName = options.modelName;
  }

  /**
   * 404 文案钩子：默认 `${modelName} 不存在`。
   * 子类可覆盖为领域专属文案（如 API_ERROR 常量，可按 id 动态生成）。
   */
  protected notFoundMessage(_id: string): string {
    return `${this.modelName} 不存在`;
  }

  /**
   * 默认列表查询参数：按创建时间倒序返回。
   * 子类可覆盖以注入 where/select/include/orderBy 等默认条件。
   * @returns Partial<findMany 参数>
   */
  protected listFindArgs(): NonNullable<Parameters<CrudDelegate['findMany']>[0]> {
    return { orderBy: { createdAt: 'desc' } };
  }

  /**
   * 全量列表查询（不分页）。
   * 调用场景：上层不需要分页时直接返回所有匹配记录。
   * @returns Promise<unknown[]>
   */
  async findAll() {
    return this.delegate.findMany(this.listFindArgs());
  }

  /**
   * 分页列表查询：并行执行 findMany 与 count，组装成分页结构。
   *
   * @param pageNum  页码（从 1 起）
   * @param pageSize 每页条数
   * @param findArgs 可选，覆盖默认 listFindArgs（如追加 where 过滤）
   * @returns CrudPaginatedResult，含 items/total/page/pageSize/totalPages
   */
  async findAllPaginated(
    pageNum: number,
    pageSize: number,
    findArgs?: NonNullable<Parameters<CrudDelegate['findMany']>[0]>,
  ) {
    const resolved = findArgs ?? this.listFindArgs();
    // Promise.all 并行查询数据与总数，降低往返延迟
    const [items, total] = await Promise.all([
      this.delegate.findMany({
        ...resolved,
        // 跳过：计算偏移量，take 限制单页大小
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      // count 只需要 where，剥离 orderBy/select 等无关参数
      this.delegate.count(resolved.where ? { where: resolved.where } : undefined),
    ]);
    return buildPaginatedResult(items, total, pageNum, pageSize);
  }

  /**
   * 按主键查询单条记录。
   * @param id 主键字符串
   * @returns Promise<unknown | null>，未找到返回 null
   */
  async findOne(id: string) {
    return this.delegate.findUnique({ where: { id } });
  }

  /**
   * 写入前规范化钩子（create/update 均调用，位于委托写入之前）。
   * 默认实现：原样返回（无领域通用语义）。
   * 联动器域的 geek 图规范化（geekGraph：null → DbNull，对象 → Json）
   * 由 OrchestratorCrudService 启用；其余子类可自行覆盖。
   */
  protected normalizeWritePayload(payload: Record<string, unknown>): Record<string, unknown> {
    return payload;
  }

  /**
   * 更新写入钩子（仅 update 调用）：处理领域特定的字段联动策略。
   * 默认无操作；联动器域（automation/script）覆盖为「仅变更 yaml、未显式传图时清空 geekGraph」
   * ——该语义由 OrchestratorCrudService 启用，scene 覆盖为保留库内原图。
   */
  protected applyYamlChangeGraphPolicy(_payload: Record<string, unknown>): void {}

  /**
   * 写入返回关联装载钩子（create/update 调用）。
   * 默认不装载；子类可覆盖以在写入后一并返回关联数据（如 area.entities）。
   */
  protected writeInclude(_op: 'create' | 'update'): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * 写入前校验钩子（create 时调用，位于规范化之后、委托写入之前）。默认无操作。
   * 子类可覆盖做域校验并就地补充/变更 payload（如 automation 引擎支持性校验、area 默认值与排序）。
   */
  protected async validateBeforeCreate(_payload: Record<string, unknown>): Promise<void> {}

  /**
   * 写入前校验钩子（update 时调用，位于规范化之后、委托写入之前）。默认无操作。
   * 子类可覆盖做域校验并就地补充/变更 payload。
   */
  protected async validateBeforeUpdate(
    _payload: Record<string, unknown>,
    _id: string,
  ): Promise<void> {}

  /**
   * 删除前钩子（存在性校验通过后、委托删除前调用）。默认无操作。
   * 子类可覆盖以执行删除前置动作（如 home-mode 删除激活中模式前先 deactivate）。
   */
  protected async beforeRemove(_id: string, _existing: unknown): Promise<void> {}

  /**
   * 写入成功后钩子（create/update/remove 均调用，位于委托写入成功之后）。
   * 默认无操作；子类可覆盖以承载副作用（事件发布、缓存刷新、日志等）。
   * 钩子抛错会向上传播，副作用应自行兜底，避免影响主流程响应。
   */
  protected async afterWrite(_event: CrudWriteEvent): Promise<void> {}

  /** 从写入结果中安全提取主键（供 afterWrite 事件使用） */
  private readResultId(result: unknown): string | undefined {
    const id = (result as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string' ? id : undefined;
  }

  /**
   * 新建记录。
   * @param data 字段键值集合
   * @returns Promise<unknown> 新建后的记录
   */
  async create(data: Record<string, unknown> | object) {
    const payload = this.normalizeWritePayload({
      ...(data as Record<string, unknown>),
    });
    await this.validateBeforeCreate(payload);
    const result = await this.delegate.create({
      data: payload,
      include: this.writeInclude('create'),
    });
    await this.afterWrite({
      op: 'create',
      id: this.readResultId(result),
      result,
    });
    return result;
  }

  /**
   * 更新实体：先校验存在性，再写入。
   * @param id   主键
   * @param data 待更新字段集合
   * @throws NotFoundError 实体不存在时抛业务 404
   * @returns Promise<unknown> 更新后的实体
   */
  async update(id: string, data: Record<string, unknown> | object) {
    const payload = this.normalizeWritePayload({
      ...(data as Record<string, unknown>),
    });
    this.applyYamlChangeGraphPolicy(payload);
    await this.validateBeforeUpdate(payload, id);
    const existing = await this.delegate.findUnique({ where: { id } });
    if (!existing) notFound(this.notFoundMessage(id));
    const result = await this.delegate.update({
      where: { id },
      data: payload,
      include: this.writeInclude('update'),
    });
    await this.afterWrite({ op: 'update', id, before: existing, result });
    return result;
  }

  /**
   * 删除记录：先校验存在性，再删除。
   *
   * 优先调用 deleteMany 而非 delete：
   * deleteMany 忽略不存在的记录，避免并发场景下的 PrismaKnownRequestError。
   * 例：removeFromHA 期间 HA WebSocket 事件可能异步清理了 DB 记录，
   * 此时同步删除会因记录已不存在而抛错，deleteMany 可安全吞掉该异常。
   *
   * @param id 主键
   * @throws NotFoundError 记录不存在时抛业务 404
   * @returns Promise<unknown> 删除结果
   */
  async remove(id: string) {
    const existing = await this.delegate.findUnique({ where: { id } });
    if (!existing) notFound(this.notFoundMessage(id));
    await this.beforeRemove(id, existing);
    // deleteMany 忽略不存在的记录，避免并发场景下的 PrismaKnownRequestError
    // 例：removeFromHA 期间 HA WebSocket 事件可能异步清理了 DB 记录
    const result = this.delegate.deleteMany
      ? await this.delegate.deleteMany({ where: { id } })
      : await this.delegate.delete({ where: { id } });
    const deletedCount =
      result && typeof result === 'object' && 'count' in result
        ? Number((result as { count: unknown }).count)
        : 1;
    // 并发删除已清空记录时不再 afterWrite，避免重复广播
    if (deletedCount !== 0) {
      await this.afterWrite({ op: 'remove', id, before: existing, result });
    }
    return result;
  }
}
