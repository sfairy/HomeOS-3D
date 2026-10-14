/** `energy` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export {
  type TouWindowFields,
  clockRangesOverlap,
  validateTouWindows,
} from './tou-windows.util';
