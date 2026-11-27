/** 按前缀功能族合并（由 plan-families.mjs 生成）。 */
export default {
  merges: [
    {
      into: 'homeos/frontend/src/domain/entity/model/utils/entity.ts',
      from: [
        'homeos/frontend/src/domain/entity/model/utils/entity-state.ts',
        'homeos/frontend/src/domain/entity/model/utils/entity-type.util.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/domain/entity/composables/entity-input.ts',
      from: [
        'homeos/frontend/src/domain/entity/composables/entity-input.internals.ts',
        'homeos/frontend/src/domain/entity/composables/use-entity-input.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/domain/entity/composables/entity.ts',
      from: [
        'homeos/frontend/src/domain/entity/composables/use-entity-display-epoch.ts',
        'homeos/frontend/src/domain/entity/composables/use-entity-picker-session.ts',
        'homeos/frontend/src/domain/entity/composables/use-entity-projection.ts',
        'homeos/frontend/src/domain/entity/composables/use-entity-ws-subscription-sync.ts',
        'homeos/frontend/src/domain/entity/composables/use-entity.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/domain/entity/composables/ha.ts',
      from: [
        'homeos/frontend/src/domain/entity/composables/use-ha-degrade.ts',
        'homeos/frontend/src/domain/entity/composables/use-ha-entity-service.ts',
      ],
    },
  ],
}
