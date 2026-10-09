# Studio monolith line-count baseline

Recorded **2026-10-08** (UTC). Re-measure after each extraction PR.

| File | Lines |
|------|------:|
| `app/3d-studio/studio/studio-app.ts` | 34801 |
| `app/editor/home.ts` | 22972 |
| `app/renderer/core/renderer.ts` | 7188 |
| `app/renderer/core/renderer/panel-renderer-bulk-methods.ts` | 10870 |
| `runtime/core/stage.ts` | 5698 |
| `runtime/editor/config-editor/panel-rendering.ts` | 4981 |

## Targets

- `studio-app.ts` / `home.ts`: orchestration only — goal &lt; 3000 lines each (ideal &lt; 1500).
- Prefer domain folders (`scene/`, `plan-tools/`, `items/`, …) over flat `studio-app-*.ts` sprawl.
- `panel-renderer-bulk-methods.ts`: split by paint / update / dialog / cache (`renderer/{paint,dialogs,runtime-connect}.ts` seam barrels exist).
- `stage.ts`: keep mount loop; use `stage/{sync,camera,markers}.ts` + `stage-handlers.ts`.

## Structure progress (2026-10-09)

- Domain folders under `app/3d-studio/studio/{scene,items,lights,ui,types}` with flat-path re-export stubs.
- Editor barrels: `boot` / `document` / `selection` / `components` / `inspectors`.
- `renderer.ts` → `panel-renderer.ts`; `runtime-*` → `panel-*` (compat stubs retained).
- Stage barrels: `runtime/core/stage/{sync,camera,markers}.ts`.
- Further body extraction from the two 20k+ hosts remains ongoing KPI work.

Refresh with:

```bash
wc -l \
  src/studio/app/3d-studio/studio/studio-app.ts \
  src/studio/app/editor/home.ts \
  src/studio/app/renderer/core/renderer.ts \
  src/studio/app/renderer/core/renderer/panel-renderer-bulk-methods.ts \
  src/studio/runtime/core/stage.ts \
  src/studio/runtime/editor/config-editor/panel-rendering.ts
```
