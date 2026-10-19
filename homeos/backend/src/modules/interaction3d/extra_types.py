"""附加实体的「域 → 控制类型」表（叶子模块）。

单独立文件是为了断掉一条导入环：``config_ctx`` 与 ``device`` 都要这张表，而它们
原本从 ``purifier`` 取；``purifier`` 在 ``validate_extra_command`` 里又延迟导入
``lock``，``lock`` 反过来导入 ``config_ctx`` —— 于是形成
``config_ctx → purifier → lock → config_ctx``。把纯数据下沉到不依赖任何兄弟模块的
叶子文件后，两个使用方直接从本模块取，环消失。

表本身的口径与 0.7.8 一致，改这里等于改配置契约，谨慎。
"""

from __future__ import annotations

#: 域 -> 附加实体支持的控制类型。'state' 表示只读：能显示状态，不能下命令。
#:
#: 0.7.8 把可控域从 12 个扩到 33 个：新增 ``text`` / ``date`` / ``time`` /
#: ``datetime`` / ``calendar`` / ``todo`` / ``weather`` / ``update`` 等服务型域、
#: ``camera`` / ``image`` 的画面域，以及 ``scene`` / 各类复合设备。表外的域只能
#: 以 ``state`` 形式挂上（只读展示）。
EXTRA_TYPES = {
    'camera': 'picture',
    'climate': 'panel',
    'cover': 'panel',
    'water_heater': 'panel',
    'media_player': 'panel',
    'switch': 'switch',
    'input_boolean': 'switch',
    'light': 'switch',
    'fan': 'switch',
    'select': 'select',
    'input_select': 'select',
    'number': 'number',
    'input_number': 'number',
    'button': 'button',
    'input_button': 'button',
    'sensor': 'state',
    'binary_sensor': 'state',
}
#: 余下的可控域全部归入“整块面板”一类（参数由各自的 ``extra_*`` 校验）。
EXTRA_TYPES.update(
    dict.fromkeys(
        (
            'text',
            'date',
            'time',
            'datetime',
            'humidifier',
            'valve',
            'lawn_mower',
            'siren',
            'alarm_control_panel',
            'vacuum',
            'lock',
            'calendar',
            'todo',
            'weather',
            'update',
            'ai_task',
            'assist_satellite',
            'conversation',
            'notify',
            'remote',
            'tts',
            'image_processing',
            'stt',
            'wake_word',
            'infrared',
            'radio_frequency',
        ),
        'panel',
    )
)
EXTRA_TYPES['scene'] = 'button'
EXTRA_TYPES['image'] = 'picture'

__all__ = ["EXTRA_TYPES"]
