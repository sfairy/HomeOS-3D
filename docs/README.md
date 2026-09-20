# 文档索引

仓库的常规文档是根目录 [README.md](../README.md)（唯一的总入口）与 [store/README.md](../store/README.md)（授权商店专章）。本目录只存放**时间点记录**，不是持续维护的使用手册；命名固定为 `AUDIT-<日期>.md`（审计）与 `RELEASE-<版本>.md`（发布说明），平铺在根部，不再按类型分子目录 —— 只有两个类型、每类一两个文件时至多一层目录不划算。

## 审计记录

| 文件 | 说明 |
| --- | --- |
| [AUDIT-2026-09-17.md](AUDIT-2026-09-17.md) | 2026-09-17 的安全与代码质量审计：`store/`、`backend/`、`frontend/` 三部分（当时后端代码还在一个 `app` 子包下，现已平铺到 `backend/`），按严重/高危/中危/低危分级，附执行批次（P0–P12）与验证方法。条目带勾选与提交号，是历史记录，其中的路径与行号可能已经失效。 |

## 发布说明

| 文件 | 说明 |
| --- | --- |
| [RELEASE-V0.6.1.md](RELEASE-V0.6.1.md) | V0.6.1 发布说明，对照 `源代码/app V0.5.6` 与 `源代码/app V0.6.1` 两个快照。 |

## 已知口径漂移

[VERSION](../VERSION) 与 [store/ops/release_info.py](../store/ops/release_info.py) 目前都是 `0.5.6`，而 `RELEASE-V0.6.1.md` 描述的是 0.6.1。这是纯目录结构重构时发现的历史遗留，尚未对齐；发布前需要决定是以 `VERSION` 为准还是补齐到 0.6.1。

## 不在此目录

生产部署清单与反向代理示例（`deploy/PRODUCTION.md`、`Caddyfile.example`、`nginx.conf.example`）保留在 [deploy/](../deploy/)：`store/ops/release_info.py` 会把该路径作为字符串下发给商店前端，移动它会同时改动 `store/` 代码。
