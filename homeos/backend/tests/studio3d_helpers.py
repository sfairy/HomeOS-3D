"""Studio 3D 后端测试的共用夹具（内存 SQLite + 临时目录 + 轻量 Request 替身）。

后端按 ``src`` 包名导入（``python -m src.run``），所以这里先把 ``homeos/backend`` 放进
sys.path：直接 ``sys.path.append("src")`` 会让 stdlib 的 ``platform`` 抢在前面，真实报错是
``ModuleNotFoundError: No module named 「platform.core」; 「platform」 is not a package``。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import src  # noqa: F401  包入口负责挂 packages/shared-py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.platform.core.database import Base
from starlette.datastructures import Headers

SCENE_ID_A = "a" * 32
SCENE_ID_B = "b" * 32


class FakeGlobalLog:
    """``request.app.state.global_log`` 的替身：只记录调用。"""

    def __init__(self) -> None:
        self.events: list[tuple] = []

    def append(self, *args) -> None:
        self.events.append(args)


class FakeCatalog:
    def __init__(self) -> None:
        self.registered: list[tuple[str, Path]] = []
        self.removed: list[str] = []

    def register_studio3d_export(self, name: str, path: Path) -> None:
        self.registered.append((name, path))

    def remove_studio3d_folder(self, name: str) -> None:
        self.removed.append(name)


class FakeRequest:
    """只实现 studio3d 域用到的 ``headers`` 与 ``app.state``（含可选 database 工厂）。"""

    def __init__(self, settings, headers: dict[str, str] | None = None, catalog=None, database=None) -> None:
        self.app = SimpleNamespace(
            state=SimpleNamespace(
                settings=settings,
                global_log=FakeGlobalLog(),
                asset_catalog=catalog,
                database=database,
            )
        )
        self.headers = Headers(headers or {})


def new_database(path: Path | None = None):
    """建库并建表；每个用例独立，互不污染。

    默认内存库适合单会话断言。要验证「两个连接抢同一 revision」必须用文件库：
    ``sqlite://`` 每个连接一个独立数据库，并发语义在那里根本不存在。
    """
    url = "sqlite://" if path is None else f"sqlite:///{path}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def dispose(factory) -> None:
    """释放底层连接；否则测试结束时会刷一屏 unclosed database 的 ResourceWarning。"""
    engine = getattr(factory, "kw", {}).get("bind")
    if engine is not None:
        engine.dispose()


def make_settings(root: Path) -> SimpleNamespace:
    data_dir = root / "data"
    exports_dir = data_dir / "exports"
    (data_dir / "studio3d").mkdir(parents=True, exist_ok=True)
    exports_dir.mkdir(parents=True, exist_ok=True)
    return SimpleNamespace(
        data_dir=data_dir,
        studio3d_draft_path=data_dir / "studio3d" / "draft.json",
        studio3d_exports_dir=exports_dir,
    )


def write_scene_snapshot(settings, scene_id: str, payload: dict | None = None) -> Path:
    path = settings.data_dir / "modules" / "interaction3d" / "scenes" / f"{scene_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload if payload is not None else {}), encoding="utf-8")
    return path


def draft_scene(light_ids=(), item_ids=(), floor_id: str = "f1") -> dict:
    """最小的 scene 形状：``identities()`` 只读 floors[].scene.{items,lightGroups,doors}。"""
    return {
        "floors": [
            {
                "id": floor_id,
                "scene": {
                    "items": [{"id": value} for value in item_ids],
                    "lightGroups": [{"id": value} for value in light_ids],
                },
            }
        ]
    }


def interaction_component(component_id: str, scene_id: str, **properties) -> dict:
    return {"type": "interaction3d", "id": component_id, "properties": {"sceneId": scene_id, **properties}}
