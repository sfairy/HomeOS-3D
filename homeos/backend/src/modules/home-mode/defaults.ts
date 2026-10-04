/**
 * 家庭模式默认种子数据。
 *
 * 职责：首次初始化（seedDefaults）时写入的默认全屋模式集合，包含
 *  回家 / 离家 / 睡眠 / 影音 / 用餐 / 度假六种模式及其动作配置与触发器。
 *  供 HomeModeService.seedDefaults 在空库时调用。
 */

import { buildHomeModeSecurityAction } from '@homeos/shared';
import type { Prisma } from '../../generated/prisma/client';

interface HomeModeDefaultSeed {
  name: string;
  icon: string;
  sortOrder: number;
  config: Prisma.InputJsonValue;
  triggers?: Prisma.InputJsonValue;
  exclusiveGroup?: string;
  priority?: number;
}

export const HOME_MODE_DEFAULT_MODES: HomeModeDefaultSeed[] = [
  {
    name: '回家模式',
    icon: 'door-open',
    sortOrder: 0,
    config: [
      {
        entity_id: 'light.xuan_guan',
        domain: 'light',
        service: 'turn_on',
        service_data: { brightness_pct: 80 },
      },
      buildHomeModeSecurityAction('armed_home'),
      {
        entity_id: 'climate.ke_ting',
        domain: 'climate',
        service: 'set_temperature',
        service_data: { temperature: 24 },
        delay: 500,
      },
      { entity_id: 'cover.ke_ting', domain: 'cover', service: 'open_cover', delay: 1000 },
    ],
    triggers: [{ type: 'lock_unlock', entityId: 'lock.da_men' }],
  },
  {
    name: '离家模式',
    icon: 'door-closed',
    sortOrder: 1,
    config: [
      { entity_id: 'light.all', domain: 'light', service: 'turn_off' },
      { entity_id: 'climate.all', domain: 'climate', service: 'turn_off' },
      { entity_id: 'media_player.all', domain: 'media_player', service: 'turn_off' },
      { entity_id: 'cover.all', domain: 'cover', service: 'close_cover', delay: 500 },
      buildHomeModeSecurityAction('armed_away'),
    ],
    triggers: [{ type: 'all_leave' }],
  },
  {
    name: '睡眠模式',
    icon: 'moon',
    sortOrder: 2,
    exclusiveGroup: 'comfort',
    priority: 80,
    config: [
      { entity_id: 'light.all', domain: 'light', service: 'turn_off' },
      {
        entity_id: 'climate.wo_shi',
        domain: 'climate',
        service: 'set_temperature',
        service_data: { temperature: 26 },
      },
      buildHomeModeSecurityAction('armed_night'),
    ],
    triggers: [{ type: 'time', at: '22:30' }],
  },
  {
    name: '影音模式',
    icon: 'film',
    sortOrder: 3,
    exclusiveGroup: 'comfort',
    priority: 50,
    config: [
      {
        entity_id: 'light.ke_ting',
        domain: 'light',
        service: 'turn_on',
        service_data: { brightness_pct: 20, rgb_color: [100, 50, 200] },
      },
      { entity_id: 'cover.ke_ting', domain: 'cover', service: 'close_cover' },
    ],
  },
  {
    name: '用餐模式',
    icon: 'utensils',
    sortOrder: 4,
    config: [
      {
        entity_id: 'light.can_ting',
        domain: 'light',
        service: 'turn_on',
        service_data: { brightness_pct: 80, kelvin: 3000 },
      },
      { entity_id: 'light.ke_ting', domain: 'light', service: 'turn_off' },
    ],
  },
  {
    name: '度假模式',
    icon: 'palmtree',
    sortOrder: 5,
    config: [
      { entity_id: 'light.all', domain: 'light', service: 'turn_off' },
      { entity_id: 'climate.all', domain: 'climate', service: 'turn_off' },
      buildHomeModeSecurityAction('armed_away'),
    ],
    triggers: [{ type: 'manual' }],
  },
];
