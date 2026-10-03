/**
 * 设备健康概览服务
 *
 * 所属模块：system/device
 * 职责：聚合设备寿命、离线状态与固件更新可用情况，产出一份面向前端的"设备健康摘要"。
 * 依赖：
 *  - DeviceLifespanService：提供寿命统计与健康告警；
 *  - StateStoreService：提供当前 HA 实体状态快照，用于检测离线设备与可用固件更新。
 */
import { Injectable } from '@nestjs/common';
import { getEntityDomain } from '@homeos/shared';
import { DeviceLifespanService } from './lifespan.service';
import { StateStoreService } from '../../state-store/service';

/**
 * 设备健康概览服务（可注入）。
 *
 * 通过组合寿命服务与状态存储，向前端返回统一的设备健康摘要，
 * 包含寿命分布、离线设备采样与可用的固件更新采样。
 */
@Injectable()
export class DeviceHealthService {
  constructor(
    private readonly lifespan: DeviceLifespanService,
    private readonly stateStore: StateStoreService,
  ) {}

  /**
   * 生成设备健康摘要。
   *
   * 步骤：
   *  1. 从寿命服务获取摘要（含健康档位分布与告警列表，取前 5 条）；
   *  2. 遍历状态存储中的全部实体，统计离线设备（state 为 unavailable/unknown）
   *     与可用固件更新（domain 为 update 且 state 为 on/available）；
   *  3. 每类采样最多 8 条，避免响应体过大。
   *
   * @returns 设备健康摘要对象，包含寿命、离线、固件更新三部分及生成时间。
   */
  getSummary() {
    const lifespanSummary = this.lifespan.getSummary();
    const entities = this.stateStore.getAll();
    let offlineCount = 0;
    let updateAvailableCount = 0;
    const offlineSamples: Array<{ entityId: string; name: string; domain: string }> = [];
    const updateSamples: Array<{ entityId: string; name: string; state: string }> = [];

    for (const e of entities) {
      const domain = getEntityDomain(e.entity_id);
      // friendly_name 为 HA 属性 key，缺失时回退到 entity_id
      const name = String(e.attributes?.friendly_name || e.entity_id);
      // 离线判定：unavailable / unknown 均视为不可用（设备状态枚举值不翻译）
      if (e.state === 'unavailable' || e.state === 'unknown') {
        offlineCount++;
        if (offlineSamples.length < 8) {
          offlineSamples.push({ entityId: e.entity_id, name, domain });
        }
      }
      // 固件更新判定：update 域且 state 为 on/available 表示有可用更新
      if (domain === 'update') {
        const st = String(e.state || '').toLowerCase();
        if (st === 'on' || st === 'available') {
          updateAvailableCount++;
          if (updateSamples.length < 8) {
            updateSamples.push({ entityId: e.entity_id, name, state: e.state });
          }
        }
      }
    }

    return {
      lifespan: {
        totalDevices: lifespanSummary.totalDevices,
        critical: lifespanSummary.criticalCount ?? 0,
        warning: lifespanSummary.warningCount ?? 0,
        healthy: lifespanSummary.healthyCount ?? 0,
        alerts: lifespanSummary.alerts?.slice(0, 5) ?? [],
      },
      offline: {
        count: offlineCount,
        samples: offlineSamples,
      },
      firmwareUpdates: {
        count: updateAvailableCount,
        samples: updateSamples,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}