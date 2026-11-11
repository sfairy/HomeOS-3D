"""家庭模式的策略常量与准入判据（从 ``service.py`` 拆出）。

这个模块只放「不依赖服务实例」的东西：

- 默认配置（``homeMode`` / ``security`` 两段）与分钟边界计算；
- HA 连接静置窗口（重连/冷启动期间触发器整体跳过）；
- 模式动作的写时校验入口（判据在 ``validation.py``）；
- 命令通道优先、直连连接器兜底的下发封装。

拆出来的动机是 ``service.py`` 已被文件规模棘轮锁住：把新增策略继续堆进门面类，会让
「同一个文件既做编排又做准入判据」，评审时两者互相淹没。
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from .validation import ModeActionRejected, validate_mode_actions
from ...platform.core.http.errors import bad_request

logger = logging.getLogger("homeos.home_mode.policy")

HOME_MODE_DEFAULT_CONFIG: dict[str, Any] = {
    "triggerCooldownMs": 60_000,
    "applyMaxRetries": 2,
    "maxTriggerLogs": 50,
    "maxExecHistory": 100,
    "showAwayButton": True,
    "showHomeMode": True,
    "manualLockTtlMin": 30,
    "linkageClaimTtlMin": 15,
}

SECURITY_DEFAULT_CONFIG: dict[str, Any] = {
    "autoArmOnEveryoneLeft": False,
    "autoUpgradeToAwayOnEveryoneLeft": False,
    "autoDisarmOnFirstHome": False,
}

#: HA 连接静置窗口（毫秒）：刚连上/刚启动时，状态是快照补齐而非「旧态 → 新态」，
#: 触发器整体跳过。0 关闭。
BASELINE_SETTLE_ENV = "HOMEOS_HOME_MODE_TRIGGER_SETTLE_MS"
DEFAULT_BASELINE_SETTLE_MS = 30_000


def seconds_until_next_minute(now: datetime | None = None) -> float:
    """到下一个整分钟的秒数（至少 0.5s，避免恰好卡在边界上与上一轮同分钟）。

    时间触发器按「分钟边界」唤醒而不是固定 30s 轮询：``at=HH:MM`` 语义与分钟对齐，
    落在边界上才能保证 60s 内必然求值一次，且不会一小时多跑 60 次。
    """
    current = now or datetime.now()
    remaining = 60.0 - current.second - current.microsecond / 1_000_000
    return max(0.5, remaining)


def resolve_baseline_settle_ms() -> int:
    """读取静置窗口长度（``HOMEOS_HOME_MODE_TRIGGER_SETTLE_MS``，非法值回落默认）。"""
    raw = os.getenv(BASELINE_SETTLE_ENV)
    if raw is None:
        return DEFAULT_BASELINE_SETTLE_MS
    try:
        return max(0, int(float(raw)))
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("HOMEOS_HOME_MODE_TRIGGER_SETTLE_MS 非法，回落默认值: %r", raw)
        return DEFAULT_BASELINE_SETTLE_MS


def compute_baseline_settling(state_store: Any) -> bool:
    """HA 刚连上/刚启动的静置期内返回真（触发器应整体跳过）。

    语义与安防的「重连基线预热」一致：这段时间内收到的状态是快照补齐或首轮上报，
    不能当成「旧态 → 新态」的边沿。状态存储没接（单测）时按「不在静置期」处理。
    """
    settle_ms = resolve_baseline_settle_ms()
    if settle_ms <= 0:
        return False
    link_age = getattr(state_store, "get_ha_link_age_ms", None)
    if not callable(link_age):
        return False
    try:
        age = link_age()
    except Exception:  # 诊断读取失败不能阻断自动化
        logger.debug("读取 HA 连接时长失败，按非静置期处理", exc_info=True)
        return False
    return age is not None and age < settle_ms


def assert_mode_actions_allowed(config: Any) -> None:
    """模式动作写时校验：不合法直接 400（文案带动作序号）。

    与 ``actions._execute_home_mode_action`` 的运行时兜底共用 ``validation`` 的判据；
    这里只负责把领域异常翻成 HTTP 语义。
    """
    try:
        validate_mode_actions(config)
    except ModeActionRejected as rejected:
        logger.warning("家庭模式动作被拒绝: %s", rejected.message())
        bad_request(rejected.message())


#: 应急开关：设为 ``0`` 时家庭模式动作退回直连连接器（跳过命令通道）。
#: 只用于线上排障 —— 此时写时校验与运行时白名单兜底仍然生效，损失的是幂等、
#: 断连高风险拦截与后置三态校验。
PROXY_CALL_ENV = "HOMEOS_HOME_MODE_PROXY_CALL"


def _proxy_call_enabled() -> bool:
    raw = os.getenv(PROXY_CALL_ENV)
    return raw is None or raw.strip().lower() not in {"0", "false", "no", "off"}


async def call_service_via_proxy(
    proxy: Any,
    connector: Any,
    domain: str,
    service: str,
    entity_id: str,
    data: dict[str, Any],
) -> Any:
    """下发一次 HA 服务调用：优先命令通道，缺省/应急时直连连接器。

    命令通道（``CommandProxyService``）才有服务白名单、幂等去重、HA 断连时的高风险
    拦截与三态后置校验。直连连接器是**降级路径**，用于早期启动阶段、单测与
    ``HOMEOS_HOME_MODE_PROXY_CALL=0`` 的应急回退。
    """
    if proxy is None or not _proxy_call_enabled():
        return await connector.call_service(domain, service, entity_id, data)
    # 延迟导入：``domains.proxy`` 反过来依赖 ``platform``，放在模块顶层会形成导入环。
    from ..proxy.command_proxy import build_service_call_dto, dispatch_service_call

    envelope = await dispatch_service_call(
        proxy,
        build_service_call_dto(domain=domain, service=service, entity_id=entity_id, service_data=data),
    )
    # 统一出口返回信封；动作执行只关心 HA 的 ``data``（后置校验拿它做三态判定）。
    return envelope.get("data") if isinstance(envelope, dict) else envelope


__all__ = [
    "BASELINE_SETTLE_ENV",
    "HOME_MODE_DEFAULT_CONFIG",
    "SECURITY_DEFAULT_CONFIG",
    "assert_mode_actions_allowed",
    "call_service_via_proxy",
    "compute_baseline_settling",
    "resolve_baseline_settle_ms",
    "seconds_until_next_minute",
]
