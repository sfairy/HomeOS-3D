/** `ha` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export { isLocalhostHaUrl, normalizeHaUrl, validateHaUrlForDeploy } from './url';
export { isDangerousHaControl } from './dangerous-control.util';
export {
  type HaEntity,
  type HaStateChangeEvent,
  type HaStateChangeBatchEvent,
} from './entity-types';
