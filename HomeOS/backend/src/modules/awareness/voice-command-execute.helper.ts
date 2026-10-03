/**
 * @file voice-command-execute.helper.ts
 * @module awareness
 * @description 语音命令执行 helper。将解析后的语音意图（自然语言或 HA Assist 返回的 YAML）
 * 经场景 / 自动化 / 命令代理下发，统一执行鉴权（命令代理授权、儿童模式门禁、实体 ACL）。
 *
 * 关键策略：
 *  - 命令代理鉴权：assertCommandProxyAuthorized 校验调用方有权使用命令代理
 *  - 儿童模式门禁：通过 ChildModeGate 在执行前预检，避免触发后立即被拦截
 *  - 实体 ACL：collectEntityIdsFromHaYaml 提取 YAML 中引用的实体并校验执行权限
 *  - 失败时抛 BusinessException，由 VoiceService 统一捕获并返回友好错误
 *
 * 依赖（VoiceCommandExecuteDeps）：
 *  - prisma / commandProxy / childMode / sceneService / automationEngine / homeMode
 *  - haConnector：HA Assist 对话与实体校验
 *  - logger：日志记录
 */
import { type Logger } from '@nestjs/common';
import { badRequest, forbidden } from '../../common/utils/business-exception';
import { type JwtUserLike } from '@homeos/shared';
import type { PrismaService } from '../../shared/prisma/service';
import type { SceneService } from '../scene/service';
import type { AutomationEngineService } from '../automation/engine.service';
import type { HomeModeService } from '../home-mode/service';
import type { HaEntity } from '../../shared/types';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  planVoiceCommands,
  extractHaAssistSpeech,
  extractRoomFromText,
  haAssistSucceeded,
  type VoiceCommandAction,
  type VoiceRoom,
  type VoiceCommandMapping,
} from '../../common/alert-support/voice-command.util';
import {
  assertCommandProxyAuthorized,
  type ChildModeGate,
  type CommandProxyAuthUser,
} from '../command-proxy/authorization.util';
import type { CommandProxyService } from '../command-proxy/service';
import {
  assertEntityIdsExecuteAuthorized,
  collectEntityIdsFromHaYaml,
} from '../scene/scene-execute-acl.util';

interface VoiceCommandExecuteDeps {
  logger: Logger;
  prisma: PrismaService;
  commandProxy: CommandProxyService;
  childMode: ChildModeGate;
  sceneService: SceneService;
  automationEngine: AutomationEngineService;
  homeMode: HomeModeService;
  getVoiceCommands: () => VoiceCommandMapping[];
  getEntities: () => HaEntity[];
  getRooms: () => VoiceRoom[];
  useHaConversation: () => boolean;
  processConversation: (
    text: string,
  ) => Promise<{ text: string; response: Record<string, unknown> | null }>;
}

function assertCanExecuteVoice(user?: JwtUserLike): string | null {
  const role = user?.role;
  if (role === 'guest') return '访客账户无权控制设备';
  if (role === 'child') {
    const restrictions = Array.isArray(user?.restrictions) ? user.restrictions : [];
    if (restrictions.length === 0) return '儿童账户未配置设备白名单，无法操作设备';
  }
  return null;
}

/** child / 带实体白名单的非 admin：HA Assist 不会复用 HomeOS ACL，禁止自动执行 */
function shouldSkipHaAssist(user?: JwtUserLike): boolean {
  const role = user?.role;
  if (role === 'child' || role === 'guest') return true;
  const restrictions = Array.isArray(user?.restrictions) ? user.restrictions : [];
  return role !== 'admin' && restrictions.length > 0;
}

function asActor(user?: JwtUserLike): CommandProxyAuthUser | undefined {
  if (!user) return undefined;
  return { role: user.role, restrictions: user.restrictions };
}

function logVoiceCommandAudit(
  prisma: PrismaService,
  user: JwtUserLike | undefined,
  action: VoiceCommandAction,
  phrase: string,
  success: boolean,
  error?: string,
  logger?: Logger,
): void {
  setImmediate(() => {
    prisma.commandAudit
      .create({
        data: {
          userId: user?.userId,
          username: user?.username ? `${user.username} [voice:${phrase}]` : `voice:${phrase}`,
          role: user?.role,
          domain: action.domain,
          service: action.service,
          entityId: action.entityId,
          success,
          error: error || null,
        },
      })
      .catch((e: unknown) => {
        const msg = getErrorMessage(e);
        logger?.warn?.(`语音命令审计写入失败: ${msg}`);
      });
  });
}

async function executeHomeosVoiceAction(
  action: VoiceCommandAction,
  user: JwtUserLike | undefined,
  deps: VoiceCommandExecuteDeps,
): Promise<void> {
  const id = action.targetId?.trim();
  if (!id) badRequest(API_ERROR.VOICE_HOMEOS_TARGET_MISSING);
  const actor = asActor(user);
  switch (action.kind) {
    case 'homeos_scene':
      await deps.sceneService.execute(id, actor);
      return;
    case 'homeos_automation': {
      const row = await deps.prisma.automation.findUnique({
        where: { id },
        select: { yaml: true },
      });
      const yamlText = typeof row?.yaml === 'string' ? row.yaml : '';
      if (yamlText.trim()) {
        assertEntityIdsExecuteAuthorized(
          collectEntityIdsFromHaYaml(yamlText),
          actor,
          deps.childMode,
        );
      }
      const r = await deps.automationEngine.triggerAutomation(id);
      if (!r.success) {
        throw new BusinessException(
          ErrorCode.EXTERNAL_ERROR,
          API_ERROR.VOICE_AUTOMATION_TRIGGER_FAILED(r.message || ''),
        );
      }
      return;
    }
    case 'homeos_mode': {
      const r = await deps.homeMode.activate(id, {
        source: 'manual',
        reason: 'voice',
        actor,
      });
      if (!r.success) {
        throw new BusinessException(
          ErrorCode.EXTERNAL_ERROR,
          API_ERROR.VOICE_HOME_MODE_FAILED(r.error || ''),
        );
      }
      return;
    }
    default:
      badRequest(API_ERROR.VOICE_UNKNOWN_COMMAND_TYPE);
  }
}

