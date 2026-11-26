"""3D 增量包的配置契约，独立于面板弹窗 schema。

分区校验实现见 ``config_sections_*.py``，上下文与共享原语见 ``config_ctx.py``。
保存路径的**结构化诊断**（按分区回报失败原因）见 ``config_diagnostics.py``。
"""
from .config_ctx import ValidationContext
from .config_diagnostics import configured_validate_config
from .config_sections_appearance import validate_appearance_sections
from .config_sections_core import validate_core_sections, validate_navigation_defaults
from .config_sections_devices import validate_devices_section
from .config_sections_environment import validate_environment_section
from .config_sections_lights import validate_lights_section
from .config_sections_security import validate_security_section


def validate_config(properties: dict) -> None:
    """校验 3D 增量配置：任一处不合规即抛 422（分区实现见 ``config_sections_*.py``）。

    0.8.9 起统一走 ``config_diagnostics.configured_validate_config``：错误码固定为
    ``INTERACTION3D_CONFIG_INVALID``，并把失败分区放进响应头，便于前端定位。
    """
    configured_validate_config(properties)


def validate_config_sections(properties: dict) -> None:
    """逐分区裸校验（失败抛原始 422）。

    保留这份实现是为了让「诊断」与「分区单测」能在不引入错误码封装的前提下复用；
    保存路径请用 :func:`validate_config`。
    """
    ctx = ValidationContext()
    validate_core_sections(ctx, properties)
    validate_navigation_defaults(ctx, properties)
    validate_security_section(ctx, properties)
    validate_appearance_sections(ctx, properties)
    validate_lights_section(ctx, properties)
    validate_environment_section(ctx, properties)
    validate_devices_section(ctx, properties)
