"""3D 增量包自己的配置契约：校验控件 properties 是否合法。
"""
import json
import math
import re
from typing import NoReturn

from fastapi import HTTPException, status

from ...core.canonical_json import canonical_json
from .device import DEVICE_PROFILES, GENERIC_DEVICE_COLLECTIONS, validate_device_bindings
from .lock import validate_lock_bindings
from .numbers import as_finite_number
from .config_domains import (
    _validate_cameras,
    _validate_presence,
    _validate_lights,
    _validate_environment,
)


def validate_config(properties: dict) -> None:
    """校验一份 3D 交互控件的 properties。
    """

    def fail() -> NoReturn:
        """统一的 422 出口：文案固定，不把内部字段名暴露给前端。"""
        raise HTTPException(422, detail='3D 交互配置无效，请检查户型、灯光、环境及图标设置。')

    def number(value, low, high):
        """值是否为 [low, high] 内的有限实数；bool 需单独排除（它是 int 的子类）。
        """
        parsed = as_finite_number(value, from_text = False)
        return parsed is not None and low <= parsed <= high

    def positive_number(value):
        return number(value, 0, math.inf) and value > 0

    def text(value, length=128):
        """是否为长度不超过 length 的字符串（默认上限与前端输入框一致）。"""
        return isinstance(value, str) and len(value) <= length

    def validate_camera(camera):
        """校验相机参数对象；None 表示未配置，直接放行。
        """
        if camera is None:
            return None
        # required 缺一不可；optional 是「出现才校验」的字段。
        required = {'mode', 'zoom', 'target', 'position'}
        optional = {'up', 'view', 'frameSize', 'focalLength', 'topRotation'}
        # 必填齐备且没有未登记的键：多余键一律拒绝，防止前端悄悄塞字段。
        if not isinstance(camera, dict) or not required.issubset(camera) or set(camera) - required - optional:
            fail()
        if camera['mode'] not in ('orthographic', 'perspective') or not number(camera['zoom'], 0.01, 100):
            fail()
        # 向量必须三个分量都给全：只校验已有分量会放过 length != 3 的畸形数据。
        for key in ('position', 'target', *(['up'] if 'up' in camera else [])):
            if not isinstance(camera[key], list) or len(camera[key]) != 3 or not all(number(v, -10000, 10000) for v in camera[key]):
                fail()
        # 可选数值项的范围：帧尺寸（米）、顶视旋转角（度）、等效焦距（毫米）。
        for key, low, high in (('frameSize', 0.001, 20000), ('topRotation', 0, 360), ('focalLength', 18, 120)):
            if key not in camera:
                continue
            if number(camera[key], low, high):
                continue
            fail()
        if 'view' in camera and camera['view'] not in ('free', 'top'):
            fail()
        return None

    # properties 白名单：出现任何未登记字段就整份拒绝。
    if not isinstance(properties, dict) or set(properties) - {
        'label',
        'camera',
        'lights',
        'devices',
        'sceneId',
        'floorGap',
        'security',
        'autoRotate',
        'layoutMode',
        'navigation',
        'sceneStyle',
        'environment',
        'interaction',
        'popupLayout',
        'renderScale',
        'wallOpacity',
        'baseLighting',
        'floorCameras',
        'floorNumbers',
        'instanceName',
        'lightingMode',
        'popupOpacity',
        'behaviorScope',
        'idleExitFocus',
        'idleHideIcons',
        'pageBehaviors',
        'floorSelection',
        'pageSaturation',
        'backgroundTheme',
        'pageDimStrength',
        'backgroundMotion',
        'focusDimStrength',
        'groundReflection',
        'templateReadonly',
        'backgroundVisible',
        'motionRenderScale',
        # 暖阳原木主题的「背景暖阳暮色」开关：控件由前端渲染，这里只放行存取，
        'warmBackgroundTheme',
        'lightRegionOverrides',
        'uniformOverviewStack',
        'focusVignetteStrength',
        'hideIconsWhileRotating'}:
        fail()
    # templateReadonly 标记「该控件来自模板、字段不可编辑」，只校验类型；
    if 'templateReadonly' in properties and not isinstance(properties['templateReadonly'], bool):
        fail()
    # 暖阳原木主题下的背景配色：布尔 true 等价于「暖阳暮色」，字符串则显式给出档位
    if 'warmBackgroundTheme' in properties and properties['warmBackgroundTheme'] not in (
        True,
        False,
        'warm-sunlight',
        'warm-dusk',
    ):
        fail()
    # 安防：门锁、摄像头与人形传感器三张表，各自的字段与范围都在下面单独校验。
    security = properties.get('security', {})
    if not isinstance(security, dict) or set(security) - {
        'presenceSensors',
        'cameras',
        'locks'}:
        fail()
    validate_lock_bindings(security.get('locks', []), validate_camera)
    fields, high, item, key, low = _validate_cameras(fail, number, security, text, validate_camera)
    # 人形传感器：除基本字段外还有路径、触发模式与展示页范围三组约束。
    _validate_presence(fail, key, number, security, text, validate_camera)
    if 'uniformOverviewStack' in properties and not isinstance(properties['uniformOverviewStack'], bool):
        fail()
    if 'floorGap' in properties and not number(properties['floorGap'], 0, 20):
        fail()
    if properties.get('behaviorScope', 'global') not in ('global', 'page'):
        fail()
    # 按页面覆盖全局行为：键只允许已知页面，值里只允许行为相关的少数字段。
    page_behaviors = properties.get('pageBehaviors', {})
    if not isinstance(page_behaviors, dict) or set(page_behaviors) - {
        'light',
        'vacuum',
        'devices',
        'overview',
        'security',
        'environment'}:
        fail()
    for behavior in page_behaviors.values():
        if not isinstance(behavior, dict) or set(behavior) - {
            'autoRotate',
            'interaction',
            'idleExitFocus',
            'idleHideIcons',
            'hideIconsWhileRotating'}:
            fail()
        normalized = {
            key: {'enabled': value} if key in {'autoRotate', 'idleHideIcons'} and type(value) is bool else value
            for key, value in behavior.items()
        }
        validate_config(normalized)
    # 每页饱和度与压暗强度都用百分比表示，取值 0~100。
    saturation = properties.get('pageSaturation', {})
    if not isinstance(saturation, dict) or set(saturation) - {
        'light',
        'vacuum',
        'devices',
        'overview',
        'security',
        'environment'} or any(not number(value, 0, 100) for value in saturation.values()):
        fail()
    page_dim = properties.get('pageDimStrength', {})
    if not isinstance(page_dim, dict) or set(page_dim) - {
        'light',
        'vacuum',
        'devices',
        'overview',
        'security',
        'environment'}:
        fail()
    if any(not number(value, 0, 100) for value in page_dim.values()) or not number(properties.get('focusDimStrength', 15), 0, 100):
        fail()
    # 楼层编号：键是 floorId，不得为伪楼层 'all'；值是非 0 的 -99~99 整数，
    floor_numbers = properties.get('floorNumbers', {})
    if not isinstance(floor_numbers, dict) or len(floor_numbers) > 128:
        fail()
    for floor_id, floor_number in floor_numbers.items():
        if not text(floor_id) or not floor_id or floor_id == 'all' or type(floor_number) is not int or floor_number == 0 or not -99 <= floor_number <= 99:
            fail()
    # 每层可单独保存一套默认视角；值为 None 表示该层仍用全局相机。
    floor_cameras = properties.get('floorCameras', {})
    if not isinstance(floor_cameras, dict) or len(floor_cameras) > 128:
        fail()
    for floor_id, camera in floor_cameras.items():
        if not text(floor_id) or not floor_id or camera is None:
            fail()
        validate_camera(camera)
    # 弹窗摆放：general（通用）与 camera（摄像头）两套；坐标是画布百分比，scale 是倍数。
    popup_layout = properties.get('popupLayout', {})
    if not isinstance(popup_layout, dict) or set(popup_layout) - {
        'general',
        'camera'}:
        fail()
    for placement in popup_layout.values():
        if not isinstance(placement, dict) or set(placement) - {
            'x',
            'y',
            'scale'}:
            fail()
        if any(not number(value, 0.5, 2) if axis == 'scale' else not number(value, 0, 100) for axis, value in placement.items()):
            fail()
    # 导航条摆放：floors / categories 是位置，followOffset 是跟随偏移（像素），因此单独校验。
    navigation = properties.get('navigation', {})
    if not isinstance(navigation, dict) or set(navigation) - {
        'floors',
        'categories',
        'followOffset'}:
        fail()
    if not number(navigation.get('followOffset', 16), 0, 300):
        fail()
    for key, placement in navigation.items():
        if key == 'followOffset':
            continue
        if not isinstance(placement, dict) or set(placement) - {
            'x',
            'y',
            'scale'}:
            fail()
        if any(not number(value, 0, 100) for axis, value in placement.items() if axis != 'scale'):
            fail()
        if 'scale' in placement and not number(placement['scale'], 0.5, 2):
            fail()
    # 光影两档并存：standard（标准光影，原生灯光 + 实时阴影）与 region（轻量柔光，按光区分区），
    if properties.get('lightingMode', 'standard') not in ('standard', 'region'):
        fail()
    reflection = properties.get('groundReflection', {})
    if not isinstance(reflection, dict) or set(reflection) - {
        'mode',
        'strength',
        'resolution'}:
        fail()
    if reflection.get('mode', 'off') not in ('off', 'inside', 'outside', 'all'):
        fail()
    if not number(reflection.get('resolution', 512), 256, 768) or reflection.get('resolution', 512) not in (256, 512, 768):
        fail()
    if not number(reflection.get('strength', 0.18), 0, 0.45):
        fail()
    overrides = properties.get('lightRegionOverrides', {})
    if not isinstance(overrides, dict) or len(overrides) > 1024:
        fail()
    # 光区的必填字段与取值范围；offsetX / offsetZ 等是可选的扩展字段。
    region_bounds = {
        'width': (0.5, 20),
        'depth': (0.5, 20),
        'rotation': (-180, 180),
        'softness': (0.05, 1)}
    region_fields = {*region_bounds, 'shape'}
    region_optional = {
        'offsetX',
        'offsetZ',
        'heightMax',
        'heightMin',
        'heightAbove',
        'heightBelow',
        'moveCenterEnabled'}
    for key, region in overrides.items():
        if not text(key, 2048):
            fail()
        try:
            pair = json.loads(key)
        except (ValueError, RecursionError):
            fail()
        if not isinstance(pair, list) or len(pair) != 2 or any(not text(value) or not value for value in pair):
            fail()
        if canonical_json(pair) != key:
            fail()
        if not isinstance(region, dict) or not region_fields <= set(region) or set(region) - region_fields - region_optional:
            fail()
        if any(field in region and not number(region[field], -100, 100) for field in ('offsetX', 'offsetZ')):
            fail()
        if any(field in region and not number(region[field], 0, 20) for field in ('heightAbove', 'heightBelow', 'heightMin', 'heightMax')):
            fail()
        if 'heightMin' in region and 'heightMax' in region and region['heightMin'] > region['heightMax']:
            fail()
        if 'moveCenterEnabled' in region and not isinstance(region['moveCenterEnabled'], bool):
            fail()
        # 四种光区形状对应前端不同的遮罩绘制方式。
        if region['shape'] not in ('circle', 'square', 'ellipse', 'strip'):
            fail()
        if any(not number(region[field], *bounds) for field, bounds in region_bounds.items()):
            fail()
    # backgroundVisible 缺省 False：画布默认透明，只有显式 true 才画背景与网格。
    if properties.get('layoutMode', 'free') not in {
        'fill',
        'free'} or not isinstance(properties.get('backgroundVisible', False), bool):
        fail()
    if not isinstance(properties.get('backgroundTheme', 'grid'), str) or properties.get('backgroundTheme', 'grid') not in {
        'dots',
        'grid',
        'contours'}:
        fail()
    # 材质风格：默认风格与「暖阳原木」。后端不放开 warm-sunlight ——
    if str(properties.get('sceneStyle', 'default')) not in {
        'default',
        'warm-wood'}:
        fail()
    # 墙体透明度：null 表示跟随主题默认值；给了值就必须是 0~1 的比例。
    if properties.get('wallOpacity') is not None and not number(properties['wallOpacity'], 0, 1):
        fail()
    # 动态背景开关：只有显式关掉（false）才停帧，其余一律按布尔处理。
    if not isinstance(properties.get('backgroundMotion', True), bool):
        fail()
    # 这一条单独给出文案：便于前端区分「转动分辨率」设置项自身非法。
    if properties.get('motionRenderScale') is not None and not number(properties['motionRenderScale'], 0.25, 1):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='3D 转动分辨率无效')
    # 舞台整体渲染倍率；转动时的降级倍率另由 motionRenderScale 控制（可为 None）。
    if not number(properties.get('renderScale', 1), 0.25, 2):
        fail()
    if not number(properties.get('focusVignetteStrength', 14), 0, 60):
        fail()
    if not number(properties.get('popupOpacity', 74), 0, 100):
        fail()
    if 'hideIconsWhileRotating' in properties and not isinstance(properties['hideIconsWhileRotating'], bool):
        fail()
    interaction = properties.get('interaction', {})
    if not isinstance(interaction, dict) or set(interaction) - {
        'panEnabled',
        'zoomEnabled',
        'rotationMode'}:
        fail()
    if interaction.get('rotationMode', 'free') not in {
        'free',
        'vertical',
        'horizontal'}:
        fail()
    if any(not isinstance(interaction.get(key, True), bool) for key in ('panEnabled', 'zoomEnabled')):
        fail()
    # 自动旋转：方向、速度（度/秒）与空闲触发秒数；returnToDefault 表示停止后是否转回默认视角。
    auto_rotate = properties.get('autoRotate', {})
    if not isinstance(auto_rotate, dict) or set(auto_rotate) - {
        'speed',
        'enabled',
        'direction',
        'idleSeconds',
        'returnToDefault'}:
        fail()
    if not isinstance(auto_rotate.get('enabled', False), bool):
        fail()
    if not isinstance(auto_rotate.get('returnToDefault', False), bool):
        fail()
    if auto_rotate.get('direction', 'clockwise') not in ('clockwise', 'counterclockwise'):
        fail()
    # 空闲秒数只收整数：界面上是整数输入框，范围 1~3600 秒。
    idle_seconds = auto_rotate.get('idleSeconds', 30)
    if not isinstance(idle_seconds, int) or not number(idle_seconds, 1, 3600):
        fail()
    if not number(auto_rotate.get('speed', 6), 0.5, 30):
        fail()
    # 空闲隐藏图标；与 idleExitFocus 一样只有开关与秒数两个字段。
    idle_hide_icons = properties.get('idleHideIcons', {})
    if not isinstance(idle_hide_icons, dict) or set(idle_hide_icons) - {
        'enabled',
        'idleSeconds'}:
        fail()
    if not isinstance(idle_hide_icons.get('enabled', False), bool):
        fail()
    hide_idle_seconds = idle_hide_icons.get('idleSeconds', 30)
    if not isinstance(hide_idle_seconds, int) or not number(hide_idle_seconds, 1, 3600):
        fail()
    idle_exit_focus = properties.get('idleExitFocus', {})
    if not isinstance(idle_exit_focus, dict) or set(idle_exit_focus) - {
        'enabled',
        'idleSeconds'}:
        fail()
    if not isinstance(idle_exit_focus.get('enabled', False), bool):
        fail()
    exit_idle_seconds = idle_exit_focus.get('idleSeconds', 30)
    if not isinstance(exit_idle_seconds, int) or not number(exit_idle_seconds, 1, 3600):
        fail()
    lighting = properties.get('baseLighting', {})
    bounds = {
        'exposure': (0.5, 2),
        'hemisphereIntensity': (0, 3),
        'ambientIntensity': (0, 2),
        'mainIntensity': (0, 5),
        'mainAzimuth': (-180, 180),
        'mainElevation': (5, 89),
        'mainShadowIntensity': (0, 1),
        'fillIntensity': (0, 3),
        'fillAzimuth': (-180, 180),
        'fillElevation': (0, 89),
        'topIntensity': (0, 3),
        'topAzimuth': (-180, 180),
        'topElevation': (0, 89)}
    # 地面亮度用百分比（50~150），与上面 0~1 的强度量纲不同，故单独追加而不写进字面量。
    bounds['floorBrightness'] = (50, 150)
    if not isinstance(lighting, dict) or set(lighting) - set(bounds) or any(not number(value, *bounds[key]) for key, value in lighting.items()):
        fail()
    for key in ('label', 'instanceName', 'floorSelection'):
        if key in properties and not text(properties[key]):
            fail()
    # sceneId 必须由 /scenes 接口生成（32 位十六进制），前端不能自造。
    scene_id = properties.get('sceneId', '')
    if not isinstance(scene_id, str) or not scene_id or not re.fullmatch('[0-9a-f]{32}', scene_id):
        fail()
    # 灯光表：entityId 可空（纯装饰的灯），一旦填写就必须是合法的 HA 实体 ID。
    entity, fields, high, low = _validate_lights(fail, key, number, positive_number, properties, text, validate_camera)
    # 环境设备：窗帘（含窗帘组合）、空调、空气净化器与温湿度计五张表。窗帘 / 空调 / 净化器
    entity, fields, item, key, model = _validate_environment(fail, high, low, number, positive_number, properties, text, validate_camera)
    # 设备表：NAS、扫地机、电视，再加上通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 /
    devices = properties.get('devices', {})
    if not isinstance(devices, dict) or set(devices) - {
        'nas',
        'vacuums',
        'televisions'} - set(GENERIC_DEVICE_COLLECTIONS):
        fail()
    for profile in DEVICE_PROFILES.values():
        validate_device_bindings(
            devices.get(profile['collection'], []),
            validate_camera,
            model_type=profile['model_type'])
    televisions = devices.get('televisions', [])
    if not isinstance(televisions, list):
        fail()
    tv_ids = set()
    tv_models = set()
    for item in televisions:
        fields = {
            'x',
            'y',
            'id',
            'icon',
            'size',
            'label',
            'height',
            'floorId',
            'hitSize',
            'modelId',
            'visible',
            'entityId',
            'iconSize',
            'clickAction',
            'focusCamera',
            'buttonHidden',
            'powerEntityId',
            'hiddenClickable'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'powerEntityId', 'label')):
            fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in tv_ids or model in tv_models:
            fail()
        tv_ids.add(item['id'])
        tv_models.add(model)
        if item.get('entityId') and not re.fullmatch('media_player\\.[a-z0-9_]+', item['entityId']):
            fail()
        if item.get('powerEntityId') and not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', item['powerEntityId']):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            fail()
        if item.get('clickAction', 'focus-panel') not in ('focus', 'focus-panel', 'panel'):
            fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9-]{1,120}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
    # 扫地机：地图与快捷入口是嵌套结构；relatedEntityIds 是额外放开控制的相关实体。
    vacuums = devices.get('vacuums', [])
    if not isinstance(vacuums, list):
        fail()
    vacuum_ids = set()
    vacuum_models = set()
    for item in vacuums:
        fields = {
            'x',
            'y',
            'id',
            'map',
            'icon',
            'size',
            'label',
            'height',
            'floorId',
            'hitSize',
            'modelId',
            'visible',
            'deviceId',
            'entityId',
            'iconSize',
            'shortcuts',
            'deviceName',
            'clickAction',
            'focusCamera',
            'funMessages',
            'buttonHidden',
            'followCamera',
            'motionEnabled',
            'hiddenClickable',
            'relatedEntityIds'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in vacuum_ids or model in vacuum_models:
            fail()
        vacuum_ids.add(item['id'])
        vacuum_models.add(model)
        if item.get('entityId') and not re.fullmatch('vacuum\\.[a-z0-9_]+', item['entityId']):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            fail()
        if item.get('clickAction', 'focus-panel') not in ('focus', 'focus-panel', 'panel'):
            fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9-]{1,120}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
        validate_camera(item.get('followCamera'))
        # 地图贴片：宽深必须为正，rotation 允许 -360~360，opacity 是百分比。
        mapping = item.get('map', {})
        if not isinstance(mapping, dict) or set(mapping) - {
            'x',
            'y',
            'depth',
            'width',
            'opacity',
            'visible',
            'entityId',
            'rotation',
            'sourceMapId'}:
            fail()
        if 'sourceMapId' in mapping and (not isinstance(mapping['sourceMapId'], str) or not 0 < len(mapping['sourceMapId']) <= 128):
            fail()
        if mapping.get('entityId') and (not text(mapping['entityId']) or not re.fullmatch('(?:camera|image)\\.[a-z0-9_]+', mapping['entityId'])):
            fail()
        if any(key in mapping and not number(mapping[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('width', 0.01, 1000000), ('depth', 0.01, 1000000), ('rotation', -360, 360), ('opacity', 0, 100))):
            fail()
        if 'visible' in mapping and not isinstance(mapping['visible'], bool):
            fail()
        shortcuts = item.get('shortcuts', [])
        if not isinstance(shortcuts, list):
            fail()
        shortcut_ids = set()
        for shortcut in shortcuts:
            if not isinstance(shortcut, dict) or set(shortcut) - {
                'x',
                'y',
                'id',
                'icon',
                'size',
                'label',
                'height',
                'hitSize',
                'visible',
                'entityId',
                'fontSize',
                'iconSize',
                'iconHidden',
                'labelHidden',
                'buttonHidden',
                'hiddenClickable'}:
                fail()
            if not text(shortcut.get('id')) or not shortcut['id'] or shortcut['id'] in shortcut_ids:
                fail()
            shortcut_ids.add(shortcut['id'])
            if not text(shortcut.get('label', '')) or not text(shortcut.get('entityId', '')):
                fail()
            if shortcut.get('entityId') and not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', shortcut['entityId']):
                fail()
            if any(not number(shortcut.get(key), -1000000, 1000000) for key in ('x', 'y')):
                fail()
            if any(key in shortcut and not positive_number(shortcut[key]) for key in ('size', 'iconSize', 'hitSize', 'fontSize')):
                fail()
            if 'height' in shortcut and not number(shortcut['height'], 0, 20):
                fail()
            if 'icon' in shortcut and (not isinstance(shortcut['icon'], str) or not re.fullmatch('mdi:[a-z0-9-]{1,120}', shortcut['icon'])):
                fail()
            if any(key in shortcut and not isinstance(shortcut[key], bool) for key in ('hiddenClickable', 'buttonHidden', 'iconHidden', 'labelHidden')):
                fail()
            if 'visible' in shortcut and not isinstance(shortcut['visible'], bool):
                fail()
        if any(not text(item.get(key, '')) for key in ('deviceId', 'deviceName')):
            fail()
        related = item.get('relatedEntityIds', [])
        if not isinstance(related, list) or any(not text(entity) or not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', entity) for entity in related):
            fail()
    # NAS 面板：statusSource 描述由哪台设备驱动，可选的可见指标与分组顺序控制展示。
    nas = devices.get('nas', [])
    if not isinstance(nas, list):
        fail()
    ids = set()
    models = set()
    for item in nas:
        fields = {
            'x',
            'y',
            'id',
            'icon',
            'size',
            'label',
            'height',
            'floorId',
            'hitSize',
            'modelId',
            'visible',
            'entityId',
            'iconSize',
            'clickAction',
            'focusCamera',
            'buttonHidden',
            'statusSource',
            'hiddenClickable'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in ids or model in models:
            fail()
        ids.add(item['id'])
        models.add(model)
        entity = item.get('entityId', '')
        if entity and not re.fullmatch('(?:binary_sensor|switch|input_boolean)\\.[a-z0-9_]+', entity):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            fail()
        if item.get('clickAction', 'focus') not in ('focus', 'focus-panel', 'panel'):
            fail()
        # statusSource 的 primaryEntityId 必须落在 metrics 里（除非为空），
        if 'statusSource' in item:
            source = item['statusSource']
            required = {
                'name',
                'metrics',
                'deviceId',
                'platform',
                'primaryEntityId'}
            if not isinstance(source, dict) or not required.issubset(source) or set(source) - required - {
                'visibleMetrics',
                'groupOrder'}:
                fail()
            if not text(source['deviceId']) or not source['deviceId'] or not text(source['name']) or source['platform'] not in ('fnos', 'synology_dsm'):
                fail()
            if not isinstance(source['primaryEntityId'], str) or source['primaryEntityId'] != '' and not re.fullmatch('(?:sensor|binary_sensor)\\.[a-z0-9_]+', source['primaryEntityId']):
                fail()
            if not isinstance(source['metrics'], list):
                fail()
            metric_ids = set()
            for metric in source['metrics']:
                if not isinstance(metric, dict) or set(metric) != {
                    'kind',
                    'group',
                    'label',
                    'entityId'}:
                    fail()
                entity_id = metric['entityId']
                if not isinstance(entity_id, str) or not re.fullmatch('(?:sensor|binary_sensor)\\.[a-z0-9_]+', entity_id) or entity_id in metric_ids:
                    fail()
                metric_ids.add(entity_id)
                if not text(metric['label']) or metric['group'] not in ('system', 'storage', 'network', 'health') or metric['kind'] not in ('number', 'status', 'problem', 'timestamp'):
                    fail()
            if metric_ids and source['primaryEntityId'] not in metric_ids or not metric_ids and source['primaryEntityId'] != '':
                fail()
            # visibleMetrics 是展示白名单：必须是 metrics 的子集且不重复。
            if 'visibleMetrics' in source:
                visible = source['visibleMetrics']
                if not isinstance(visible, list) or any(not isinstance(entity, str) or entity not in metric_ids for entity in visible) or len(set(visible)) != len(visible):
                    fail()
            # groupOrder 是分组排序：最多 4 组，取值来自已知分组且不重复。
            if 'groupOrder' in source:
                order = source['groupOrder']
                if not isinstance(order, list) or len(order) > 4 or any(not isinstance(group, str) or group not in ('system', 'storage', 'network', 'health') for group in order) or len(set(order)) != len(order):
                    fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
    validate_camera(properties.get('camera'))
    return None
