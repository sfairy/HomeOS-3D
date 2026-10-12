# UI 审计分册索引

由 `ops/ui-audit/surface-inventory.mjs` / `css-unused.mjs` / `breakpoint-audit.mjs` 的数据生成，作为 Phase 2/3 分批改动的 checklist。

- 全量 surface：**90** 个（homeos 62 / store 28）
- 规范外断点：**34** 个（全仓 397 条 @media）；规范集合 639/640、900、1024、1280
- 严格未使用类：**601** 个；疑似未使用 165；动态引用 809；整表死文件 0
- 跨文件真冗余：**0** 组（详见 [08-duplicate-classes.md](./08-duplicate-classes.md)）

| 分册 | surface | 对应批次 |
| --- | --- | --- |
| [入户 · 认证 · 主壳](./01-auth-shell.md) | 7 | Phase 2 批次 1–2 |
| [列表页](./02-lists.md) | 9 | Phase 2 批次 3–4 |
| [设置域](./03-settings.md) | 27 | Phase 2 批次 5 |
| [3D Studio](./04-studio.md) | 10 | Phase 2 批次 7 |
| [商店前台](./05-store.md) | 8 | Phase 3 前台 |
| [商店管理后台](./06-admin.md) | 20 | Phase 3 后台 |
| [跨页共享组件与布局](./07-shared.md) | 9 | 随所属批次 |

> `surfaces.json` 的 `styles` 字段是全仓聚合值而非按 surface 切分，故分册改列**目录级样式入口**（真实文件）。
