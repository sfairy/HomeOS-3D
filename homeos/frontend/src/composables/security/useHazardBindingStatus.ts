/**
 * 兼容 barrel（迁移过渡态）：真源在 @/features/security/composables/useHazardBindingStatus。
 *
 * 迁移期兜住域外引用，使 security 域可自持而不必改动域外调用方。
 * 待调用方改走 `@/features/security` 域根 barrel 后删除；
 * 权威依赖清单见 scripts/check-frontend-deps.mjs（此处属纯 re-export，被其跳过）。
 */
export * from '@/features/security/composables/useHazardBindingStatus'
