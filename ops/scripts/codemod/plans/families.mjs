/** 按前缀功能族合并（由 plan-families.mjs 生成）。 */
export default {
  merges: [
    {
      into: 'homeos/frontend/src/domain/api/agent.ts',
      from: [
        'homeos/frontend/src/domain/api/agent-learning.ts',
        'homeos/frontend/src/domain/api/agent-memory.ts',
        'homeos/frontend/src/domain/api/agent-stream.ts',
        'homeos/frontend/src/domain/api/agent.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/kernel/types/entity.ts',
      from: [
        'homeos/frontend/src/kernel/types/entity-references.ts',
        'homeos/frontend/src/kernel/types/entity-store.ts',
        'homeos/frontend/src/kernel/types/entity.ts',
      ],
    },
  ],
}
