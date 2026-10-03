/**
 * 自动化持久变量服务。
 *
 * 所属模块：backend/modules/automation
 * 职责：自动化变量的 CRUD 与读写值（global / rule 两种 scope），
 *  变更时发出 homeos.var_changed 事件，供触发器、条件、动作订阅。
 *  继承 BaseCrudService（注入 automationVariable delegate）复用通用 CRUD：
 *  update 经基类流程承载（值变更后经 afterWrite 广播 var_changed），create/remove 保留
 *  既有错误语义（唯一键冲突转 400 / 响应 { ok: true }）。
 * 关键依赖：PrismaService、EventEmitter2、BaseCrudService。
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { notFound, badRequest, rethrowIfHttpException } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { BaseCrudService, type CrudWriteEvent } from '../../common/crud/base-crud.service';
import type { AutomationVariable } from '../../generated/prisma/client';

type AutomationVarScope = 'global' | 'rule';
type AutomationVarType = 'number' | 'string';

interface CreateAutomationVariableInput {
  key: string;
  name: string;
  scope?: AutomationVarScope;
  ruleId?: string | null;
  type?: AutomationVarType;
  value?: string | number;
}

interface SetAutomationVariableInput {
  key: string;
  scope?: AutomationVarScope;
  ruleId?: string | null;
  op?: 'set' | 'add' | 'concat';
  value?: string | number;
  type?: AutomationVarType;
}

const KEY_RE = /^[a-zA-Z0-9_]+$/;

@Injectable()
/**
 * AutomationVariableService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class AutomationVariableService
 */
export class AutomationVariableService extends BaseCrudService<'automationVariable'> {
  private readonly logger = new Logger(AutomationVariableService.name);

  constructor(
    prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(prisma, { delegate: prisma.automationVariable, modelName: 'automationVariable' });
  }

  /** 404 文案：保持既有「变量不存在」 */
  protected override notFoundMessage(): string {
    return API_ERROR.AUTOMATION_VARIABLE_NOT_FOUND;
  }

  list(opts?: { scope?: string; ruleId?: string | null; take?: number }) {
    const where: Record<string, unknown> = {};
    if (opts?.scope) where.scope = opts.scope;
    if (opts?.ruleId !== undefined) where.ruleId = opts.ruleId || null;
    const rawTake = Number(opts?.take);
    const take = Number.isFinite(rawTake) && rawTake > 0 ? Math.min(Math.floor(rawTake), 500) : 500;
    return this.prisma.automationVariable.findMany({
      where,
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
      take,
    });
  }

  async getById(id: string) {
    const row = await this.prisma.automationVariable.findUnique({ where: { id } });
    if (!row) notFound(API_ERROR.AUTOMATION_VARIABLE_NOT_FOUND);
    return row;
  }

  async findByKey(key: string, scope: AutomationVarScope = 'global', ruleId?: string | null) {
    return this.prisma.automationVariable.findFirst({
      where: {
        key,
        scope,
        ruleId: scope === 'rule' ? ruleId || null : null,
      },
    });
  }

  /** 新建前载荷整理：key/scope/type/ruleId 规范化与校验、value 类型转换、name 兜底 */
  protected override async validateBeforeCreate(payload: Record<string, unknown>): Promise<void> {
    const key = String(payload.key || '').trim();
    if (!KEY_RE.test(key)) {
      badRequest(API_ERROR.AUTOMATION_VARIABLE_KEY_INVALID);
    }
    const scope: AutomationVarScope = payload.scope === 'rule' ? 'rule' : 'global';
    const type: AutomationVarType = payload.type === 'number' ? 'number' : 'string';
    const ruleId = scope === 'rule' ? String(payload.ruleId || '').trim() : null;
    if (scope === 'rule' && !ruleId) {
      badRequest(API_ERROR.AUTOMATION_VARIABLE_RULE_ID_REQUIRED);
    }
    payload.key = key;
    payload.name = String(payload.name || key).trim() || key;
    payload.scope = scope;
    payload.ruleId = ruleId;
    payload.type = type;
    payload.value = this.normalizeValue(
      (payload.value as string | number) ?? (type === 'number' ? '0' : ''),
      type,
    );
  }

