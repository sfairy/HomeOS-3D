"""自适应后端性能工具（对齐 ``common/observability/adaptive-backend-perf.util.ts``）。

根据 HA 实体规模在内存中动态调整 WS 推送 / 状态存储批处理参数，避免大规模安装时
出现 WS 风暴与补发缓冲压力；并提供面向运维诊断 API 的调优建议。

设计要点：所有调参均为「内存热更新」，仅在进程运行期生效，不写回持久化配置文件。
"""

from __future__ import annotations

from typing import Any

#: 默认「大实体」判定阈值：实体数 ≥ 2000 触发 large 档位自适应
LARGE_ENTITY_THRESHOLD = 2000

#: 上一次执行自适应时记录的实体数（数量未变化时短路跳过）
_last_applied_count = 0

#: 自适应基线快照：首次抬高参数前记录用户原始值，规模回落后恢复
_adaptive_baseline: dict[str, Any] | None = None


def _section(config: dict[str, Any], name: str) -> dict[str, Any]:
    value = config.get(name)
    if not isinstance(value, dict):
        value = {}
        config[name] = value
    return value


def apply_adaptive_backend_perf_in_place(config: dict[str, Any], entity_count: int) -> bool:
    """超大规模安装时自动抬高 WS 批处理参数（内存热更新，不持久化覆盖用户更大值）。"""
    global _last_applied_count, _adaptive_baseline

    if not entity_count or entity_count == _last_applied_count:
        return False

    frontend = _section(config, "frontend")
    ws_push = _section(config, "wsPush")
    ha_connector = _section(config, "haConnector")
    state_store = _section(config, "stateStore")

    large_threshold = (
        frontend.get("largeEntityThreshold")
        if isinstance(frontend.get("largeEntityThreshold"), (int, float))
        and frontend.get("largeEntityThreshold") > 0
        else LARGE_ENTITY_THRESHOLD
    )
    xlarge_threshold = (
        frontend.get("workerDerivedThreshold")
        if isinstance(frontend.get("workerDerivedThreshold"), (int, float))
        and frontend.get("workerDerivedThreshold") > 0
        else 2000
    )
    profile = ws_push.get("latencyProfile") or "realtime"

    if entity_count < large_threshold:
        if _last_applied_count >= large_threshold and _adaptive_baseline:
            if _adaptive_baseline.get("ingressCoalesceWindowMs") is not None:
                ha_connector["ingressCoalesceWindowMs"] = _adaptive_baseline["ingressCoalesceWindowMs"]
            if _adaptive_baseline.get("sensorFlushIntervalMs") is not None:
                ws_push["sensorFlushIntervalMs"] = _adaptive_baseline["sensorFlushIntervalMs"]
            if _adaptive_baseline.get("stateBatchMax") is not None:
                ws_push["stateBatchMax"] = _adaptive_baseline["stateBatchMax"]
            _adaptive_baseline = None
        _last_applied_count = entity_count
        return True

    _last_applied_count = entity_count

    # realtime：禁止因实体规模自动抬高延迟窗口（仍可收紧 recentChanges）
    if profile == "realtime":
        recent_cap = 1200 if entity_count >= xlarge_threshold else 2000
        current_cap = state_store.get("maxRecentChanges")
        current_cap = current_cap if isinstance(current_cap, int) else 3000
        if current_cap > recent_cap:
            state_store["maxRecentChanges"] = recent_cap
            return True
        return False

    if not _adaptive_baseline:
        _adaptive_baseline = {
            "ingressCoalesceWindowMs": ha_connector.get("ingressCoalesceWindowMs"),
            "sensorFlushIntervalMs": ws_push.get("sensorFlushIntervalMs"),
            "stateBatchMax": ws_push.get("stateBatchMax"),
        }

    tier = "xlarge" if entity_count >= xlarge_threshold else "large"
    if profile == "bulk":
        targets = (
            {"ingressCoalesceWindowMs": 40, "sensorFlushIntervalMs": 250, "stateBatchMax": 600}
            if tier == "xlarge"
            else {"ingressCoalesceWindowMs": 24, "sensorFlushIntervalMs": 180, "stateBatchMax": 400}
        )
    else:
        targets = (
            {"ingressCoalesceWindowMs": 30, "sensorFlushIntervalMs": 200, "stateBatchMax": 500}
            if tier == "xlarge"
            else {"ingressCoalesceWindowMs": 16, "sensorFlushIntervalMs": 150, "stateBatchMax": 350}
        )

    applied = False
    if (ha_connector.get("ingressCoalesceWindowMs") or 16) < targets["ingressCoalesceWindowMs"]:
        ha_connector["ingressCoalesceWindowMs"] = targets["ingressCoalesceWindowMs"]
        applied = True
    if (ws_push.get("sensorFlushIntervalMs") or 120) < targets["sensorFlushIntervalMs"]:
        ws_push["sensorFlushIntervalMs"] = targets["sensorFlushIntervalMs"]
        applied = True
    if (ws_push.get("stateBatchMax") or 300) < targets["stateBatchMax"]:
        ws_push["stateBatchMax"] = targets["stateBatchMax"]
        applied = True

    recent_cap = 1200 if tier == "xlarge" else 2000
    current_cap = state_store.get("maxRecentChanges")
    current_cap = current_cap if isinstance(current_cap, int) else 3000
    if current_cap > recent_cap:
        state_store["maxRecentChanges"] = recent_cap
        applied = True

    return applied


def build_backend_perf_suggestions(entity_count: int, xlarge_threshold: int = 3500) -> list[str]:
    """根据实体规模给出后端调优建议（运维诊断 API 使用）。"""
    if entity_count < 2000:
        return []
    tips = [f"实体数 {entity_count}：建议 Redis maxmemory ≥ 512MB"]
    if entity_count >= xlarge_threshold:
        tips.append("超大规模：考虑将 ingressCoalesceWindowMs 调至 20ms+、stateBatchMax 调至 400+")
        tips.append(f"实体缓存约 {entity_count} 条：建议启用 Redis 以减轻 L1 重启压力")
        tips.append("超大规模：确认 wsPush.coldEntityOnDemand=true，WS 仅推送关键域与热点实体")
    tips.append("可在高级参数调低 stateStore.maxRecentChanges（默认 3000）以减少 WS 补发缓冲占用")
    tips.append(
        f"实体数 ≥{entity_count}：建议保持 wsPush.coldEntityOnDemand"
        "（非可见实体不推，列表页 REST 按需补全）"
    )
    tips.append(
        "当前默认 wsPush.latencyProfile=realtime（禁止大实体自适应抬高 flush）"
        "；吞吐优先可改 balanced/bulk"
    )
    return tips


__all__ = [
    "LARGE_ENTITY_THRESHOLD",
    "apply_adaptive_backend_perf_in_place",
    "build_backend_perf_suggestions",
]
