/**
 * 安全演习服务（Hazard Drill）
 *
 * 职责：模拟烟雾 / 燃气 / 漏水三类危险告警的"演习"流程。仅触发通知与紧急场景，
 *      不会真正调用关阀 / 排风等自动动作，用于让用户在不产生副作用的前提下
 *      验证告警链路与紧急场景配置是否正常。
 * 紧急场景为 HA 侧 scene.* / script.* 实体，经 HaConnectorService 直接触发。
 * 依赖：EventBusService（事件总线，发布 security.alarm）、HaConnectorService、
 *      PrismaService（读取项目布局）、AppConfigService（读取激活项目）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { HaConnectorService } from '../ha-connector/service';
import { loadActiveProjectLayout } from '../../common/platform/project-paths.util';
import { parseHazardLayoutBindings } from '../../common/http-security/hazard.util';
import { getEntityDomain } from '@homeos/shared';
import { getErrorMessage } from '../../common/utils';

/**
 * 危险演习服务
 *
 * DI 角色：@Injectable，由 SecurityModule 注入，提供 POST /security/hazard/drill 接口底层实现。
 */
@Injectable()
export class HazardDrillService {
  private readonly logger = new Logger(HazardDrillService.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly haConnector: HaConnectorService,
  ) {}

  /**
   * 执行一次危险演习。
   *
   * 流程：
   *  1. 加载当前激活项目布局，解析烟雾 / 燃气 / 漏水绑定的实体 ID 与紧急场景 ID。
   *  2. 若对应类型未绑定传感器，直接返回未配置提示。
   *  3. 通过 eventBus 发出 `security.alarm` 事件（drillMode=true，autoActions=false），
   *     前端与通知链路按真实告警处理，但联动模块应识别 drillMode 跳过关阀 / 排风。
   *  4. 逐个触发 layout 中配置的紧急场景（HA scene.* / script.* 实体）。
   *
   * @param kind 演习类型：'smoke' | 'gas' | 'leak'，默认 'smoke'
   * @returns 演习结果对象，包含 success / drillMode / kind / 场景触发情况与提示消息
   *          （未绑定传感器时 success=false；触发场景时 sceneTriggered=true）
   * 副作用：发布 security.alarm 事件并直接触发 HA 紧急场景。
   */
  async runDrill(kind: 'smoke' | 'gas' | 'leak' = 'smoke') {
    const { layout } = await loadActiveProjectLayout(this.prisma, this.appConfig);
    const bindings = parseHazardLayoutBindings(layout);
    // 三类危险场景的中文标签，用于构造告警文案与提示消息
    const labels = { smoke: '烟雾', gas: '燃气', leak: '漏水' };
    const label = labels[kind] || '安全';

    // 根据演习类型选取对应绑定的传感器实体 ID 列表
    const boundIds =
      kind === 'smoke'
        ? bindings.smokeEntityIds
        : kind === 'gas'
          ? bindings.gasEntityIds
          : bindings.leakEntityIds;

    // 未绑定传感器时无法演习，直接返回未配置提示
    if (!boundIds.length) {
      return {
        success: false,
        drillMode: true,
        kind,
        sceneTriggered: false,
        message: `未绑定${label}传感器，请先在集成绑定中配置后再演习`,
      };
    }

    // 发布演习告警事件：drillMode=true 使下游跳过自动关阀/排风，仅走通知与场景
    this.eventBus.emit('security.alarm', {
      entityId: `drill.${kind}`,
      friendlyName: `${label}演习`,
      type: kind === 'smoke' ? 'smoke' : kind === 'gas' ? 'gas_leak' : 'water_leak',
      autoActions: false,
      drillMode: true,
      actionResults: [],
      actionFailures: [],
      zones: [],
      zoneNames: `${label}演习`,
      mode: 'safety',
      timestamp: new Date().toISOString(),
    });

    // 逐个触发紧急场景（HA scene.* / script.* 实体），不执行关阀/排风
    const sceneIds = bindings.emergencySceneIds;
    for (const sceneId of sceneIds) {
      try {
        await this.haConnector.callService(
          getEntityDomain(sceneId) || 'scene',
          'turn_on',
          sceneId,
          {},
        );
      } catch (err) {
        this.logger.warn(`演习触发紧急场景失败 [${sceneId}]: ${getErrorMessage(err)}`);
      }
    }

    return {
      success: true,
      drillMode: true,
      kind,
      boundCount: boundIds.length,
      sceneTriggered: sceneIds.length > 0,
      message: sceneIds.length
        ? `已触发${label}演习：通知 + ${sceneIds.length} 个紧急场景（${boundIds.length} 个绑定实体，未关阀/排风）`
        : `已触发${label}演习通知（${boundIds.length} 个绑定实体，未配置紧急场景，未关阀/排风）`,
    };
  }
}
