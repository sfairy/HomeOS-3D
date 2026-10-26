#!/usr/bin/env python3
"""拓扑探针（Blender 无头版）：用 BMesh 独立复算非流形边 / 边界边 / 壳数 / 有向体积。

与 `glb_geometry_probe.mjs` 输出同一 schema，落 `geometry-probe.json`，供
`audit_glb_geometry.mjs` 交叉校验。本机默认没有 Blender，所以主流程用 JS 版；
这个脚本是**第三方复核**：Blender 的 BMesh 与自研边表统计口径不同，
两边数字接近才说明「没有非流形」不是自家算法算出来的错觉。

用法（需要 Blender 3.6+ / 4.x / 5.x 自带 bpy）：
    blender --background --python ops/checks/studio/glb_geometry_probe.py -- --json
    blender --background --python ops/checks/studio/glb_geometry_probe.py -- --model sofa
    python3 ops/checks/studio/glb_geometry_probe.py --check      # 只做语法/环境自检

注意：
- Blender 导入 GLB 会自动解 Draco（需装 io_scene_gltf2，官方版自带）。
- **只读**：不保存、不重导出，避免破坏材质槽位与 extras。
- 一个文件里多个对象会逐个统计后求和；壳数用 BMesh 的连通分量。
"""

# ``bpy`` / ``bmesh`` 只存在于 Blender 自带的 Python 里（``blender --background --python``），
# 仓库 venv 永远没有这两个包；本文件是「第三方复核」脚本，不在应用运行时被 import。
# 因此这里整体压掉这两条诊断，否则 basedpyright 会在一个刻意的 Blender-only 脚本上报红。
# pyright: reportMissingImports=false, reportUnusedImport=false

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
MODELS_DIR = REPO_ROOT / "homeos/frontend/public/static/3d-studio/models"
STEMS_JSON = REPO_ROOT / "homeos/frontend/scripts/models/specs/model-file-names.json"


def load_stem_maps() -> tuple[dict[str, str], dict[str, str]]:
    """读「英文 id ↔ 磁盘中文主干」映射（由 build-model-name-index.mjs 生成）。

    磁盘上模型文件名全是中文，报告里仍用英文 id（与 `geometry-baseline.json` 对齐），
    `--model` 也就能照旧传 `sofa` 这种 id。
    """
    if not STEMS_JSON.exists():
        return {}, {}
    stems = json.loads(STEMS_JSON.read_text(encoding="utf-8")).get("stems", {})
    return stems, {stem: model_id for model_id, stem in stems.items()}


ID_BY_STEM, STEM_BY_ID = load_stem_maps()


def model_id_of(path: Path) -> str:
    stem = path.stem.removesuffix("-lite")
    return ID_BY_STEM.get(stem, stem)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="GLB 拓扑探针（Blender BMesh）")
    parser.add_argument("--json", action="store_true", help="写 geometry-probe.json")
    parser.add_argument(
        "--model",
        default="",
        help="逗号分隔的模型 id（英文，如 sofa；也接受磁盘中文主干），只跑这些",
    )
    parser.add_argument("--check", action="store_true", help="只做环境自检")
    return parser.parse_args(argv)


def collect_files(only: set[str]) -> list[Path]:
    files = sorted(MODELS_DIR.rglob("*.glb"))
    if not only:
        return files
    stems = {STEM_BY_ID.get(name, name) for name in only}
    return [path for path in files if path.stem.removesuffix("-lite") in stems]


def analyse_object(obj) -> dict:
    """返回单个 mesh 对象的拓扑统计。"""
    import bmesh

    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.edges.ensure_lookup_table()
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    boundary = sum(1 for edge in bm.edges if edge.is_boundary)
    # 连通分量 = 壳数
    seen = set()
    shells = 0
    for face in bm.faces:
        if face.index in seen:
            continue
        shells += 1
        stack = [face]
        seen.add(face.index)
        while stack:
            current = stack.pop()
            for edge in current.edges:
                for linked in edge.link_faces:
                    if linked.index not in seen:
                        seen.add(linked.index)
                        stack.append(linked)
    volume = bm.calc_volume(signed=True)
    triangles = sum(len(face.verts) - 2 for face in bm.faces)
    bm.free()
    return {
        "triangles": triangles,
        "vertices": len(mesh.vertices),
        "shells": shells,
        "nonManifoldEdges": non_manifold,
        "boundaryEdges": boundary,
        "signedVolume": round(volume, 6),
    }


def probe_file(path: Path) -> dict:
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    totals = {
        "triangles": 0,
        "vertices": 0,
        "shells": 0,
        "nonManifoldEdges": 0,
        "boundaryEdges": 0,
        "signedVolume": 0.0,
    }
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        stats = analyse_object(obj)
        for key in totals:
            totals[key] += stats[key]
    totals["signedVolume"] = round(totals["signedVolume"], 6)
    return totals


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parse_args(argv)
    try:
        import bpy  # noqa: F401
    except Exception:
        print("需要 Blender 的 bpy：blender --background --python " + __file__, file=sys.stderr)
        if args.check:
            print("环境自检：未检测到 bpy（本机未安装 Blender），主流程改用 glb_geometry_probe.mjs。")
            return 0
        return 2
    if args.check:
        print("环境自检：bpy 可用。")
        return 0

    only = {item.strip() for item in args.model.split(",") if item.strip()}
    files = collect_files(only)
    models = []
    for path in files:
        relative = path.relative_to(MODELS_DIR).as_posix()
        try:
            stats = probe_file(path)
        except Exception as error:  # 单个文件失败不影响全量
            print(f"探针失败 {relative}: {error}", file=sys.stderr)
            continue
        models.append({"file": relative, "id": model_id_of(path), "producer": "blender-bmesh", **stats})

    payload = {
        "generatedAt": __import__("datetime").datetime.now().isoformat(),
        "producer": "blender-bmesh",
        "note": "Blender BMesh 独立复核；与 geometry-ops.mjs 口径不同，允许小幅差异。",
        "models": models,
    }
    if args.json:
        target = HERE / "geometry-probe.json"
        target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"写入 {target}（{len(models)} 个文件）")
    else:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
