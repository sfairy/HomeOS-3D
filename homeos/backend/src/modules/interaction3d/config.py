"""3D 增量包的配置契约，独立于面板弹窗 schema。

分区校验实现见 ``config_sections_*.py``，上下文与共享原语见 ``config_ctx.py``。
"""
from .config_ctx import ValidationContext, validate_appliance_extras  # noqa: F401 - 兼容原公开面
from .config_sections_appearance import validate_appearance_sections
from .config_sections_core import validate_core_sections
from .config_sections_devices import validate_devices_section
from .config_sections_environment import validate_environment_section
from .config_sections_lights import validate_lights_section
from .config_sections_security import validate_security_section


def validate_config(properties: dict) -> None:
    """校验 3D 增量配置：任一处不合规即抛 422（分区实现见 ``config_sections_*.py``）。"""
    ctx = ValidationContext(validate_config)
    validate_core_sections(ctx, properties)
    validate_security_section(ctx, properties)
    validate_appearance_sections(ctx, properties)
    validate_lights_section(ctx, properties)
    validate_environment_section(ctx, properties)
    validate_devices_section(ctx, properties)
