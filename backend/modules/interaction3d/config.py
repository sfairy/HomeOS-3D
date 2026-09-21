"""3D 增量包自己的配置契约：校验控件 properties 是否合法。

刻意独立于仪表盘弹窗的 pydantic 模型（panel/schema.py）：3D 控件的配置
字段多且迭代快，前后端约定用 JSON 交换，这里用「白名单 + 手工逐字段校验」
实现，只要出现未登记字段就整份拒绝。

两类校验都在这里完成：结构性（字段是否存在、类型、范围、ID 是否唯一）
与引用性（实体 ID 的域是否与设备种类匹配、场景 / 模型 ID 是否存在于配置里）。
写库前一定先过这一层。
"""
import itertools
import json
import math
import re

from fastapi import HTTPException

from ...core.canonical_json import canonical_json


def validate_config(properties: dict) -> None:
    """校验一份 3D 交互控件的 properties。
    异常:
        HTTPException: 422，任一字段非法。大部分分支共用下面的 fail()，
        因此文案统一；个别字段（如转动分辨率）会给出更具体的提示。
    """

    def fail():
        """统一的 422 出口：文案固定，不把内部字段名暴露给前端。"""
        raise HTTPException(422, detail='3D 交互配置无效，请检查户型、灯光、环境及图标设置。')

    def number(value, low, high):
        """值是否为 [low, high] 内的有限实数；bool 需单独排除（它是 int 的子类）。"""
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return False
        try:
            return math.isfinite(value) and low <= value <= high
        except OverflowError:
            return False

    def positive_number(value):
        """严格正数：尺寸、命中区域取 0 没有意义，因此 0 不算合法。"""
        return number(value, 0, math.inf) and value > 0

    def text(value, length=128):
        """是否为长度不超过 length 的字符串（默认上限与前端输入框一致）。"""
        return isinstance(value, str) and len(value) <= length

    def validate_camera(camera, *, allow_legacy_interaction=False):
        """校验相机参数对象；None 表示未配置，直接放行。

        必填是 mode / zoom / target / position，其余按出现与否校验。
        allow_legacy_interaction=True 时额外接受旧自由视角的三个字段，
        仅供顶层 camera 的历史数据使用。
        """
        if camera is None:
            return None
        # required 缺一不可；optional 是「出现才校验」的字段。
        required = {'mode', 'zoom', 'target', 'position'}
        optional = {'up', 'view', 'frameSize', 'focalLength', 'topRotation'}
        # 历史字段：只为兼容旧文档，新写入的视角配置不会再产生它们。
        if allow_legacy_interaction:
            optional.update({'panEnabled', 'zoomEnabled', 'rotationMode'})
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
        # 旧版视角开关：rotationMode 决定可转动的轴向，panEnabled / zoomEnabled 缺省为 True。
        if allow_legacy_interaction:
            if camera.get('rotationMode', 'free') not in ('free', 'horizontal', 'vertical'):
                fail()
            if any(not isinstance(camera.get(key, True), bool) for key in ('panEnabled', 'zoomEnabled')):
                fail()
        return None

    # properties 白名单：出现任何未登记字段就整份拒绝。
    # 新增字段必须前后端同步发版，旧后端不会静默丢掉自己认不出的配置。
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
        'backgroundVisible',
        'motionRenderScale',
        'lightRegionOverrides',
        'uniformOverviewStack',
        'focusVignetteStrength',
        'hideIconsWhileRotating'}:
        fail()
    # 安防：摄像头与人形传感器两张表，各自的字段与范围都在下面单独校验。
    security = properties.get('security', {})
    if not isinstance(security, dict) or set(security) - {
        'presenceSensors',
        'cameras'}:
        fail()
    cameras = security.get('cameras', [])
    if not isinstance(cameras, list):
        fail()
    # id 全局唯一，(floorId, modelId) 组合也唯一 —— 同一个模型上不该挂两个摄像头。
    camera_ids = set()
    camera_models = set()
    for item in cameras:
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
            'fontSize',
            'iconSize',
            'focusCamera',
            'buttonHidden'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key)) or not item[key] for key in ('id', 'floorId', 'modelId')) or item['id'] in camera_ids or (item['floorId'], item['modelId']) in camera_models:
            fail()
        camera_ids.add(item['id'])
        camera_models.add((item['floorId'], item['modelId']))
        # 'all' 是「全部楼层」的伪楼层：摄像头必须挂在具体楼层上，否则无法定位。
        if item['floorId'] == 'all':
            fail()
        # 只接受 camera.* 域的实体：别的域放进来会渲染出取不到流的状态。
        if not isinstance(item.get('entityId', ''), str) or not item.get('entityId') or not re.fullmatch('camera\\.[a-z0-9_]+', item['entityId']):
            fail()
        if not text(item.get('label', '')) or not text(item.get('icon', '')):
            fail()
        for key, low, high in (('x', -1e+06, 1e+06), ('y', -1e+06, 1e+06), ('height', -1000, 1000), ('size', 1, 1000), ('iconSize', 1, 1000), ('fontSize', 1, 1000), ('hitSize', 1, 1000)):
            if key not in item:
                continue
            if number(item[key], low, high):
                continue
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'buttonHidden')):
            fail()
        validate_camera(item.get('focusCamera'))
    # 人形传感器：除基本字段外还有路径、触发模式与展示页范围三组约束。
    people = security.get('presenceSensors', [])
    if not isinstance(people, list):
        fail()
    # id 全局唯一；每层最多一个同模型（modelId）的人形，避免重叠渲染。
    presence_ids = set()
    presence_models = set()
    for person in people:
        if not isinstance(person, dict) or set(person) - {
            'id',
            'size',
            'color',
            'label',
            'route',
            'speed',
            'floorId',
            'modelId',
            'deviceId',
            'entityId',
            'character',
            'waveScale',
            'deviceName',
            'hitPadding',
            'focusCamera',
            'routeClosed',
            'triggerMode',
            'waveEnabled',
            'waveOpacity',
            'clickToFocus',
            'displayPages',
            'triggerValue',
            'displayDuration',
            'triggerThreshold'}:
            fail()
        if any(not text(person.get(key, '')) for key in ('deviceId', 'deviceName')):
            fail()
        ident = person.get('id')
        if not text(ident) or not ident or ident in presence_ids:
            fail()
        presence_ids.add(ident)
        if not isinstance(person.get('waveEnabled', True), bool) or not number(person.get('waveScale', 1), 0.25, 3) or not number(person.get('waveOpacity', 68), 0, 100):
            fail()
        # 人形同样必须挂在具体楼层上：'all' 只是筛选条件，落不到具体楼层上。
        if not text(person.get('label', '')) or not text(person.get('floorId')) or person['floorId'] == 'all':
            fail()
        if 'modelId' in person:
            if not text(person['modelId']) or not person['modelId']:
                fail()
            model_key = (person.get('floorId'), person['modelId'])
            if model_key in presence_models:
                fail()
            presence_models.add(model_key)
        if not isinstance(person.get('entityId'), str) or not person['entityId'] or not re.fullmatch('[a-z_]+\\.[a-z0-9_]{1,200}', person['entityId']):
            fail()
        if person.get('character', 'traveler') not in ('traveler', 'bean', 'glow') or person.get('color', 'cyan') not in ('cyan', 'orange'):
            fail()
        trigger_mode = person.get('triggerMode', 'auto')
        if trigger_mode not in ('auto', 'threshold', 'equals', 'change'):
            fail()
        if 'triggerValue' in person and (not isinstance(person['triggerValue'], str) or len(person['triggerValue']) > 128):
            fail()
        if trigger_mode == 'equals' and not str(person.get('triggerValue', 'on')).strip():
            fail()
        if 'triggerThreshold' in person and not number(person['triggerThreshold'], -1000000, 1000000):
            fail()
        # 事件类触发（equals / change，或 auto 且实体属于 event 域）才需要停留时长；
        # 常驻展示允许 0，表示一直留在页面上。
        event_sensor = trigger_mode in ('equals', 'change') or trigger_mode == 'auto' and person['entityId'].startswith('event.')
        if not number(person.get('displayDuration', 30 if event_sensor else 0), 1 if event_sensor else 0, 3600):
            fail()
        # 展示页范围：'all' 表示全部页面；给列表时要求 1~6 个、都在已知页面集合内且不重复。
        pages = person.get('displayPages', ['overview', 'light', 'security'])
        if pages != 'all' and (not isinstance(pages, list) or not 1 <= len(pages) <= 6 or any(not isinstance(page, str) or page not in ('overview', 'light', 'environment', 'devices', 'vacuum', 'security') for page in pages) or len(set(pages)) != len(pages)):
            fail()
        if not number(person.get('speed', 0.45), 0.1, 2) or not number(person.get('size', 1), 0.25, 3):
            fail()
        if not isinstance(person.get('clickToFocus', False), bool) or not number(person.get('hitPadding', 8), 0, 80):
            fail()
        validate_camera(person.get('focusCamera'))
        route = person.get('route')
        if not isinstance(person.get('routeClosed', True), bool):
            fail()
        if not isinstance(route, list) or not (0 if person.get('routeClosed') is False else 3) <= len(route) <= 128 or any(not isinstance(p, dict) or set(p) != {'x', 'y'} or not all(number(p[k], -1000000, 1000000) for k in ('x', 'y')) for p in route):
            fail()
        # 开放路径（走到终点不返回）跳过闭合性检查：重复顶点与面积要求只对环路成立。
        if person.get('routeClosed') is False:
            continue
        # 闭合路径不允许重复顶点：重复会让路径自交、动画抖动。
        if len({(p['x'], p['y']) for p in route}) != len(route):
            fail()
        # 闭合路径必须存在非共线的三点（用叉积判断），否则退化成线段，无法形成可绕行的环路。
        a = route[0]
        # 相邻三点用 `pairwise(route[1:])`，而不是 `zip(route[1:], route[2:])`：
        # 那两个切片长度本就差 1，那样的 zip 只能靠默认的「按短截断」才跑得起来，
        # 而这正是 B905 要拦的语义（写 strict=False 等于把「长度不等是故意的」变成噪声）。
        if not any(abs((b['x'] - a['x']) * (c['y'] - a['y']) - (b['y'] - a['y']) * (c['x'] - a['x'])) > 1e-06 for b, c in itertools.pairwise(route[1:])):
            fail()
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
        # 单页覆盖里的 autoRotate / idleHideIcons 允许写 bool 简写（等价于 {enabled: ...}），
        # 归一后递归再走一遍完整校验，避免两处各维护一套规则。
        # 用 type(value) is bool 而不是 isinstance：1 / 0 这类整数不该被当成开关简写。
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
    # 0 被排除是因为它在界面上语义歧义（地面层还是未设置）。
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
    # standard = 全屋统一灯光；region = 按光区分区，后者才用得上 lightRegionOverrides。
    if properties.get('lightingMode', 'standard') not in ('standard', 'region'):
        fail()
    # 地面反射：resolution 只允许 256 / 512 / 768 三档渲染目标，strength 上限 0.45 防止过曝。
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
    # 光区覆盖表的键必须是 json.dumps([floorId, regionId], separators=(',', ':')) 的精确文本，
    # 下面会把它解析回来，确认键本身可还原成一对 ID。
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
        # 高度区间不能为空，否则光区算不出可见范围。
        if 'heightMin' in region and 'heightMax' in region and region['heightMin'] > region['heightMax']:
            fail()
        if 'moveCenterEnabled' in region and not isinstance(region['moveCenterEnabled'], bool):
            fail()
        # 四种光区形状对应前端不同的遮罩绘制方式。
        if region['shape'] not in ('circle', 'square', 'ellipse', 'strip'):
            fail()
        if any(not number(region[field], *bounds) for field, bounds in region_bounds.items()):
            fail()
    if properties.get('layoutMode', 'free') not in {
        'fill',
        'free'} or not isinstance(properties.get('backgroundVisible', True), bool):
        fail()
    if not isinstance(properties.get('backgroundTheme', 'grid'), str) or properties.get('backgroundTheme', 'grid') not in {
        'dots',
        'grid',
        'contours'}:
        fail()
    # 材质风格：默认风格与「暖阳原木」。后端不放开 warm-sunlight ——
    # 「暖阳微光」是运行时派生出来的背景主题，不下发也不落库。
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
        raise HTTPException(status_code=422, detail='3D 转动分辨率无效')
    # 舞台整体渲染倍率；转动时的降级倍率另由 motionRenderScale 控制（可为 None）。
    if not number(properties.get('renderScale', 1), 0.25, 2):
        fail()
    if not number(properties.get('focusVignetteStrength', 14), 0, 60):
        fail()
    if not number(properties.get('popupOpacity', 74), 0, 100):
        fail()
    if 'hideIconsWhileRotating' in properties and not isinstance(properties['hideIconsWhileRotating'], bool):
        fail()
    # 视角交互：panEnabled / zoomEnabled 缺省为 True（与旧版一致），rotationMode 决定可转动轴向。
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
    # 基光参数的取值范围；仰角下限（5° / 0°）是为了避免光源与地面共面时出现闪烁。
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
    lights = properties.get('lights', [])
    if not isinstance(lights, list):
        fail()
    ids = set()
    for light in lights:
        if not isinstance(light, dict) or set(light) - {
            'x',
            'y',
            'id',
            'icon',
            'size',
            'label',
            'height',
            'floorId',
            'groupId',
            'hitSize',
            'visible',
            'entityId',
            'iconSize',
            'clickAction',
            'effectRange',
            'focusCamera',
            'buttonHidden',
            'fadeDuration',
            'effectDefaults',
            'hiddenClickable'}:
            fail()
        if any(not text(light.get(key, '')) for key in ('id', 'floorId', 'groupId', 'entityId', 'label')):
            fail()
        if not light.get('id') or light['id'] in ids:
            fail()
        ids.add(light['id'])
        entity = light.get('entityId', '')
        if entity and not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', entity):
            fail()
        if not all(number(light.get(key), low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if not positive_number(light.get('size')):
            fail()
        if 'visible' in light and not isinstance(light['visible'], bool):
            fail()
        if any(key in light and not isinstance(light[key], bool) for key in ('hiddenClickable', 'buttonHidden')):
            fail()
        # 点击行为：focus 只聚焦；turn-on* 系列会同时开灯，turn-on-panel 还会打开面板。
        if light.get('clickAction', 'focus') not in ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            fail()
        if any(key in light and not positive_number(light[key]) for key in ('iconSize', 'hitSize')):
            fail()
        if 'icon' in light and (not isinstance(light['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', light['icon'])):
            fail()
        if 'fadeDuration' in light and not number(light['fadeDuration'], 0, 10):
            fail()
        # 默认灯光效果：亮度百分比与色温（K），不填表示不做预设。
        # 亮度上限 150% 与前端编辑器一致，两端必须同步放宽，否则前端填的值会被这里拒掉。
        if 'effectDefaults' in light:
            defaults = light['effectDefaults']
            bounds = {
                'brightness': (0, 150),
                'kelvin': (1000, 20000)}
            if not isinstance(defaults, dict) or set(defaults) - set(bounds) or any(not number(value, *bounds[key]) for key, value in defaults.items()):
                fail()
        # effectRange 是该灯可调范围的显式覆盖：四个字段必须全给，且 min <= max。
        effect_range = light.get('effectRange')
        if effect_range is not None:
            fields = {
                'brightnessMax',
                'brightnessMin',
                'temperatureMax',
                'temperatureMin'}
            if not isinstance(effect_range, dict) or set(effect_range) != fields:
                fail()
            for minimum, maximum, low, high in (('brightnessMin', 'brightnessMax', 0, 150), ('temperatureMin', 'temperatureMax', 1000, 20000)):
                if not number(effect_range[minimum], low, high) or not number(effect_range[maximum], low, high) or effect_range[minimum] > effect_range[maximum]:
                    fail()
        validate_camera(light.get('focusCamera'))
    # 环境设备：窗帘与空调两张表，各自绑定到场景里的 3D 模型。
    environment = properties.get('environment', {})
    if not isinstance(environment, dict) or set(environment) - {
        'curtains',
        'dimStrength',
        'airConditioners'}:
        fail()
    # dimStrength 是环境设备通用的压暗强度（百分比），默认 70。
    if not number(environment.get('dimStrength', 70), 0, 100):
        fail()
    # 空调：entityId 只允许 climate.* 域，且 (楼层, 模型) 组合唯一。
    air_conditioners = environment.get('airConditioners', [])
    if not isinstance(air_conditioners, list):
        fail()
    ids = set()
    models = set()
    for item in air_conditioners:
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
        if entity and not re.fullmatch('climate\\.[a-z0-9_]+', entity):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            fail()
        if item.get('clickAction', 'focus') not in ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
    # 窗帘：entityId 只允许 cover.* 域；coverKind 区分普通帘与梦幻帘（可控时机不同）。
    curtains = environment.get('curtains', [])
    if not isinstance(curtains, list):
        fail()
    ids = set()
    models = set()
    for item in curtains:
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
            'coverKind',
            'clickAction',
            'focusCamera',
            'buttonHidden',
            'curtainFabric',
            'coverDirection',
            'hiddenClickable',
            'unboundPosition',
            'iconStateReversed'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            fail()
        if not item.get('id') or item['id'] in ids:
            fail()
        ids.add(item['id'])
        model = (item.get('floorId', ''), item.get('modelId', ''))
        if all(model):
            if model in models:
                fail()
            models.add(model)
        entity = item.get('entityId', '')
        if entity and not re.fullmatch('cover\\.[a-z0-9_]+', entity):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            fail()
        if item.get('clickAction', 'focus') not in ('focus', 'panel'):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if item.get('coverDirection', 'auto') not in ('auto', 'left', 'right', 'split'):
            fail()
        if item.get('coverKind', 'standard') not in ('standard', 'dream'):
            fail()
        if item.get('curtainFabric', 'cloth') not in ('cloth', 'sheer'):
            fail()
        if 'unboundPosition' in item and not number(item['unboundPosition'], 0, 100):
            fail()
        if 'iconStateReversed' in item and not isinstance(item['iconStateReversed'], bool):
            fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
    # 设备三张表：NAS、扫地机与电视，各自的字段结构都不相同。
    devices = properties.get('devices', {})
    if not isinstance(devices, dict) or set(devices) - {
        'nas',
        'vacuums',
        'televisions'}:
        fail()
    # 电视：entityId 是 media_player.*，电源实体另存 powerEntityId（允许 switch 等其它域）。
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
        # 保证被选为主状态的实体确实会渲染到面板上。
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
    # 顶层默认相机允许历史交互字段，理由见 validate_camera 的说明。
    validate_camera(properties.get('camera'), allow_legacy_interaction=True)
    return None
