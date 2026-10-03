/**
 * @file security-linkage.service.ts
 * @module backend/src/modules
 *
 * 安防跨模块联动：在 presence / calendar / child-mode / security.modeChanged 等
 * 事件上挂载联动逻辑：
 * - 全员离家 → 自动布防 armed_away（或升级既有 armed_home/night）。
 * - 首人到家 → 切换为 armed_home（居家布防）。
 * - 日历外出时段 → 自动布防 / 恢复居家。
 * - 安防模式变更 → 联动家庭模式（activate/deactivate）+ 离家模拟启停。
 * - 儿童模式启用 → 保持撤防，避免儿童独处时误触发布防。
 *
 * 所有联动只在 Leader 实例执行，避免 bridged 事件在 Follower 上重复触发；
 * 紧急求助 / 家庭模式触发的变更不参与联动，避免反馈回路。
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { resolveHomeModeLinkForSecurityChange, type SecurityArmingMode } from '@homeos/shared';
import { AppConfigService } from '../../../shared/app-config/service';
import { PrismaService } from '../../../shared/prisma/service';
import { HaWsLeaderService } from '../../ha-connector/ha-ws-leader.service';
import { SecurityPanelService, type ArmingMode } from './security-panel.service';
import { AwaySimulationService } from '../surveillance/away-simulation.service';
import { HomeModeService } from '../../home-mode/service';
import { ChildModeService } from '../../child-mode/service';
import { getErrorMessage } from '../../../common/utils';
import { scheduleSecurityEvent } from '../../../common/http-security/hazard.util';
import {
  loadActiveProjectLayout,
  loadProjectLayoutJson,
} from '../../../common/platform/project-paths.util';

type SecurityModeLinks = Partial<Record<ArmingMode, string>>;

/**
 * 安防跨模块联动：presence → 布防、布防 → 离家模拟 / 家庭模式
 */
@Injectable()
export class SecurityLinkageService {
  private readonly logger = new Logger(SecurityLinkageService.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly securityPanel: SecurityPanelService,
    private readonly awaySim: AwaySimulationService,
    private readonly homeMode: HomeModeService,
    private readonly childMode: ChildModeService,
    private readonly haLeader: HaWsLeaderService,
  ) {}

  /**
   * 记录联动失败事件到 securityEvent 表，供用户在事件历史中查看。
   * @param type 事件类型 key（如 linkage_auto_arm_failed）
   * @param detail 失败详情文本
   * @param mode 可选当前安防模式；未传时从 securityPanel.getMode() 获取。
   */
  private logLinkageFailure(type: string, detail: string, mode?: string) {
    scheduleSecurityEvent(this.prisma, this.logger, type, detail, {
      mode: mode || this.securityPanel.getMode(),
    });
  }

  /**
   * 从激活项目布局读取 securityModeLinks 映射表（安防模式 → 家庭模式 ID）。
   * 激活项目无配置时回退到 default 项目布局。读取异常时返回空对象。
   * @returns 安防模式到家庭模式 ID 的部分映射。
   */
  private async loadSecurityModeLinks(): Promise<SecurityModeLinks> {
    try {
      const { projectId, layout } = await loadActiveProjectLayout(this.prisma, this.appConfig);
      let links = layout.securityModeLinks as SecurityModeLinks | undefined;
      if ((!links || typeof links !== 'object') && projectId !== 'default') {
        const defaultLayout = await loadProjectLayoutJson(this.prisma, 'default');
        links = defaultLayout.securityModeLinks as SecurityModeLinks | undefined;
      }
      return links && typeof links === 'object' ? links : {};
    } catch {
      return {};
    }
  }