  override async create(input: CreateAutomationVariableInput): Promise<AutomationVariable> {
    try {
      return (await super.create(input)) as AutomationVariable;
    } catch (e) {
      // 业务校验异常（key/规则 ID 等）原样上抛；仅落库失败（如唯一键冲突）转 400
      rethrowIfHttpException(e);
      this.logger.warn(`创建变量失败 key=${String(input?.key || '').trim()}`, e);
      badRequest(API_ERROR.AUTOMATION_VARIABLE_CREATE_FAILED);
    }
  }

  /** 更新前载荷整理：按当前行解析写入类型，name trim 兜底、value 类型转换 */
  protected override async validateBeforeUpdate(
    payload: Record<string, unknown>,
    id: string,
  ): Promise<void> {
    const row = (await this.prisma.automationVariable.findUnique({
      where: { id },
    })) as { name: string; type: string } | null;
    if (!row) notFound(API_ERROR.AUTOMATION_VARIABLE_NOT_FOUND);
    const type: AutomationVarType =
      payload.type === 'number' || payload.type === 'string'
        ? payload.type
        : (row.type as AutomationVarType);
    if (payload.name != null) payload.name = String(payload.name).trim() || row.name;
    if (payload.type != null) payload.type = type;
    if (payload.value !== undefined) {
      payload.value = this.normalizeValue(payload.value as string | number, type);
    }
  }

  /** 只写入 name/value/type，避免客户端改掉 key/scope/ruleId */
  override async update(id: string, data: Record<string, unknown> | object) {
    const body = data as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    if ('name' in body) payload.name = body.name;
    if ('type' in body) payload.type = body.type;
    if ('value' in body) payload.value = body.value;
    return super.update(id, payload);
  }

  /** 更新成功且值变化后广播 homeos.var_changed（create/remove 不广播，保持既有语义） */
  protected override async afterWrite(event: CrudWriteEvent): Promise<void> {
    if (event.op !== 'update') return;
    const before = event.before as { value?: string } | undefined;
    const updated = event.result as AutomationVariable;
    if (before && before.value !== updated.value) {
      this.emitChanged(updated);
    }
  }

  override async remove(id: string): Promise<{ ok: boolean }> {
    await super.remove(id);
    return { ok: true };
  }

  async setValue(input: SetAutomationVariableInput) {
    const scope: AutomationVarScope = input.scope === 'rule' ? 'rule' : 'global';
    const ruleId = scope === 'rule' ? input.ruleId || null : null;
    const row = await this.findByKey(input.key, scope, ruleId);
    if (!row) notFound(API_ERROR.AUTOMATION_VARIABLE_NOT_FOUND_BY_KEY(input.key));
    const op = input.op || 'set';
    const type = this.resolveWriteType(input.type, op, row.type as AutomationVarType, input.value);

    // 数值 add：SQL 原子累加，避免并发自动化丢更新
    if (op === 'add' && type === 'number') {
      const delta = Number(input.value || 0);
      if (!Number.isFinite(delta)) {
        badRequest(API_ERROR.AUTOMATION_VARIABLE_ADD_INVALID_NUMBER);
      }
      await this.prisma.$executeRaw`
        UPDATE "AutomationVariable"
        SET
          value = (COALESCE(NULLIF(value, '')::double precision, 0) + ${delta})::text,
          type = 'number',
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${row.id}
      `;
      const updated = await this.prisma.automationVariable.findUniqueOrThrow({
        where: { id: row.id },
      });
      this.emitChanged(updated);
      return updated;
    }

    // 文本 concat：SQL 原子拼接，避免并发自动化丢后缀
    if (op === 'concat') {
      const suffix = String(input.value ?? '');
      await this.prisma.$executeRaw`
        UPDATE "AutomationVariable"
        SET
          value = COALESCE(value, '') || ${suffix},
          type = 'string',
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${row.id}
      `;
      const updated = await this.prisma.automationVariable.findUniqueOrThrow({
        where: { id: row.id },
      });
      this.emitChanged(updated);
      return updated;
    }
    const next = this.normalizeValue(input.value ?? '', type);
    const updated = await this.prisma.automationVariable.update({
      where: { id: row.id },
      data: { value: next, type },
    });
    this.emitChanged(updated);
    return updated;
  }

