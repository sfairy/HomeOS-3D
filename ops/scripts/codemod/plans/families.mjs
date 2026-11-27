/** 按前缀功能族合并（由 plan-families.mjs 生成）。 */
export default {
  merges: [
    {
      into: 'homeos/frontend/src/domain/entity/model/utils/device-group.ts',
      from: [
        'homeos/frontend/src/domain/entity/model/utils/group-battery.util.ts',
        'homeos/frontend/src/domain/entity/model/utils/group-counts.util.ts',
        'homeos/frontend/src/domain/entity/model/utils/group-offline.util.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/domain/entity/model/utils/entity-state.ts',
      from: [
        'homeos/frontend/src/domain/entity/model/utils/state-delta.util.ts',
        'homeos/frontend/src/domain/entity/model/utils/state-listener.ts',
        'homeos/frontend/src/domain/entity/model/utils/state-notify.util.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/domain/entity/model/utils/sync-guards.ts',
      from: [
        'homeos/frontend/src/domain/entity/model/utils/sync-failure.util.ts',
        'homeos/frontend/src/domain/entity/model/utils/sync-priority.util.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/domain/entity/model/utils/ws-subscription.ts',
      from: [
        'homeos/frontend/src/domain/entity/model/utils/ws-subscription.ts',
        'homeos/frontend/src/domain/entity/model/utils/ws-sync.ts',
      ],
    },
  ],
}