  /**
   * 全员离家联动：根据配置自动布防 armed_away，或将 armed_home/armed_night 升级为 armed_away。
   * 儿童模式启用且未 override 时跳过自动布防，避免儿童独处时误触发布防。
   * 副作用：调用 securityPanel.arm()，可能触发 security.modeChanged 事件。
   */
  @OnEvent('presence.everyoneLeft')
  async onEveryoneLeft() {
    // 联动只在 Leader 实例执行，避免 bridged 事件在 Follower 上重复触发
    if (this.haLeader.isHaWsFollower()) return;
    const cfg = this.appConfig.get('security');
    if (!cfg.autoArmOnEveryoneLeft && !cfg.autoUpgradeToAwayOnEveryoneLeft) return;
    // 儿童模式启用且未 override：跳过全员离家自动布防，避免儿童独处时误触发
        if (this.childMode.getStatus().enabled && !this.childMode.getStatus().overrideActive) {
      this.logger.log('儿童模式已启用:跳过全员离家自动布防');
      return;
    }

    const current = this.securityPanel.getMode();
    try {
      if (current === 'disarmed' && cfg.autoArmOnEveryoneLeft) {
        await this.securityPanel.arm('armed_away', undefined, { source: 'presence' });
        this.logger.log('全员离家:已自动布防 armed_away');
      } else if (
        (current === 'armed_home' || current === 'armed_night') &&
        cfg.autoUpgradeToAwayOnEveryoneLeft
      ) {
        await this.securityPanel.arm('armed_away', undefined, { source: 'presence', force: true });
        this.logger.log(`全员离家:${current} 已升级为 armed_away`);
      }
    } catch (err) {
      this.logLinkageFailure(
        'linkage_auto_arm_failed',
        `全员离家自动布防失败: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * 人员到场联动：首人到家时自动切 armed_home（居家布防），而非全撤防。
   * @param data 人员变更事件，atHome=true 表示有人到家。
   */
  @OnEvent('presence.changed')
  async onPresenceChanged(data: { atHome?: boolean }) {
    if (!data?.atHome) return;
    // 联动只在 Leader 实例执行，避免 bridged 事件在 Follower 上重复触发
    if (this.haLeader.isHaWsFollower()) return;
    // 历史配置键 autoDisarmOnFirstHome：语义已对齐「回家→居家」，切 armed_home 而非全撤防
    if (!this.appConfig.get('security').autoDisarmOnFirstHome) return;
    const current = this.securityPanel.getMode();
    if (current === 'armed_home' || current === 'disarmed') return;
    try {
      await this.securityPanel.arm('armed_home', undefined, { source: 'presence', force: true });
      this.logger.log('首人到家:已自动切换安防为 armed_home(居家)');
    } catch (err) {
      this.logLinkageFailure(
        'linkage_auto_arm_home_failed',
        `首人到家自动切居家失败: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * 日历外出时段联动：外出开始自动布防 armed_away（或升级），外出结束恢复居家。
   * 补充 presence 联动无法覆盖的场景（如成员未配置 tracker 时的定期离家）。
   * @param data 外出状态变化事件，away=true 表示进入日历外出时段。
   */
  @OnEvent('calendar.awayChanged')
  async onCalendarAway(data: { away?: boolean }) {
    if (this.haLeader.isHaWsFollower()) return;
    const cfg = this.appConfig.get('security');
    // 儿童模式启用且未 override：跳过自动布防，避免儿童独处时误触发
    if (this.childMode.getStatus().enabled && !this.childMode.getStatus().overrideActive) {
      return;
    }
    const current = this.securityPanel.getMode();
    try {
      if (data.away && cfg.calendarArmOnAway) {
        if (current === 'disarmed') {
          await this.securityPanel.arm('armed_away', undefined, { source: 'calendar' });
          this.logger.log('日历外出开始:已自动布防 armed_away');
        } else if (
          (current === 'armed_home' || current === 'armed_night') &&
          cfg.autoUpgradeToAwayOnEveryoneLeft
        ) {
          await this.securityPanel.arm('armed_away', undefined, {
            source: 'calendar',
            force: true,
          });
          this.logger.log(`日历外出开始:${current} 已升级为 armed_away`);
        }
      } else if (!data.away && cfg.autoDisarmOnFirstHome && current === 'armed_away') {
        await this.securityPanel.arm('armed_home', undefined, { source: 'calendar', force: true });
        this.logger.log('日历外出结束:已恢复 armed_home 居家布防');
      }
    } catch (err) {
      this.logLinkageFailure(
        'linkage_calendar_arm_failed',
        `日历外出联动布防失败: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * 安防模式变更联动：armed_away 时启用离家模拟，非 armed_away 时关闭；
   * 并根据 securityModeLinks 映射表联动家庭模式（activate/deactivate）。
   * 紧急求助 / 家庭模式触发的变更不联动，避免反馈回路。
   * @param data 模式变更事件，包含 mode 与 source。
   */
  @OnEvent('security.modeChanged')
  async onSecurityModeChanged(data: {
    mode?: ArmingMode;
    source?: string;
    degraded?: boolean;
  }) {
    const mode = data?.mode;
    if (!mode) return;

    // 联动动作（离家模拟 / 家庭模式）只在 Leader 实例执行，避免多副本重复触发
    if (this.haLeader.isHaWsFollower()) return;

    // 紧急求助 / 家庭模式触发的布防不联动离家模拟/家庭模式（避免反馈回路：联动→模式变更→再联动）
    if (data.source === 'emergency' || data.source === 'home-mode') return;

    const cfg = this.appConfig.get('security');

    // 顺序：先联动家庭模式（关灯/节能），再启用离家模拟，避免 sim 与模式动作抢灯
    try {
      const links = await this.loadSecurityModeLinks();
      const explicitLink = Boolean(String(links[mode] || '').trim());
      if (!cfg.linkHomeModeOnSecurityChange && !explicitLink) {
        // 无家庭模式联动时仍可处理 away-sim
      } else {
        const modes = await this.homeMode.findAll();
        const decision = resolveHomeModeLinkForSecurityChange({
          mode: mode as SecurityArmingMode,
          linkedId: links[mode],
          modes: modes.map((m) => ({ id: m.id, name: m.name })),
          allowNameFallback: cfg.linkHomeModeOnSecurityChange,
        });

        if (decision.action === 'deactivate') {
          await this.homeMode.deactivate();
          this.logger.log('安防撤防:已退出家庭模式');
        } else if (decision.action === 'activate') {
          await this.homeMode.activate(decision.modeId, {
            source: 'security',
            reason: `安防模式 ${mode}`,
          });
          this.logger.log(`安防 ${mode}:已联动家庭模式 ${decision.modeId}`);
        }
      }
    } catch (err) {
      this.logLinkageFailure(
        'linkage_home_mode_failed',
        `安防联动家庭模式失败: ${getErrorMessage(err)}`,
        mode,
      );
    }

    if (cfg.linkAwaySimOnArmAway && mode === 'armed_away') {
      if (data.degraded) {
        this.logger.warn('布防离家:联动降级,跳过启用离家模拟');
      } else {
        try {
          await this.awaySim.enable();
          this.logger.log('布防离家:已启用离家模拟');
        } catch (err) {
          this.logLinkageFailure(
            'linkage_away_sim_failed',
            `联动离家模拟失败: ${getErrorMessage(err)}`,
            mode,
          );
        }
      }
    } else if (mode !== 'armed_away' && this.awaySim.getStatus().enabled) {
      try {
        await this.awaySim.disable();
        this.logger.log(`安防 ${mode}:已关闭离家模拟`);
      } catch {
        /* 忽略 */
      }
    }
  }

  /**
   * 儿童模式变更联动：启用时若当前为 disarmed 则保持撤防，不自动布防。
   * @param data 儿童模式变更事件，enabled=true 表示已启用。
   */
  @OnEvent('childMode.changed')
  async onChildModeChanged(data: { enabled?: boolean }) {
    if (!data?.enabled) return;
    if (this.securityPanel.getMode() !== 'disarmed') return;
    this.logger.log('儿童模式启用:保持撤防状态(不自动布防)');
  }
}
