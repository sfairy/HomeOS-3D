# 交接：admin.py 拆分的最后两组（products / orders+refunds）

> 这个文件是**临时交接单**，完成下面两步后请删掉它。

## 现状（已验证，可直接接手）

```
apps/store/api/admin.py           1774 行   （起点 4479）
apps/store/api/admin_shared.py     430 行   跨组助手
apps/store/api/admin_settings.py   512
apps/store/api/admin_ops.py        421
apps/store/api/admin_compliance.py 444
apps/store/api/admin_coupons.py    306
apps/store/api/admin_licenses.py   276
apps/store/api/admin_accounts.py   259
apps/store/api/admin_entitlements.py 257
apps/store/api/admin_withdrawals.py 170
apps/store/api/admin_bindings.py    171   （含 router + router_extra 两个子路由）
```

已验证：`include_router` 10 个、10 个惰性节点、**72 条路由逐项一致（含顺序）**、`ruff` 全绿、`F821 = 0`、43 条不变量全绿、`app -> 200` / `store -> 200`。

## 只剩两组

| 组 | 段数 | 规模 | 阻塞项（只读检查已给出） |
|---|---|---|---|
| `orders`（含 order-status-meta / orders / refunds） | 1 段 | 695 行 | `_FULFILLABLE_STATUS_TEXT` |
| `products` | 2 段 | 381 行 | `_FULFILLABLE_STATUS_TEXT`、`_admin_product_context`、`_product_admin_payload`、`_product_delete_refs`、`_safe_image_target` |

## 第一步：把那 5 个助手移进共享层

```bash
.venv-store/bin/python -P /tmp/share_names.py _FULFILLABLE_STATUS_TEXT _admin_product_context \
  _product_admin_payload _product_delete_refs _safe_image_target
```

**然后必须补两个导入，且要插在正确位置**（这是卡住三轮的地方）：

```python
from apps.store.commerce.order_status import ORDER_STATUS_LABELS
from apps.store.commerce.order_status import FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES
```

三个要点，缺一个就失败：

1. `ORDER_FULFILLABLE_STATUSES` 是**带别名的导入**（源模块导出的是 `FULFILLABLE_STATUSES`），写成不带别名的形式会一直 F821；
2. `_FULFILLABLE_STATUS_TEXT` 是**模块级即时求值**的常量，导入必须在它**之前** —— 追加到文件末尾会 `NameError`；
3. 插入位置要取**第一段导入区最后一个语句的 `end_lineno`**（该文件第一段导入里有**多行括号导入**，按"最后一个以 import/from 开头的行"插入会落进括号内部 —— 我在这里踩了两次）。

稳妥做法：用 AST 找最后一个顶层 `Import/ImportFrom` 节点的 `end_lineno`，插在它后面：

```python
import ast
tree = ast.parse(text)
last = max(n.end_lineno for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom)))
```

补完跑 `.venv-store/bin/python -m ruff check .` 与 `.venv-store/bin/python -c "import apps.store.app"`，两者都必须干净。

## 第二步：抽两组（抽取器已修好，支持多段）

```bash
for g in orders products; do
  cp apps/store/api/admin.py /tmp/m_$g.py; cp apps/store/api/admin_shared.py /tmp/s_$g.py
  .venv-store/bin/python -P /tmp/extract_multi4.py $g
  .venv-store/bin/python -m ruff check apps/store/ --fix
  .venv-store/bin/python -P /tmp/verify_routes_now.py   # 必须「逐项完全一致: True」
  .venv-store/bin/python -m ruff check .                # 必须 0 个 F821
  # 任一不符：cp /tmp/m_$g.py apps/store/api/admin.py; cp /tmp/s_$g.py apps/store/api/admin_shared.py; rm apps/store/api/admin_$g.py
done
```

抽取器 `/tmp/extract_multi4.py` 已经修好两处根因：**段边界把 `router.include_router(` 行也算进去**，以及**替换前断言段内不含 include**。多段组会生成 `router` + `router_extra` 两个子路由，各自在原位置 include，以此保持注册顺序。

两组都完成后：

```bash
.venv-store/bin/python /tmp/tighten_ledger.py     # 收紧台账（admin.py 会被要求移出台账或继续降）
/usr/local/bin/node tools/check_invariants.mjs    # 43 条必须全绿
```

## 关键备份（回滚用）

