# HomeOS frontend source layout

Horizontal layers plus one feature module for settings. Studio is a nested subsystem.

## Dependency DAG

```
views / features  →  components  →  composables  →  utils / services / constants / types
                  ↘  stores  ─────↗
views  -.->  studio (thin route shells only)
```

| Layer | Path | May import |
|-------|------|------------|
| Route / feature UI | `views/`, `features/` | components, composables, stores, utils, services, studio shells |
| UI | `components/` | composables, utils, stores, services — **not** `views/` / `features/` panels |
| Hooks | `composables/` | utils, stores, services, types — **not** `components/` (whitelist shrinking) |
| State | `stores/` | utils, services, types |
| Leaf | `utils/`, `services/`, `constants/`, `types/` | each other (leaf only) — **not** composables / stores / components |
| Studio | `studio/` | see [studio/README.md](./studio/README.md) |

Enforced by:

- `npm run check:frontend-deps` ([`scripts/check-frontend-deps.mjs`](../scripts/check-frontend-deps.mjs))
- `npm run check:studio-deps`
- ESLint `no-restricted-imports` on the main app

`utils` → composables/stores/components whitelist is **empty**.  
`composables` → components still allows `composables/shell/useFloatingHub.ts` (async popup mounts) until those move into components.

## Where to edit

| Task | Location |
|------|----------|
| Settings panels / nav | `features/settings/` |
| Settings route shell | `views/SettingsView.vue` |
| Devices UI | `components/devices/` |
| Device hooks | `composables/device/` (+ entity device helpers documented there) |
| Device pure helpers | `utils/device/` |
| Security page shell | `views/security/` |
| Security reusable UI | `components/security/` |
| Security hooks / pure | `composables/security/`, `utils/security/` |
| Entity shared UI | `components/entities/`, `components/entity-ui/` |
| Desktop widgets | `components/widgets/` (config widgets only) |
| Page chrome (list/hero) | `components/page-shell/` (compat: `components/common/list-page/`) |
| 3D Studio / panel editor / stage | `studio/` — [studio/README.md](./studio/README.md) |
| HTTP / WS clients | `services/api/` |

## Settings feature module

Settings UI lives under `features/settings/{connect,display,system,interact,automate,home,shared}/`.  
`features/settings/` is a compatibility shim (re-exports) during migration and should stay empty of real UI.

## Studio

Do not add new flat `studio/app/3d-studio/studio/studio-*.ts` files — use domain folders (`scene/`, `items/`, `lights/`, `ui/`). Flat stubs are compat only. Details: [studio/README.md](./studio/README.md).
