// P8-b：形态目录压平时的撞名对，用语义限定名区分（类型/模型一侧）。
export default {
  moves: [
    { from: 'homeos/frontend/src/domain/entity/utils/entity.ts', to: 'homeos/frontend/src/domain/entity/entity-state.ts' },
    { from: 'homeos/frontend/src/domain/entity/utils/device-group.ts', to: 'homeos/frontend/src/domain/entity/device-group-model.ts' },
    { from: 'homeos/frontend/src/kernel/types/layout.ts', to: 'homeos/frontend/src/kernel/layout-config.ts' },
    { from: 'homeos/frontend/src/kernel/types/auth.ts', to: 'homeos/frontend/src/kernel/auth-payload.ts' },
  ],
}
