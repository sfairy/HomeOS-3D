# Studio source layout

Three stacked systems live under `src/studio/`. Prefer the dependency rules below over deep relative imports.

## Layers

| Layer | Paths (today) | Role |
|-------|---------------|------|
| Shell | `views/`, `chrome/`, `components/`, `composables/`, `page-assets.ts`, `shell/` | Vue route shells, chrome; `shell/index.ts` re-exports chrome + engine |
| Engine | `engine/` | Facade buses between Pinia stores and legacy boots |
| Creator | `app/3d-studio/` (+ domain folders under `studio/{scene,items,lights,ui,plan-tools,…}`) | Floorplan / scene authoring |
| Panel | `app/editor/`, `app/renderer/`, `app/display/`, `app/templates/` | 2D panel editor, `PanelRenderer`, display boot |
| Platform | `platform/`, leaf `app/bridge/**`, leaf `app/shared/**`, `app/utils/` | Shared adapters — **no** editor/renderer/creator imports |
| Stage | `runtime/` (`config-ui/` preferred over deprecated `editor/`), `shims/` | Live 3D stage + devices; multi-entry via `vite.runtime.config.ts` |

Aliases: `@app` → `app/`, `@runtime` → `runtime/`, `@/studio/...` for shell/platform paths.

## Boot entries

| View | Dynamic import | Boot / teardown |
|------|----------------|-----------------|
| `views/StudioView.vue` | `@app/3d-studio/studio/boot` | `bootStudio` / `teardownStudio` |
| `views/EditorView.vue` | `@app/editor/boot` | `bootEditor` / `teardownEditor` |
| `views/DisplayView.vue` | `@app/display/display*` | `bootDisplay` / `teardownDisplay` |

Shell navigation / chrome / legacy scope: `@/studio/platform/shell-*` and `legacy-scope` (compat re-exports remain under `runtime/shell-*`).

## Creator domain folders (`app/3d-studio/studio/`)

| Folder | Contents |
|--------|----------|
| `boot.ts` | Lifecycle re-exports |
| `scene/` | Camera, shadows, overview, motion presentation |
| `items/` | Furniture / device item helpers |
| `lights/` | Light preset data |
| `ui/` | Widgets, history, pure helpers |
| `plan-tools/`, `materials/`, `export/` | Barrels into sibling `../plan`, `../materials`, `../export` |
| `types/` | Shared studio-app types |

Flat `studio-*.ts` stubs at the old paths re-export from these folders so existing imports keep working.
**New code must import from domain folders** (`./scene/…`, `./items/…`, …) — do not add new flat `studio-app-*.ts` files.

Parent app layout: see [`../README.md`](../README.md). CI runs `npm run check:deps` (frontend + studio).

## Panel editor barrels (`app/editor/`)

- `boot.ts` — lifecycle
- `document.ts` / `selection.ts` / `components.ts` — thin facades over `editor-*` modules
- `inspectors/` — flow-line / percentage-bar inspectors (moved out of `shared/`)

## Panel renderer naming

- Prefer `panel-renderer.ts` over deprecated `renderer.ts` re-export
- Prefer `panel-document.ts` / `panel-caches.ts` / `panel-dialog-motion.ts` over `runtime-*.ts` stubs
- Domain seams under `renderer/core/renderer/{paint,dialogs,runtime-connect}.ts`

## Stage config UI

Prefer `@runtime/config-ui/*`. Deprecated `@runtime/editor/*` paths are pure re-export stubs so served module URLs stay valid.

## Dependency rules (enforced by `npm run check:studio-deps`)

1. `shell` → `engine` → (`creator` \| `panel` \| `display`) → `platform`
2. `stage` (`runtime/`) → `platform` / `@app/bridge` / leaf utils
3. `app/**` must **not** import `runtime/**` (use `@/studio/platform/*`)
4. `app/shared/**` must **not** import `app/editor/**` or `app/renderer/**`
5. `platform/**` is a leaf: no imports of editor, renderer, or 3d-studio

Also enforced in ESLint for `app/shared/**` and `platform/**`.

## Runtime multi-entry

Every `runtime/**/*.ts` is a Vite entry served as `/api/v1/modules/interaction3d/<rel>.js`. Do not rename those public paths without updating the runtime manifest and backend allowlist — add compat re-exports instead (see `runtime/editor/` → `runtime/config-ui/`).

## Monolith baselines

See [`MONOLITH_BASELINE.md`](./MONOLITH_BASELINE.md). KPI: shrink orchestration hosts (`studio-app.ts`, `home.ts`) toward &lt; 3k lines each via domain folders, not flat `*-foo.ts` sprawl.

## Where to edit

| Task | Tree |
|------|------|
| Floorplan / lights / materials authoring | `app/3d-studio/` (`studio/scene`, `studio/items`, `studio/lights`, …) |
| 2D dashboard panels / inspectors | `app/editor/`, `app/renderer/` |
| Live stage device motion / panels | `runtime/<device>/`, `runtime/core/`, `runtime/config-ui/` |
| Vue chrome / workflow steps | `views/`, `chrome/`, `engine/`, `shell/` |
| Shell bridges / entity role profiles | `platform/` |
