/** `ws` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export {
  WS_CLIENT_EVENTS,
  type WsClientEventName,
  type WsHaConnectionStatus,
  type WsHaStatusPayload,
  type WsEntityStatePayload,
  type WsStateChangedBatchPayload,
} from './client-events';
