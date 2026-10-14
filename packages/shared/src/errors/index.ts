/** `errors` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export {
  HTTP_MESSAGE_TEXTS,
  HTTP_STATUS_MESSAGES,
  HTTP_MESSAGE_PATTERNS,
} from './http-messages';
