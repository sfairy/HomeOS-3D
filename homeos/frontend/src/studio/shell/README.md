# Shell layer

Canonical paths today:

- `../views/` — route shells
- `../chrome/` — top bars / shortcuts
- `../components/` — SceneStage etc.
- `../composables/` — legacy page loader
- `../page-assets.ts` — per-route asset bundles

Use `@/studio/shell` for chrome + engine facades. Prefer `@/studio/views/...` for route components until a physical move.