/**
 * executeVoiceCommand：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function executeVoiceCommand(
  text: string,
  user: JwtUserLike | undefined,
  deps: VoiceCommandExecuteDeps,
): Promise<{
  ok: boolean;
  message: string;
  source: 'ha_assist' | 'mapping' | 'none';
  room?: string | null;
  count?: number;
}> {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { ok: false, message: '未识别到语音内容', source: 'none' };
  }

  const rooms = deps.getRooms();

  // ACL 前移：在进入 HA conversation 前先校验，避免 guest/child 绕过 HomeOS ACL
  // 直接经 HA Assist 控制设备（HA 侧不会复用 HomeOS 的设备白名单）
  const aclBlock = assertCanExecuteVoice(user);
  if (aclBlock) {
    forbidden(aclBlock);
  }

  // 受限账户不走 HA Assist 自动执行：HA 侧不会复用 HomeOS 实体白名单 / 儿童模式
  if (deps.useHaConversation() && !shouldSkipHaAssist(user)) {
    const conv = await deps.processConversation(trimmed);
    const resp = conv.response;
    if (haAssistSucceeded(resp)) {
      const speech = extractHaAssistSpeech(resp);
      const room = extractRoomFromText(trimmed, rooms)?.label || null;
      return {
        ok: true,
        message: speech || '已由 HA Assistant 执行',
        source: 'ha_assist',
        room,
      };
    }
  }

  const mappings = deps.getVoiceCommands();
  const entities = deps.getEntities();
  const plan = planVoiceCommands(trimmed, mappings, entities, rooms);

  if (!plan.matched) {
    return { ok: false, message: plan.message, source: 'none', room: plan.room?.label || null };
  }

  if (!plan.actions.length) {
    return {
      ok: false,
      message: plan.message,
      source: 'mapping',
      room: plan.room?.label || null,
      count: 0,
    };
  }

  const errors: string[] = [];
  let skipped = 0;
  const phrase = plan.phrase || trimmed;
  for (const action of plan.actions) {
    if (action.kind && action.kind !== 'entity') {
      // 场景/自动化/家庭模式可含任意联动（开锁/撤防等），无法用设备白名单静态校验，
      // 故儿童（即使有白名单）与访客一律拒绝，仅 admin/adult/user 可经语音触发
      const role = user?.role;
      const denied =
        assertCanExecuteVoice(user) ??
        (role === 'child' ? '儿童账户不可通过语音触发场景/自动化/家庭模式' : null);
      if (denied) {
        skipped++;
        errors.push(denied);
        logVoiceCommandAudit(deps.prisma, user, action, phrase, false, denied, deps.logger);
        continue;
      }
      try {
        await executeHomeosVoiceAction(action, user, deps);
        logVoiceCommandAudit(deps.prisma, user, action, phrase, true, undefined, deps.logger);
      } catch (e: unknown) {
        const errMsg = getErrorMessage(e);
        errors.push(errMsg);
        logVoiceCommandAudit(deps.prisma, user, action, phrase, false, errMsg, deps.logger);
      }
      continue;
    }

    try {
      await assertCommandProxyAuthorized(
        {
          domain: action.domain,
          service: action.service,
          entity_id: action.entityId,
          service_data: action.serviceData || {},
        },
        asActor(user),
        deps.childMode,
      );
    } catch (e: unknown) {
      const denied = getErrorMessage(e) || '无权操作该设备';
      skipped++;
      errors.push(`${action.entityId}: ${denied}`);
      logVoiceCommandAudit(deps.prisma, user, action, phrase, false, denied, deps.logger);
      continue;
    }
    try {
      await deps.commandProxy.callService({
        domain: action.domain,
        service: action.service,
        entity_id: action.entityId,
        service_data: action.serviceData || {},
      });
      logVoiceCommandAudit(deps.prisma, user, action, phrase, true, undefined, deps.logger);
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e);
      errors.push(`${action.entityId}: ${errMsg}`);
      logVoiceCommandAudit(deps.prisma, user, action, phrase, false, errMsg, deps.logger);
    }
  }

  if (skipped === plan.actions.length && errors.length === skipped) {
    return {
      ok: false,
      message: '当前账户无权执行该语音命令',
      source: 'mapping',
      room: plan.room?.label || null,
      count: 0,
    };
  }

  if (errors.length === plan.actions.length) {
    return {
      ok: false,
      message: `命令执行失败：${errors[0]}`,
      source: 'mapping',
      room: plan.room?.label || null,
      count: 0,
    };
  }

  const suffix = errors.length ? `（${errors.length} 个失败）` : '';
  return {
    ok: true,
    message: `${plan.message}${suffix}`,
    source: 'mapping',
    room: plan.room?.label || null,
    count: Math.max(0, plan.count - errors.length),
  };
}
