"""``HomeToolsService`` 的宿主契约：宿主属性与跨族方法的类型声明。

各工具族拆成 mixin 后，mixin 看不见主类 ``__init__`` 注入的属性与其他族的方法。
这里统一声明（类体给 ``None`` 默认值以满足 ``reportUninitializedInstanceVariable``
硬门禁，见 ``ops/ci/pyright_gate.py``），运行期由主类与各族 mixin 覆写。
"""

from __future__ import annotations

from typing import Any


class HomeToolsHost:
    """宿主与各族 mixin 共享的成员声明（仅类型契约，运行期由实现方覆盖）。"""

    _agent_config: Any = None
    _app_config: Any = None
    _area_service: Any = None
    _command_proxy: Any = None
    _external_api: Any = None
    _ha_connector: Any = None
    _home_mode: Any = None
    _session_factory: Any = None
    _state_store: Any = None
    _ui_config: Any = None

    _activate_home_mode: Any = None
    _activate_scene: Any = None
    _assert_actor_may_control: Any = None
    _control_device: Any = None
    _control_room: Any = None
    _get_area_snapshot: Any = None
    _get_calendar: Any = None
    _get_entity_state: Any = None
    _get_home_status: Any = None
    _get_weather: Any = None
    _list_areas: Any = None
    _list_mode_names: Any = None
    _list_scenes_detailed: Any = None
    _may_read: Any = None
    _media_control: Any = None
    _query_camera: Any = None
    _read_denied: Any = None
    _read_layout: Any = None
    _read_restrictions: Any = None
    _scene_voice_gate: Any = None
    _search_entities: Any = None
    _service_whitelist_error: Any = None
    _set_cover_position: Any = None
    _set_light_brightness: Any = None
