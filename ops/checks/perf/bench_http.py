#!/usr/bin/env python3
"""HTTP 热路径基准：给「重构前后是否真的变快」提供可复现的对照数字。

## 口径（重要）

本基准测的是**路由处理函数 + 其真正的数据访问**，不含 ASGI 中间件与响应编码：

- 中间件（压缩 / 请求体门禁 / 授权短路）与响应编码（orjson / `jsonable_encoder`）
  各自是独立的一层，其中编码层已有 ``ops/bench/bench_json.py`` 逐字节覆盖；
- 把它一并塞进来会让「查询变快」被「编码噪声」淹没，也无法在 CI 上稳定复现。

因此这里的指标名一律是 ``handler_p95_ms``。它等价于「同一个请求在没有网络、
没有中间件时，处理函数本身花的时间」——想比较重构前后同一段业务代码，这是最不抖的量。

## 场景

| 场景 | 被测代码 |
| --- | --- |
| ``ha_entities_page1`` | ``api.ha.routes.list_entities``（700 实体，limit=200） |
| ``ha_entities_search`` | 同上 + ``search=灯``（前导通配，当前无索引可用） |
| ``entities_page1`` | ``api.entities.get_all_entities``（StateStore 700 实体 + 游标分页） |
| ``entities_search`` | 同上 + ``search=灯`` |
| ``draft_prepare`` | ``validate_panel_document`` + ``serialize_document``（草稿保存的纯 CPU 部分） |
| ``ui_config_get`` | ``UiConfigService.get_config``（布局脱敏，91KB 文档） |

## 用法

```bash
node ops/lib/py.mjs ops/checks/perf/bench_http.py                 # 打印 JSON
node ops/lib/py.mjs ops/checks/perf/bench_http.py --iterations 20
node ops/lib/py.mjs ops/checks/perf/bench_http.py --update         # 录制基线
node ops/lib/py.mjs ops/checks/perf/bench_http.py --check          # 与基线比对（容差 15%）
```

基线文件：``ops/checks/baselines/perf/http-hotpaths.json``（与 ``backend-hotpaths.json`` 并列）。

## 判据：确定性项硬失败，耗时项默认只报

与 ``check_backend_hotpaths.py`` 同一口径。**语句条数**（每条场景的 SELECT / 写入次数）
在任何机器上完全一致，是最该拦住的一类回归（N+1、少一个索引导致的额外扫描）；
**毫秒**在开发机与 CI 上会因宿主机负载差一倍以上，用它做硬门禁只会训练大家忽略红灯。

因此 ``--check`` 只判语句条数；耗时打印出来供人看，需要判定时加 ``--timing``
（上限为基线的 4 倍，只抓「几十倍」级别的灾难）。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
import uuid
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from _bench_bootstrap import ROOT, support

BASELINE_PATH = support.BASELINE_DIR / "http-hotpaths.json"

#: 耗时项的放大上限（只在 ``--timing`` 下生效）：只抓「几十倍」的灾难性回归。
TIMING_MULTIPLIER = 4.0
#: 绝对宽限（毫秒）：亚毫秒场景的相对误差没有意义（一次 GC 就能翻倍），
#: 只在超出「基线×系数 + 宽限」时才判定退化。
ABSOLUTE_SLACK_MS = 0.5

#: 实体规模：贴近大户型实测（700+ 实体）。
ENTITY_COUNT = 700
#: 单页条数：与路由默认上限一致。
PAGE_SIZE = 200


# ---------------------------------------------------------------- 夹具构造


def _seed_database(database_dir: Path):
    """建一个临时 SQLite（两套表都在同一 engine 上）并灌入固定 fixture。"""
    from homeos.backend.src.db_models import create_all_schemas
    from homeos.backend.src.platform.core.db.database import Database

    db_path = database_dir / "bench.db"
    database = Database(f"sqlite:///{db_path}")
    create_all_schemas(database.engine)
    return database


def _seed_rows(database) -> dict[str, Any]:
    from homeos.backend.src.platform.core.db.models import HAConnection, HAEntity, ProjectConfig, User

    connection_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    layout = support.layout_document(120)
    with database.session_factory() as session:
        session.add(
            User(
                id=user_id,
                username="bench",
                password="x",  # noqa: S106 - 临时基准库的占位凭据，不参与鉴权
                is_active=True,
            )
        )
        session.add(
            HAConnection(
                id=connection_id,
                name="bench",
                base_url="http://127.0.0.1:8123",
                encrypted_access_token="x",  # noqa: S106 - 同上：占位值
                is_active=True,
            )
        )
        session.add(
            ProjectConfig(
                id=str(uuid.uuid4()),
                project_id="default",
                layout=json.dumps(layout, ensure_ascii=False, sort_keys=True),
            )
        )
        session.add_all(
            [
                HAEntity(
                    id=str(uuid.uuid4()),
                    connection_id=connection_id,
                    entity_id=f"light.bench_{index}",
                    domain="light",
                    name=f"客厅灯 {index}",
                    sync_status="active",
                )
                for index in range(ENTITY_COUNT)
            ]
        )
        session.commit()
    return {"connection_id": connection_id, "user": SimpleNamespace(id=user_id, username="bench")}


def _seed_state_store():
    """``/entities`` 读的是 StateStore（内存），不落库。"""
    from homeos.backend.src.realtime.state_store import StateStore

    store = StateStore()
    store.set_all(
        [
            {
                "entity_id": f"light.bench_{index}",
                "state": "on" if index % 2 else "off",
                "attributes": {
                    "friendly_name": f"客厅灯 {index}",
                    "brightness": 120 + index % 100,
                    "supported_color_modes": ["rgb", "color_temp"],
                },
                "last_changed": "2026-11-24T12:00:00.000Z",
                "last_updated": "2026-11-24T12:00:00.000Z",
            }
            for index in range(ENTITY_COUNT)
        ]
    )
    return store


class _EnrichStub:
    """区域补全占位：无区域时路由不会调用，有区域时原样返回。"""

    async def enrich_entities(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return entities


def _request_for(app_state: Any) -> Any:
    """构造只带 ``app.state`` 的最小 Request（路由只读这些属性）。"""
    return SimpleNamespace(app=SimpleNamespace(state=app_state))


# ---------------------------------------------------------------- 场景定义


def build_scenarios(database, seeded: dict[str, Any], store) -> list[tuple[str, Callable[[], Any]]]:
    from homeos.backend.src.api import entities as entities_api
    from homeos.backend.src.api.ha.routes import list_entities as ha_list_entities
    from homeos.backend.src.api.projects import serialize_document
    from homeos.backend.src.domains.ui_config.service import UiConfigService
    from homeos.backend.src.panel.documents import create_blank_project
    from homeos.backend.src.panel.schema import validate_panel_document

    viewer = SimpleNamespace(user=seeded["user"])

    def ha_page1():
        with database.session_factory() as session:
            return ha_list_entities(
                database=session,
                viewer=viewer,
                search=None,
                domain=None,
                area_id=None,
                sync_status=None,
                limit=PAGE_SIZE,
                offset=0,
            )

    def ha_search():
        with database.session_factory() as session:
            return ha_list_entities(
                database=session,
                viewer=viewer,
                search="灯",
                domain=None,
                area_id=None,
                sync_status=None,
                limit=PAGE_SIZE,
                offset=0,
            )

    app_state = SimpleNamespace(
        realtime=SimpleNamespace(state_store=store),
        entity_area=_EnrichStub(),
        entity_references=SimpleNamespace(),
        database=database,
    )
    request = _request_for(app_state)

    def entities_page1():
        return asyncio.run(
            entities_api.get_all_entities(
                request=request,
                user={"id": seeded["user"].id, "username": "bench"},
                domain=None,
                search=None,
                status=None,
                area=None,
                sort="name_asc",
                controllable=None,
                page="1",
                limit=str(PAGE_SIZE),
                cursor=None,
                offset=None,
            )
        )

    def entities_search():
        return asyncio.run(
            entities_api.get_all_entities(
                request=request,
                user={"id": seeded["user"].id, "username": "bench"},
                domain=None,
                search="灯",
                status=None,
                area=None,
                sort="name_asc",
                controllable=None,
                page="1",
                limit=str(PAGE_SIZE),
                cursor=None,
                offset=None,
            )
        )

    blank = create_blank_project(str(uuid.uuid4()), "bench", 1920, 1080)
    #: 真实草稿普遍是「多页 × 每页几十个组件」（30–90KB）。空文档的校验耗时没有代表性，
    #: 因此按 4 页 × 30 组件构造，形状与线上一致、数量固定。
    blank["pages"] = [
        {
            "id": f"page{page}",
            "name": f"页面 {page}",
            "path": f"page{page}",
            "components": [
                {
                    "id": f"c{page}_{index}",
                    "type": "device",
                    "position": {"x": (index % 6) * 200, "y": (index // 6) * 140, "width": 180, "height": 120},
                    "bindings": {},
                    "properties": {"label": f"设备 {index}", "icon": "mdi:lightbulb", "showState": True},
                    "style": {"opacity": 0.92},
                    "actions": {},
                }
                for index in range(30)
            ],
        }
        for page in range(4)
    ]
    blank["defaultPagePath"] = "page0"

    def draft_prepare():
        document = validate_panel_document(json.loads(json.dumps(blank)))
        return serialize_document(document)

    service = UiConfigService(
        database.session_factory,
        SimpleNamespace(get=lambda _key, _default=None: {}),
    )

    def ui_config_get():
        return asyncio.run(service.get_config_for_api("default"))

    return [
        ("ha_entities_page1", ha_page1),
        ("ha_entities_search", ha_search),
        ("entities_page1", entities_page1),
        ("entities_search", entities_search),
        ("draft_prepare", draft_prepare),
        ("ui_config_get", ui_config_get),
    ]


def collect(iterations: int) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="homeos-bench-http-") as tmp:
        database = _seed_database(Path(tmp))
        try:
            seeded = _seed_rows(database)
            store = _seed_state_store()
            scenarios = build_scenarios(database, seeded, store)
            from homeos.backend.src.platform.core.runtime.db_metrics import get_db_query_counts

            results: dict[str, Any] = {}
            for name, run in scenarios:
                # 先跑一次并取语句增量：这条数字与机器快慢无关，因此可以硬判。
                before = get_db_query_counts()
                run()
                after = get_db_query_counts()
                queries = {
                    "select": int(after["select"] - before["select"]),
                    "write": int(after["write"] - before["write"]),
                }
                samples = support.measure(run, iterations)
                results[name] = {**support.timing_summary(samples), "queries": queries}
            return {"scenarios": results, "entityCount": ENTITY_COUNT, "pageSize": PAGE_SIZE}
        finally:
            database.engine.dispose()


# ---------------------------------------------------------------- 基线比对


def verify(current: dict[str, Any], baseline: dict[str, Any], *, timing: bool = False) -> list[str]:
    """语句条数硬判；``timing=True`` 时把 P95 也纳入（倍数而非百分比，只抓灾难）。"""
    problems: list[str] = []
    base = baseline.get("scenarios", {})
    for name, metrics in current["scenarios"].items():
        expected = base.get(name)
        if expected is None:
            continue
        queries = metrics.get("queries") or {}
        expected_queries = expected.get("queries") or {}
        for kind in ("select", "write"):
            if kind not in expected_queries:
                continue
            actual = int(queries.get(kind, -1))
            limit_exact = int(expected_queries[kind])
            if actual > limit_exact:
                problems.append(f"{name}.queries.{kind} {actual} 条 超过基线 {limit_exact} 条")
        if timing:
            limit = float(expected["p95"]) * TIMING_MULTIPLIER + ABSOLUTE_SLACK_MS
            actual_ms = float(metrics["p95"])
            if actual_ms > limit:
                problems.append(f"{name}.p95 {actual_ms} ms 超过上限 {round(limit, 3)}（基线 {expected['p95']}）")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="HTTP 热路径基准")
    parser.add_argument("--iterations", type=int, default=10)
    parser.add_argument("--update", action="store_true", help="录制基线")
    parser.add_argument("--check", action="store_true", help="与基线比对（判语句条数）")
    parser.add_argument("--timing", action="store_true", help="把 P95 也纳入判定（4 倍上限，抓灾难）")
    parser.add_argument("--json", action="store_true", default=True)
    args = parser.parse_args(argv)

    current = collect(args.iterations)

    if args.update:
        support.write_baseline(BASELINE_PATH, current)
        print(f"已录制基线：{BASELINE_PATH.relative_to(ROOT)}")
        return 0

    print(json.dumps(current, ensure_ascii=False, indent=2, sort_keys=True))

    if args.check:
        baseline = support.load_baseline(BASELINE_PATH)
        if baseline is None:
            print(f"缺少基线 {BASELINE_PATH.relative_to(ROOT)}；先跑一次 --update。", file=sys.stderr)
            return 2
        problems = verify(current, baseline, timing=args.timing)
        if problems:
            print("HTTP 热路径基准失败：", file=sys.stderr)
            for problem in problems:
                print(f"  - {problem}", file=sys.stderr)
            return 1
        print("HTTP 热路径基准通过（语句条数）。" if not args.timing else "HTTP 热路径基准通过（语句条数 + 耗时）。")
        print("提示：耗时项默认只报不判；加 --timing 可把 P95 也纳入（上限 4 倍）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
