/**
 * 所属模块：backend/shared/orchestrator
 * 职责：
 *  - 编排域快照（zip）导出+幂等恢复；
 * 关键依赖：
 *  - adm-zip、runtime-kv.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { getEntityDomain } from '@homeos/shared';

/**
 * SnapshotEntry：业务接口定义。
 * - 表示：shared/orchestrator/snapshot-restore.util.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface SnapshotEntry {
  state?: string;
  attributes?: Record<string, unknown>;
  /** 快照记录时刻的状态更新时间（ISO 8601，含属性变更），恢复前用于对比是否被外部变更 */
  last_updated?: string;
  /** 状态最近一次变更时间（ISO 8601），last_updated 缺失时的回退基线 */
  last_changed?: string;
}

/** HA 服务调用载荷：domain + service + 目标实体与参数 */
interface HaServiceCall {
  domain: string;
  service: string;
  entityId: string;
  data: Record<string, unknown>;
}

/** 支持 turn_on / turn_off 的域（快照恢复默认分支可用）；其余域无此服务，跳过恢复 */
const SWITCHABLE_DOMAINS = new Set([
  'switch',
  'fan',
  'humidifier',
  'air_purifier',
  'dehumidifier',
  'siren',
  'water_heater',
  'vacuum',
  'remote',
  'script',
  'scene',
  'automation',
  'input_boolean',
]);

/**
 * 根据实体快照计算恢复时需执行的服务调用序列。
 * 不可用 / 未知状态返回空数组。
 */
export function buildSnapshotRestoreCalls(entityId: string, snap: SnapshotEntry): HaServiceCall[] {
  const domain = getEntityDomain(entityId);
  const st = snap?.state;
  const attrs = snap?.attributes || {};

  if (!st || st === 'unavailable' || st === 'unknown') return [];

  switch (domain) {
    case 'light': {
      if (st === 'off') {
        return [{ domain: 'light', service: 'turn_off', entityId, data: {} }];
      }
      const data: Record<string, unknown> = {};
      if (attrs.brightness != null) data.brightness = attrs.brightness;
      if (attrs.color_temp != null) data.color_temp = attrs.color_temp;
      if (attrs.rgb_color) data.rgb_color = attrs.rgb_color;
      if (attrs.kelvin != null) data.kelvin = attrs.kelvin;
      return [{ domain: 'light', service: 'turn_on', entityId, data }];
    }
    case 'climate': {
      if (st === 'off') {
        return [
          { domain: 'climate', service: 'set_hvac_mode', entityId, data: { hvac_mode: 'off' } },
        ];
      }
      const calls: HaServiceCall[] = [];
      if (attrs.hvac_mode) {
        calls.push({
          domain: 'climate',
          service: 'set_hvac_mode',
          entityId,
          data: { hvac_mode: attrs.hvac_mode },
        });
      }
      if (attrs.temperature != null) {
        calls.push({
          domain: 'climate',
          service: 'set_temperature',
          entityId,
          data: { temperature: attrs.temperature },
        });
      }
      return calls;
    }
    case 'cover': {
      if (attrs.current_position != null) {
        return [
          {
            domain: 'cover',
            service: 'set_cover_position',
            entityId,
            data: { position: attrs.current_position },
          },
        ];
      }
      const service = st === 'closed' || st === 'off' ? 'close_cover' : 'open_cover';
      return [{ domain: 'cover', service, entityId, data: {} }];
    }
    case 'media_player': {
      if (st === 'off' || st === 'idle' || st === 'standby') {
        return [{ domain: 'media_player', service: 'turn_off', entityId, data: {} }];
      }
      const calls: HaServiceCall[] = [
        { domain: 'media_player', service: 'turn_on', entityId, data: {} },
      ];
      if (attrs.volume_level != null) {
        calls.push({
          domain: 'media_player',
          service: 'volume_set',
          entityId,
          data: { volume_level: attrs.volume_level },
        });
      }
      return calls;
    }
    default: {
      // 仅对支持 turn_on/turn_off 的域下发；sensor/number/select/button 等域无此服务，跳过
      if (!SWITCHABLE_DOMAINS.has(domain)) return [];
      const service = st === 'off' || st === 'closed' ? 'turn_off' : 'turn_on';
      return [{ domain, service, entityId, data: {} }];
    }
  }
}