```
/tmp/a_pre_prod.py + /tmp/s_pre_prod.py   ← 最后一个已验证状态（admin.py 1774 / shared 430）
/tmp/admin_router_baseline.json           ← 72 条路由基线（不可丢：这是唯一的等价性判据）
/tmp/admin_routes_final.py                ← 早期校验脚本（只认 settings，已过时，别用）
/tmp/verify_routes_now.py                 ← 通用校验脚本（按 original_router 展开 + 补父前缀）
```

## 两条硬约束（本仓的规矩，别违反）

1. **`apps/server/` 与 `apps/store/` 是两个独立项目、可能分机部署，绝不互相 import，也不要把同名实现合并成共享模块。** 第 43 条不变量守卫会拦。防漂移用构建期生成 + 逐字节校验（样板见 `design/scene` 的三份分发副本 + `tools/audit_colors.mjs`）。
2. **`ruff --fix` 会把"只供再导出"的名字当未使用静默删掉**。跨模块再导出要用 `__all__` 固定公开面。


## 全量验证命令（改任何东西前后都跑）

```bash
/usr/local/bin/node tools/check_invariants.mjs   # 43 条必须全绿
.venv-store/bin/python -m ruff check .           # 必须 0 错误（尤其 F821）
/usr/local/bin/node tools/audit_dead_code.mjs    # 两张清单必须都是 0
/usr/local/bin/node tools/audit_colors.mjs
/usr/local/bin/node tools/audit_plan_symbols.mjs
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18081/health/ready   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18082/healthz        # 200
```

跑 /tmp 下的脚本要加 `-P`（否则 /tmp/inspect.py 会遮蔽标准库 inspect）；`node` 不在 PATH 上，用绝对值 /usr/local/bin/node；Python 用 .venv-store/bin/python。

## 本项目其它未完成项（做完 admin.py 之后可继续）

| # | 项 | 说明 |
|---|---|---|
| 1 | **§3 顶层结构**：apps/server + apps/store、packages/、ops/、db/ | 未开始。会动 Dockerfile 约 20 处 COPY、-m apps.server.main、alembic、38 处守卫路径、两份部署文档；建议一次搬一个 apps/*，每步跑全量守卫 |
| 2 | **R1 同名双份防漂移** | apps/server/core/static_revision.py、apps/server/core/appearance.py、security/body_guard.py / compression.py / access_log.py、能力码 BASE_FEATURES ↔ FEATURE_CATALOG 各两份。**做法只能是构建期生成 + 逐字节校验**（样板：design/scene 的三份分发副本 + tools/audit_colors.mjs），**不许共享运行时实现** |
| 3 | **S4 首屏按需加载** | frontend/static/renderer/core/renderer.js 静态 import 了全部 13 个 device-controls/*.js；改完必须**在浏览器里**验（能开页面、控制台无 404、面板正常）——只跑守卫不足以下结论 |
| 4 | **D 其余超标文件** | 台账 tools/file-size-baseline.json 剩 36 条；最大 studio-app.js 28304 行、home.js 22672 行。棘轮守卫保证只减不增 |
| 5 | **性能收益实测（部分闭环）** | 已有：并发去重 5×（51 ms vs 250 ms）、热路径 4 µs/次、翻译表磁盘缓存 227 KB 落盘、gzip /login 26700→6598 B、授权 start() 300→<50 ms。**缺**：翻译接口改后的真实流量对比（日志是 UTC，且该实例在该接口上没有改后的流量） |

## 已经落地的东西（别重复做）

- 第 41 条守卫：表达式被静默改写（行首 NNN| 残留 / 数字与字符串做位或）—— 起因是 client-log.js 里混进 370| 让所有慢请求日志的 message 恒为 370
- 第 42 条守卫：匿名静态白名单必须来自 frontend/public-static.json（63 条 + alwaysRevalidate 2 条）
- 第 43 条守卫：两个可独立部署的项目不得互相 import
- 文件规模棘轮守卫 + tools/file-size-baseline.json 台账
- tools/paths.mjs：仓库路径单一事实来源（6 个审计脚本全部走它）
- apps/server/main.py 1243 → 102 行（拆成 apps/server/app/{lifespan,middleware,pages,errors,request_context,public_assets}.py）
- apps/store/payments/alipay.py 1126 → 745（拆出 alipay_signing.py）+ 13 项签名往返测试
- 性能：翻译表 single-flight + 磁盘缓存、草稿解析缓存 + control_scope、授权启动不阻塞、静态鉴权合并会话、启动期资产清扫转后台
