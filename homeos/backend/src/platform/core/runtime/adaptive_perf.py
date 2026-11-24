"""后端性能建议（对齐 ``common/observability/adaptive-backend-perf.util.ts``）。

只提供**只读的调优建议**：早期版本还有一份 ``apply_adaptive_backend_perf_in_place``
在内存里直接改 WS 批处理参数，但从未被调用（真实的自适应由 ``wsPush.latencyProfile``
在配置层完成），已删除 —— 留着会让「谁会改我的配置」变成一个没有答案的问题。
"""

from __future__ import annotations

#: 默认「大实体」判定阈值：实体数 ≥ 2000 触发 large 档位自适应
LARGE_ENTITY_THRESHOLD = 2000


def build_backend_perf_suggestions(
    entity_count: int, xlarge_threshold: int | float = 3500
) -> list[str]:
    """根据实体规模给出后端调优建议（运维诊断 API 使用）。"""
    if entity_count < 2000:
        return []
    tips = [f"实体数 {entity_count}：建议增大可用内存并关注 L1 缓存占用"]
    if entity_count >= xlarge_threshold:
        tips.append("超大规模：考虑将 ingressCoalesceWindowMs 调至 20ms+、stateBatchMax 调至 400+")
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
    "build_backend_perf_suggestions",
]
