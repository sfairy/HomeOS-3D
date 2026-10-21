#!/usr/bin/env python3
"""为性能测量准备隔离数据副本与固定登录态。

生产实例（8801/8802）只作只读探针；本脚本在工作区外的临时目录复制数据，
写入一个新的、已知的 auth_token 会话，并断开 HA 连接，避免测量时读生产库。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from perf_common import PERF_ROOT, ROOT, env_path, write_json

DEFAULT_TOKEN = "homeos-perf-local-token-0123456789abcdef0123456789abcdef"
DB_FILES = {"homeos.db", "homeos.db-wal", "homeos.db-shm", "store.db", "store.db-wal", "store.db-shm"}


def _copy_non_db_files(source: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for child in source.iterdir():
        if child.name in DB_FILES:
            continue
        destination = target / child.name
        if child.is_dir():
            shutil.copytree(child, destination, symlinks=False)
        else:
            shutil.copy2(child, destination)


def _backup_database(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    source_connection = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    target_connection = sqlite3.connect(target)
    try:
        source_connection.backup(target_connection)
    finally:
        target_connection.close()
        source_connection.close()


def _prepare_copy(source: Path, target: Path, db_name: str) -> Path:
    if target.exists():
        shutil.rmtree(target)
    _copy_non_db_files(source, target)
    _backup_database(source / db_name, target / db_name)
    return target / db_name


def _insert_session(database: Path, token: str, user_id: str) -> None:
    now = datetime.now()
    expires = now + timedelta(days=30)
    with sqlite3.connect(database) as connection:
        connection.execute("DELETE FROM sessions")
        connection.execute(
            "INSERT INTO sessions (id_hash, userId, expiresAt, createdAt, lastSeenAt, ipAddress, userAgent) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                hashlib.sha256(token.encode("utf-8")).hexdigest(),
                user_id,
                expires.isoformat(sep=" "),
                now.isoformat(sep=" "),
                now.isoformat(sep=" "),
                "127.0.0.1",
                "HomeOS perf harness",
            ),
        )
        connection.commit()


def _disconnect_ha(database: Path) -> None:
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE ha_connections SET is_active = 0")
        connection.commit()


def _pick_project(database: Path) -> dict[str, str]:
    with sqlite3.connect(database) as connection:
        rows = connection.execute("SELECT project_id, document_json FROM project_drafts").fetchall()
    for project_id, raw in rows:
        if not raw:
            continue
        try:
            document = json.loads(raw)
        except json.JSONDecodeError as error:
            # 坏草稿直接跳过，但要留痕：否则「扫到 0 个 interaction3d 组件」无从定位。
            print(f"[setup] 跳过无法解析的项目草稿 {project_id}：{error}")
            continue
        for page in document.get("pages", []) or []:
            for component in page.get("components", []) or []:
                if component.get("type") != "interaction3d":
                    continue
                properties = component.get("properties") or {}
                scene_id = str(properties.get("sceneId") or "").strip()
                if not scene_id:
                    continue
                return {
                    "projectId": str(project_id),
                    "projectName": str(document.get("name") or ""),
                    "componentId": str(component.get("id") or ""),
                    "sceneId": scene_id,
                }
    raise SystemExit("项目草稿中找不到 interaction3d 组件及 sceneId")


def _fallback_scene(data_dir: Path) -> str:
    candidates = []
    scenes = data_dir / "modules" / "interaction3d" / "scenes"
    if scenes.is_dir():
        candidates = sorted(path.stem for path in scenes.glob("*.json") if len(path.stem) == 32)
    if not candidates:
        raise SystemExit("找不到可用的 3D 场景 id")
    return candidates[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--dist-dir", default=str(ROOT / "dist"))
    parser.add_argument("--homeos-port", type=int, default=18801)
    parser.add_argument("--store-port", type=int, default=18802)
    parser.add_argument("--token", default=DEFAULT_TOKEN)
    args = parser.parse_args()

    label = args.label
    dist_root = Path(args.dist_dir).resolve()
    homeos_frontend = dist_root / "homeos" / "frontend"
    store_frontend = dist_root / "homeos-store" / "frontend"
    if not (homeos_frontend / "index.html").is_file():
        raise SystemExit(f"缺少 homeos 前端产物：{homeos_frontend / 'index.html'}")
    if not (store_frontend / "index.html").is_file():
        raise SystemExit(f"缺少 store 前端产物：{store_frontend / 'index.html'}")

    env_dir = env_path(label).parent
    if env_dir.exists():
        shutil.rmtree(env_dir)
    env_dir.mkdir(parents=True, exist_ok=True)
    (PERF_ROOT / "logs").mkdir(parents=True, exist_ok=True)
    (PERF_ROOT / "results" / label).mkdir(parents=True, exist_ok=True)

    homeos_data = _prepare_copy(ROOT / "homeos" / "data", env_dir / "homeos-data", "homeos.db")
    store_data = _prepare_copy(ROOT / "homeos-store" / "data", env_dir / "store-data", "store.db")
    with sqlite3.connect(homeos_data) as connection:
        user = connection.execute(
            "SELECT id FROM users WHERE isActive = 1 ORDER BY createdAt LIMIT 1"
        ).fetchone()
    if not user:
        raise SystemExit("数据库里没有可用用户")
    _insert_session(homeos_data, args.token, str(user[0]))
    _disconnect_ha(homeos_data)
    project = _pick_project(homeos_data)
    if not project.get("sceneId"):
        project["sceneId"] = _fallback_scene(homeos_data.parent)

    payload = {
        "label": label,
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "root": str(ROOT),
        "perfRoot": str(PERF_ROOT),
        "python": str(ROOT / ".venv-store" / "bin" / "python"),
        "sourceDist": str(dist_root),
        "homeos": {
            "host": "127.0.0.1",
            "port": args.homeos_port,
            "dataDir": str(homeos_data.parent),
            "frontendDir": str(homeos_frontend),
            "token": args.token,
            **project,
        },
        "store": {
            "host": "127.0.0.1",
            "port": args.store_port,
            "dataDir": str(store_data.parent),
            "shellDir": str(store_frontend),
            "staticDir": str(store_frontend / "static"),
        },
    }
    write_json(env_path(label), payload)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"\n环境已准备：{env_path(label)}")


if __name__ == "__main__":
    main()