  /** 引擎动作：不存在则创建 */
  async upsertSet(input: SetAutomationVariableInput & { name?: string }) {
    const scope: AutomationVarScope = input.scope === 'rule' ? 'rule' : 'global';
    const ruleId = scope === 'rule' ? input.ruleId || null : null;
    const existing = await this.findByKey(input.key, scope, ruleId);
    if (!existing) {
      const op = input.op || 'set';
      const type = this.resolveWriteType(input.type, op, undefined, input.value);
      let value = input.value ?? (type === 'number' ? 0 : '');
      // 首次 add：从 0 累加，与后续 add 语义一致
      if (op === 'add' && type === 'number') {
        value = Number(input.value || 0);
      } else if (op === 'concat') {
        value = String(input.value ?? '');
      }
      try {
        const created = await this.create({
          key: input.key,
          name: input.name || input.key,
          scope,
          ruleId,
          type,
          value,
        });
        this.emitChanged(created);
        return created;
      } catch (err) {
        const raced = await this.findByKey(input.key, scope, ruleId);
        if (raced) return this.setValue(input);
        throw err;
      }
    }
    return this.setValue(input);
  }

  /** 二元数值运算写入目标变量 */
  async applyMath(input: {
    key: string;
    scope?: AutomationVarScope;
    ruleId?: string | null;
    op: '+' | '-' | '*' | '/' | '%';
    lhs: number;
    rhs: number;
    name?: string;
  }) {
    const op = input.op;
    let result = 0;
    if (op === '+') result = input.lhs + input.rhs;
    else if (op === '-') result = input.lhs - input.rhs;
    else if (op === '*') result = input.lhs * input.rhs;
    else if (op === '/') result = input.rhs === 0 ? 0 : input.lhs / input.rhs;
    else if (op === '%') result = input.rhs === 0 ? 0 : input.lhs % input.rhs;
    if (!Number.isFinite(result)) result = 0;
    return this.upsertSet({
      key: input.key,
      scope: input.scope,
      ruleId: input.ruleId,
      op: 'set',
      type: 'number',
      value: result,
      name: input.name,
    });
  }

  /** 函数变换写入目标变量 */
  async applyFn(input: {
    key: string;
    scope?: AutomationVarScope;
    ruleId?: string | null;
    fn: string;
    arg?: string | number;
    digits?: number;
    name?: string;
  }) {
    const fn = String(input.fn || 'round').toLowerCase();
    let outType: AutomationVarType = 'number';
    let value: string | number = 0;
    if (fn === 'now') {
      outType = 'string';
      value = new Date().toISOString();
    } else if (fn === 'timestamp') {
      value = Math.floor(Date.now() / 1000);
    } else if (fn === 'len') {
      value = String(input.arg ?? '').length;
    } else {
      const n = Number(input.arg);
      const num = Number.isFinite(n) ? n : 0;
      if (fn === 'floor') value = Math.floor(num);
      else if (fn === 'ceil') value = Math.ceil(num);
      else if (fn === 'abs') value = Math.abs(num);
      else {
        const digits = Math.max(0, Math.min(10, Number(input.digits) || 0));
        const f = 10 ** digits;
        value = Math.round(num * f) / f;
      }
    }
    return this.upsertSet({
      key: input.key,
      scope: input.scope,
      ruleId: input.ruleId,
      op: 'set',
      type: outType,
      value,
      name: input.name,
    });
  }

  async getValue(key: string, scope: AutomationVarScope = 'global', ruleId?: string | null) {
    const row = await this.findByKey(key, scope, ruleId);
    if (!row) return null;
    return row.type === 'number' ? Number(row.value) : row.value;
  }

  /** 解析写入类型：显式优先；add 默认 number；否则继承已有或按 value 推断 */
  private resolveWriteType(
    explicit: AutomationVarType | undefined,
    op: string,
    existingType: AutomationVarType | undefined,
    value: string | number | undefined,
  ): AutomationVarType {
    if (explicit === 'number' || explicit === 'string') return explicit;
    if (op === 'add') return 'number';
    if (existingType === 'number' || existingType === 'string') return existingType;
    return typeof value === 'number' ? 'number' : 'string';
  }

  private normalizeValue(raw: string | number, type: AutomationVarType): string {
    if (type === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : '0';
    }
    return String(raw ?? '');
  }

  private emitChanged(row: {
    key: string;
    scope: string;
    ruleId: string | null;
    value: string;
    type: string;
  }) {
    this.eventEmitter.emit('homeos.var_changed', {
      key: row.key,
      scope: row.scope,
      ruleId: row.ruleId,
      value: row.value,
      type: row.type,
    });
  }
}
