# HomeOS Store frontend layout

Small Vue app for the license store and admin console.

## Layers

| Path | Role |
|------|------|
| `views/store/` | Customer-facing store pages |
| `views/admin/` | Admin console (incl. `views/admin/settings/`) |
| `components/` | Reusable UI |
| `composables/` | Vue hooks |
| `stores/` | Pinia |
| `utils/` | Pure helpers |
| `api/` | HTTP client |
| `scene/` | Auth/scene presentation helpers |

## Imports

Prefer the `@store/…` alias (see `frontend/vite.config.ts` / root `tsconfig.json`) over deep relative `../../` paths. Migrate opportunistically when touching a file.

## Dependency rule

`components` / `composables` / `stores` / `utils` must not import `views/**`.

Enforced by `npm run check:store-deps` in this package (and CI via monorepo `check:deps` wiring on the homeos frontend job).
