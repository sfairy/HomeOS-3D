"""性能基准的公共骨架：仓库根注入、百分位统计、载荷夹具、JSON 输出。

为什么单独一个模块
------------------
四份基准（扇出 / 事件日志 / JSON 序列化 / 批量入口）都要做同一件事：把仓库根塞进
``sys.path``、构造一批形状稳定的假数据、算 p50/p95。抄四遍就成了同构样板 ——
基准自己长重复同样没有说服力。

**不接入产品运行期**：这里只被 ``ops/bench/*`` 导入。
"""

from __future__ import annotations

import json
import statistics
import sys
import time
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

#: 基准结果落盘目录（与静态检查的基线并列，便于一起 review）。
BASELINE_DIR = ROOT / "ops" / "checks" / "baselines" / "perf"


def percentile(samples: Sequence[float], quantile: float) -> float:
    """线性插值百分位；空样本返回 0。样本量小（≤ 200）时不必上 numpy。"""
    if not samples:
        return 0.0
    ordered = sorted(samples)
    if len(ordered) == 1:
        return float(ordered[0])
    position = min(max(quantile, 0.0), 1.0) * (len(ordered) - 1)
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    weight = position - low
    return float(ordered[low]) * (1 - weight) + float(ordered[high]) * weight


def timing_summary(samples: Sequence[float]) -> dict[str, float]:
    """毫秒样本 → 常用统计量（round 到 3 位，避免基线文件里出现无意义的尾数）。"""
    return {
        "count": float(len(samples)),
        "p50": round(percentile(samples, 0.50), 3),
        "p95": round(percentile(samples, 0.95), 3),
        "max": round(max(samples), 3) if samples else 0.0,
        "mean": round(statistics.fmean(samples), 3) if samples else 0.0,
    }


def measure(run: Callable[[], Any], iterations: int, *, warmup: int = 2) -> list[float]:
    """执行 ``run`` 若干次，返回每次的毫秒耗时（前 ``warmup`` 次不计入）。"""
    samples: list[float] = []
    for index in range(iterations + max(warmup, 0)):
        started = time.perf_counter()
        run()
        elapsed = (time.perf_counter() - started) * 1000.0
        if index >= warmup:
            samples.append(elapsed)
    return samples


def report(name: str, payload: dict[str, Any], *, emit: bool = True) -> dict[str, Any]:
    """统一结果信封；``--json`` 时由调用方决定是否打印。"""
    result = {"bench": name, **payload}
    if emit:
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return result


def load_baseline(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):  # fmt: skip
        # 基线缺失 / 坏文件都按「没有基线」处理；调用方负责提示用 --update 录制。
        return None


def write_baseline(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- 假数据夹具

#: 属性规模贴近真实 HA 灯具（supported_color_modes / effect_list 这类长列表）。
_LIGHT_ATTRIBUTES = {
    "supported_color_modes": ["rgb", "color_temp", "hs"],
    "supported_features": 63,
    "effect_list": ["rainbow", "colorloop", "random", "none"],
    "brightness": 187,
    "color_mode": "color_temp",
    "friendly_name": "客厅主灯",
    "icon": "mdi:ceiling-light",
    "min_mireds": 153,
    "max_mireds": 500,
    "device_class": None,
    "unit_of_measurement": None,
}


def make_state(entity_id: str, *, state: str, brightness: int = 187, revision: int = 0) -> dict[str, Any]:
    """一条 HA 实体状态；``revision`` 推进 ``last_updated`` 让 diff 缓存不误命中。"""
    attributes = dict(_LIGHT_ATTRIBUTES)
    attributes["brightness"] = brightness
    return {
        "entity_id": entity_id,
        "state": state,
        "attributes": attributes,
        "last_changed": "2026-11-24T12:00:00.000Z",
        "last_updated": f"2026-11-24T12:00:{revision % 60:02d}.{revision // 60 % 1000:03d}Z",
    }


def make_change(entity_id: str, revision: int, *, domain_seed: int = 0) -> dict[str, Any]:
    """一条「旧态 → 新态」变更；亮度与 state 都随 revision 变化。"""
    enabled = revision % 2 == 0
    return {
        "entity_id": entity_id,
        "old_state": make_state(entity_id, state="off" if enabled else "on", brightness=120, revision=revision),
        "new_state": make_state(entity_id, state="on" if enabled else "off", brightness=200, revision=revision),
        "changed_at": f"2026-11-24T12:00:{revision % 60:02d}.{revision // 60 % 1000:03d}Z",
        "domain_seed": domain_seed,
    }


def make_changes(count: int, *, domain: str = "light", start: int = 0) -> list[dict[str, Any]]:
    return [make_change(f"{domain}.bench_{index}", start + index, domain_seed=start + index) for index in range(count)]


def layout_document(widgets: int) -> dict[str, Any]:
    """设置页 / 画布布局文档的近似形状（层级浅、键多、值短）。"""
    return {
        "schemaVersion": 3,
        "revision": 41,
        "canvas": {"width": 1920, "height": 1080, "background": "#0b0f14"},
        "widgets": [
            {
                "id": f"w{index}",
                "type": "device" if index % 3 else "scene",
                "entityId": f"light.bench_{index}",
                "x": (index % 12) * 150,
                "y": (index // 12) * 96,
                "width": 140,
                "height": 88,
                "z": index,
                "props": {
                    "label": f"设备 {index}",
                    "icon": "mdi:lightbulb",
                    "opacity": 0.92,
                    "showState": True,
                    "shortcuts": ["toggle", "brightness"],
                },
            }
            for index in range(widgets)
        ],
    }


def entity_rows(count: int) -> list[dict[str, Any]]:
    """``/ha/entities`` 单页的近似返回（200 行是默认上限）。"""
    return [
        {
            "entityId": f"light.bench_{index}",
            "domain": "light",
            "name": f"设备 {index}",
            "icon": "mdi:lightbulb",
            "areaId": f"area_{index % 12}",
            "syncStatus": "synced",
            "lastChanged": "2026-11-24T12:00:00.000Z",
            "attributes": {"brightness": 187, "color_mode": "color_temp"},
        }
        for index in range(count)
    ]


def scene_command(widgets: int) -> dict[str, Any]:
    """``interaction3d`` 场景命令的近似形状（真实场景普遍在几十到几百 KB）。"""
    return {
        "scene": {
            "version": 2,
            "objects": layout_document(widgets)["widgets"],
            "materials": [
                {"id": f"m{index}", "color": "#8899aa", "roughness": 0.6, "metalness": 0.1}
                for index in range(widgets // 2)
            ],
        },
        "referenceScene": {"objects": []},
        "syncKey": "0" * 64,
    }


def flatten_sizes(data: Iterable[Any]) -> int:
    """粗略统计夹具里字符串总长度（只用于对比不同实现的相对变化）。"""
    total = 0
    stack: list[Any] = list(data)
    while stack:
        item = stack.pop()
        if isinstance(item, str):
            total += len(item)
        elif isinstance(item, dict):
            stack.extend(item.keys())
            stack.extend(item.values())
        elif isinstance(item, (list, tuple)):
            stack.extend(item)
        elif isinstance(item, (int, float)):
            total += 8
    return total
