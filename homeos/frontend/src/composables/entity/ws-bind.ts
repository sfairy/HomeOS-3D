/**
 * @file entity-ws-bind.ts
 * @module frontend/src/composables/entity
 */
/** entity WebSocket: 将 Socket.IO 生命周期 / HA 状态 / 实体分块 / 领域事件绑定到 entities store */
import type { EntitySocketHandlerContext, EntitySocketSyncState } from '@/shared/types/entity-store'
import type { Socket } from 'socket.io-client'
import { bindEntitySocketLifecycle } from '@/composables/entity/ws-bind-lifecycle'
import { bindEntitySocketHaSync } from '@/composables/entity/ws-bind-ha-sync'
import { bindEntitySocketDomainEvents } from '@/composables/entity/ws-bind-domain'

export function bindEntitySocketHandlers(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  bindEntitySocketLifecycle(socket, ctx, sync)
  bindEntitySocketHaSync(socket, ctx, sync)
  bindEntitySocketDomainEvents(socket, ctx)
}
