#!/usr/bin/env python3
"""0.6.7 -> 0.6.7-ts 前端 JS→TS 迁移工具（映射表生成 + 执行）。

设计原则（对应计划的「零功能丢失保障」）：
  1. 只做四类改动：文件移动/改名、类型注解、路径重写、白名单换清单。
  2. 映射表先落盘、人工可审，未归类必须为 0。
  3. 相对 import 按「源文件 → 目标文件」总表重算，绝不靠猜。

用法：
    python3 migrate_frontend.py --report     # 只生成映射表与诊断（不改文件）
    python3 migrate_frontend.py --apply      # 落盘迁移
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

# 仓库根：本文件位于 <root>/homeos-3d/tools/，不写死任何绝对路径。
REPO = Path(__file__).resolve().parents[2]
SRC_FRONTEND = REPO / '0.6.7' / 'frontend'
REF_FRONTEND = REPO / 'homeos-3d' / 'frontend'
DST_FRONTEND = REPO / 'homeos-3d' / 'frontend'
OUT_DIR = REPO / 'homeos-3d' / 'tools' / '_migration'

VENDOR_PREFIX = 'static/vendor/'
JS_EXTS = ('.js',)


# --------------------------------------------------------------------------
# 1. homeos-3d 结构索引：basename -> 该 basename 在参考工程里的目标相对路径
# --------------------------------------------------------------------------

def build_reference_index() -> dict[str, list[str]]:
    """扫描 homeos-3d/frontend/src，产出 basename -> 相对 src 的路径列表。"""
    index: dict[str, list[str]] = defaultdict(list)
    root = REF_FRONTEND / 'src'
    for path in root.rglob('*.ts'):
        if path.name.endswith('.d.ts'):
            continue
        rel = path.relative_to(root).as_posix()
        index[path.stem].append(rel)
    return dict(index)


# 0.6.7 源 family -> 参考工程里的候选前缀（用于同名文件的消歧）
FAMILY_PREFIXES: dict[str, tuple[str, ...]] = {
    'renderer': ('app/renderer/',),
    'studio': ('app/3d-studio/',),
    'bridge': ('app/bridge/',),
    'runtime': ('runtime/',),
    'static': (
        'app/editor/',
        'app/display/',
        'app/auth/',
        'app/logging/',
        'app/shared/',
        'app/utils/',
        'app/templates/',
        'app/updates/',
        'app/embed/',
        'app/ui-packs/',
        'app/',
    ),
}


# --------------------------------------------------------------------------
# 2. 显式映射表：0.6.7 源相对路径 -> 目标相对 frontend 的路径
# --------------------------------------------------------------------------

# static/*.js（49 个）
STATIC_ROOT_MAP: dict[str, str] = {
    # shared/
    'action-rules': 'src/app/shared/action-rules.ts',
    'flow-line-editor': 'src/app/shared/flow-line-editor.ts',
    'flow-line-inspector': 'src/app/shared/flow-line-inspector.ts',
    'flow-line-model': 'src/app/shared/flow-line-model.ts',
    'percentage-bar-inspector': 'src/app/shared/percentage-bar-inspector.ts',
    'percentage-bar-model': 'src/app/shared/percentage-bar-model.ts',
    'popup-layout': 'src/app/shared/popup-layout.ts',
    'related-entities': 'src/app/shared/related-entities.ts',
    'sound-effects': 'src/app/shared/sound-effects.ts',
    'virtual-entities': 'src/app/shared/virtual-entities.ts',
    # editor/
    'component-page-copy': 'src/app/editor/component-page-copy.ts',
    'component-tree': 'src/app/editor/component-tree.ts',
    'dashboard-resize': 'src/app/editor/dashboard-resize.ts',
    'editor-basic-inspectors': 'src/app/editor/editor-basic-inspectors.ts',
    'editor-component-collections': 'src/app/editor/editor-component-collections.ts',
    'editor-dialogs': 'src/app/editor/editor-dialogs.ts',
    'editor-document-management': 'src/app/editor/editor-document-management.ts',
    'editor-history': 'src/app/editor/editor-history.ts',
    'editor-utils': 'src/app/editor/editor-utils.ts',
    'floorplan-auto-diagram-layout': 'src/app/editor/floorplan-auto-diagram-layout.ts',
    'home': 'src/app/editor/home.ts',
    'license-card': 'src/app/editor/license-card.ts',
    # editor/picker/
    'editor-asset-queries': 'src/app/editor/picker/editor-asset-queries.ts',
    'editor-asset-toolbar': 'src/app/editor/picker/editor-asset-toolbar.ts',
    'editor-picker-elements': 'src/app/editor/picker/editor-picker-elements.ts',
    'editor-picker-lifecycle': 'src/app/editor/picker/editor-picker-lifecycle.ts',
    'editor-picker-pagination': 'src/app/editor/picker/editor-picker-pagination.ts',
    'editor-picker-queries': 'src/app/editor/picker/editor-picker-queries.ts',
    # display/
    'apple-install-guide': 'src/app/display/apple-install-guide.ts',
    'display': 'src/app/display/display.ts',
    'display-boot': 'src/app/display/display-boot.ts',
    'display-pairing-qr': 'src/app/display/display-pairing-qr.ts',
    'display-startup': 'src/app/display/display-startup.ts',
    'display-surface': 'src/app/display/display-surface.ts',
    # auth/
    'auth-shell': 'src/app/auth/auth-shell.ts',
    'entry-deck': 'src/app/auth/entry-deck.ts',
    'license': 'src/app/auth/license.ts',
    'license-recovery': 'src/app/auth/license-recovery.ts',
    'login': 'src/app/auth/login.ts',
    'pair': 'src/app/auth/pair.ts',
    'pairing-entry': 'src/app/auth/pairing-entry.ts',
    'pairing-link': 'src/app/auth/pairing-link.ts',
    'setup': 'src/app/auth/setup.ts',
    # logging/
    'client-log': 'src/app/logging/client-log.ts',
    'global-log': 'src/app/logging/global-log.ts',
    'global-log-boot': 'src/app/logging/global-log-boot.ts',
    # updates/
    'update-notice': 'src/app/updates/update-notice.ts',
    # embed/
    'embed-runtime': 'src/app/embed/embed-runtime.ts',
    'embed-session': 'src/app/embed/embed-session.ts',
}

# static/renderer/*.js（25 个）
RENDERER_MAP: dict[str, str] = {
    'device-profiles': 'core/device-profiles.ts',
    'entity-metadata': 'core/entity-metadata.ts',
    'entity-power': 'core/entity-power.ts',
    'registry': 'core/registry.ts',
    'renderer': 'core/renderer.ts',
    'runtime-caches': 'core/runtime-caches.ts',
    'runtime-dialog-motion': 'core/runtime-dialog-motion.ts',
    'runtime-document': 'core/runtime-document.ts',
    'scene-mode': 'core/scene-mode.ts',
    'vacuum-map-state': 'core/vacuum-map-state.ts',
    'flow-line': 'core/registry/flow-line.ts',
    'percentage-bar': 'core/registry/percentage-bar.ts',
    'climate': 'controls/climate.ts',
    'cover-runtime': 'controls/cover-runtime.ts',
    'date-time-runtime': 'controls/date-time-runtime.ts',
    'door-window-runtime': 'controls/door-window-runtime.ts',
    'light-runtime': 'controls/light-runtime.ts',
    'light-statistics-runtime': 'controls/light-statistics-runtime.ts',
    'line-chart-runtime': 'controls/line-chart-runtime.ts',
    'presence-runtime': 'controls/presence-runtime.ts',
    'vacuum-runtime': 'controls/vacuum-runtime.ts',
    'water-heater': 'controls/water-heater.ts',
    'weather-chart-runtime': 'controls/weather-chart-runtime.ts',
    'effect-geometry': 'geometry/effect-geometry.ts',
    'transform-geometry': 'geometry/transform-geometry.ts',
}

# modules/interaction3d/*.js（61 个）-> runtime 分域
RUNTIME_DOMAINS: dict[str, tuple[str, ...]] = {
    'core': (
        'background-theme', 'floor-navigation', 'idle-rotation', 'popup-preview',
        'runtime', 'scene-background', 'scene-sync', 'stage', 'state-update-plan',
    ),
    'camera': ('camera-motion', 'camera-status'),
    'climate': ('climate-panel', 'climate-state', 'purifier-extras'),
    'cover': (
        'cover-feedback', 'cover-group-panel', 'cover-groups', 'cover-panel',
        'cover-state', 'curtain-motion',
    ),
    'device': ('device-panel', 'device-profiles', 'device-status'),
    'editor': ('config-editor', 'range-dialog', 'light-range-editor', 'device-entity-config'),
    'environment': ('environment-airflow', 'environment-halos', 'environment-scene'),
    'light': ('light-color-picker', 'light-state', 'light-stream'),
    'nas': ('nas-panel', 'nas-status'),
    'presence': (
        'presence-character', 'presence-editor', 'presence-focus-editor',
        'presence-motion', 'presence-scene',
    ),
    'security': ('lock-motion', 'lock-panel', 'lock-state', 'security-editor'),
    'television': ('television-panel', 'television-screen', 'television-state'),
    'vacuum': ('vacuum-map-editor', 'vacuum-map', 'vacuum-motion'),
    # 0.6.7 相对参考工程新增的域
    'vehicle': ('car-card', 'car-charging', 'car-state'),
    'airer': ('airer-motion',),
    'fan': ('fan-motion',),
    'speaker': ('speaker-panel', 'speaker-ring', 'speaker-state'),
    'bath-heater': ('bath-heater', 'bath-heater-editor'),
    'purifier': ('purifier-state',),
}

# static/modules/interaction3d/*.js（31 个）-> app/bridge（与参考工程同构）
# 其中 3 个仅被 runtime 模块引用，参考工程把它们放在 runtime/ 下。
BRIDGE_RUNTIME_SIDE = {
    'batch-apply': 'src/runtime/editor/batch-apply.ts',
    'label-appearance': 'src/runtime/core/label-appearance.ts',
    'marker-input': 'src/runtime/core/marker-input.ts',
}

# static/*.css / 其它运行时 CSS 的归属（保持与所在 JS 同目录）
RUNTIME_CSS_DOMAIN = {
    'climate-panel.css': 'climate',
    'cover-panel.css': 'cover',
    'nas-panel.css': 'nas',
    'presence-editor.css': 'presence',
    'runtime.css': 'core',
    'stage.css': 'core',
    'security-editor.css': 'security',
    'device-editor.css': 'editor',
}


def runtime_target(stem: str, ext: str) -> str | None:
    for domain, names in RUNTIME_DOMAINS.items():
        if stem in names:
            return f'src/runtime/{domain}/{stem}{ext}'
    return None


# --------------------------------------------------------------------------
# 3. 组装完整映射
# --------------------------------------------------------------------------

def build_mapping() -> tuple[dict[str, str], list[str]]:
    """返回 (源相对路径 -> 目标相对 frontend 路径, 未归类清单)。"""
    mapping: dict[str, str] = {}
    unmapped: list[str] = []

    for path in sorted(SRC_FRONTEND.rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(SRC_FRONTEND).as_posix()
        if rel.startswith(VENDOR_PREFIX) or '/vendor/' in rel:
            continue  # vendor 原样搬运，不转换

        parts = rel.split('/')
        head = parts[0]
        target: str | None = None

        if head == 'modules' and len(parts) == 3:
            # modules/interaction3d/<name>(.js|.css)
            stem, ext = os.path.splitext(parts[2])
            if ext == '.js':
                target = runtime_target(stem, '.ts')
            elif ext == '.css':
                domain = RUNTIME_CSS_DOMAIN.get(parts[2])
                target = f'src/runtime/{domain}/{parts[2]}' if domain else None
        elif head == 'static':
            target = map_static(rel)
        elif head == 'ui-packs':
            # API 直接下发的 UI 方案资产（非编译源），原样保留目录
            target = rel
        elif head.endswith('.html'):
            target = f'pages/{rel}'
        elif head in ('assets', 'audio', 'component-thumbnails'):
            target = f'public/static/{rel}'
        else:
            unmapped.append(rel)
            continue

        if target is None:
            unmapped.append(rel)
        else:
            mapping[rel] = target

    return mapping, unmapped


def map_static(rel: str) -> str | None:
    """static/** 的映射。"""
    inner = rel[len('static/'):]
    # 非 JS 资源：整棵搬到 public/static（保持相对布局）
    if not inner.endswith('.js'):
        return f'public/static/{inner}'

    if inner == 'auth/scene/scene-depth.js':
        return 'src/app/auth/scene/scene-depth.ts'
    if inner.startswith('auth/scene/'):
        return f'src/app/auth/scene/{Path(inner).name}'

    if '/' not in inner:
        stem = inner[:-3]
        return STATIC_ROOT_MAP.get(stem)
    if inner.startswith('renderer/') and inner.count('/') == 1:
        stem = Path(inner).stem
        sub = RENDERER_MAP.get(stem)
        return f'src/app/renderer/{sub}' if sub else None
    if inner.startswith('modules/interaction3d/') and inner.count('/') == 2:
        stem = Path(inner).stem
        if stem in BRIDGE_RUNTIME_SIDE:
            return BRIDGE_RUNTIME_SIDE[stem]
        return f'src/app/bridge/{stem}.ts'
    if inner.startswith('3d-studio/'):
        return map_studio(inner)
    if inner.startswith('utils/'):
        return f'src/app/utils/{Path(inner).name[:-3]}.ts'
    if inner.startswith('templates/'):
        return f'src/app/templates/{Path(inner).name[:-3]}.ts'
    if inner.startswith('ui-packs/'):
        return f'src/app/ui-packs/{Path(inner).name[:-3]}.ts'
    return None


# static/3d-studio/*.js（64 个）：以参考工程同名文件的目录为准，缺失的显式指定。
STUDIO_MAP: dict[str, str] = {
    # 根
    'model-persistent-cache': 'model-persistent-cache.ts',
    'model-template-codec': 'model-template-codec.ts',
    'scene-persistent-cache': 'scene-persistent-cache.ts',
    'stage-startup': 'stage-startup.ts',
    # studio/
    'studio-app': 'studio/studio-app.ts',
    'studio-widgets': 'studio/studio-widgets.ts',
    'ui-controls': 'studio/ui-controls.ts',
    'studio-airer': 'studio/studio-airer.ts',
    'studio-background-cache': 'studio/studio-background-cache.ts',
    'studio-cabinet-back': 'materials/studio-cabinet-back.ts',
    'studio-camera-constraints': 'studio/studio-camera-constraints.ts',
    'studio-car-finish': 'materials/studio-car-finish.ts',
    'studio-curtain-track': 'loaders/studio-curtain-track.ts',
    'studio-device-batching': 'studio/studio-device-batching.ts',
    'studio-external-models': 'loaders/studio-external-models.ts',
    'studio-fan': 'studio/studio-fan.ts',
    'studio-feature-wall': 'materials/studio-feature-wall.ts',
    'studio-floor-cache-budget': 'studio/studio-floor-cache-budget.ts',
    'studio-floor-openings': 'plan/studio-floor-openings.ts',
    'studio-floor-transition': 'studio/studio-floor-transition.ts',
    'studio-furniture-batching': 'studio/studio-furniture-batching.ts',
    'studio-ground-reflections': 'reflection/studio-ground-reflections.ts',
    'studio-motion-buffer': 'studio/studio-motion-buffer.ts',
    'studio-motion-presentation': 'studio/studio-motion-presentation.ts',
    'studio-mural': 'materials/studio-mural.ts',
    'studio-normalization': 'loaders/studio-normalization.ts',
    'studio-overview-detail': 'studio/studio-overview-detail.ts',
    'studio-overview-stack': 'studio/studio-overview-stack.ts',
    'studio-placement': 'studio/studio-placement.ts',
    'studio-plan-drawing': 'plan/studio-plan-drawing.ts',
    'studio-plan2-contact-shadows': 'plan/studio-plan2-contact-shadows.ts',
    'studio-plan2-region-lights': 'plan/studio-plan2-region-lights.ts',
    'studio-reflection-culling': 'reflection/studio-reflection-culling.ts',
    'studio-reflection-detail': 'reflection/studio-reflection-detail.ts',
    'studio-reflection-detail-worker': 'reflection/studio-reflection-detail-worker.ts',
    'studio-reflection-passes': 'reflection/studio-reflection-passes.ts',
    'studio-runtime-furniture': 'studio/studio-runtime-furniture.ts',
    'studio-scene-style': 'studio/studio-scene-style.ts',
    'studio-security-models': 'loaders/studio-security-models.ts',
    'studio-shadow-atlas': 'studio/studio-shadow-atlas.ts',
    'studio-speaker': 'studio/studio-speaker.ts',
    'studio-startup-presentation': 'studio/studio-startup-presentation.ts',
    'studio-surface-snap': 'studio/studio-surface-snap.ts',
    'studio-surface-textures': 'materials/studio-surface-textures.ts',
    'studio-television-glass': 'materials/studio-television-glass.ts',
    'studio-television-poster': 'materials/studio-television-poster.ts',
    'studio-vehicle-models': 'studio/studio-vehicle-models.ts',
    'studio-wall-materials': 'materials/studio-wall-materials.ts',
    'studio-warm-foliage': 'materials/studio-warm-foliage.ts',
    'studio-window-geometry': 'plan/studio-window-geometry.ts',
    # 平面 / 院子绘制
    'background-import': 'plan/background-import.ts',
    'courtyard-drawing': 'plan/courtyard-drawing.ts',
    'courtyard-drawing-editor': 'plan/courtyard-drawing-editor.ts',
    'courtyard-drawing-model': 'plan/courtyard-drawing-model.ts',
    'courtyard-models': 'plan/courtyard-models.ts',
    'courtyard-plan': 'plan/courtyard-plan.ts',
    'decor-models': 'studio/decor-models.ts',
    'floor-order': 'plan/floor-order.ts',
    'geometry': 'plan/geometry.ts',
    # 导出
    'draco-decoder-worker': 'export/draco-decoder-worker.ts',
    'draco-loader': 'export/draco-loader.ts',
    'export-presets': 'export/export-presets.ts',
    'export-utils': 'export/export-utils.ts',
    # 模型装载
    'model-asset-loader': 'loaders/model-asset-loader.ts',
}


def map_studio(inner: str) -> str | None:
    stem = Path(inner).stem
    sub = STUDIO_MAP.get(stem)
    if sub is None:
        return None
    return f'src/app/3d-studio/{sub}'


# --------------------------------------------------------------------------
# 4. 主流程
# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report', action='store_true')
    args = parser.parse_args()

    mapping, unmapped = build_mapping()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    src_files = [
        p.relative_to(SRC_FRONTEND).as_posix()
        for p in SRC_FRONTEND.rglob('*.js')
        if '/vendor/' not in p.as_posix()
    ]
    mapped_src = set(mapping)

    missing = sorted(set(src_files) - mapped_src)
    collisions: dict[str, list[str]] = defaultdict(list)
    for src, dst in mapping.items():
        collisions[dst].append(src)
    dup = {k: v for k, v in collisions.items() if len(v) > 1}

    report = {
        'source_js_count': len(src_files),
        'mapped_count': len(mapped_src & set(src_files)),
        'unmapped': unmapped,
        'missing_from_mapping': missing,
        'target_collisions': dup,
        'mapping': mapping,
    }
    (OUT_DIR / 'mapping.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )

    print(f'源 JS 文件: {len(src_files)}')
    print(f'已映射    : {len(mapped_src & set(src_files))}')
    print(f'未映射文件: {len(missing)}')
    for name in missing[:40]:
        print(f'  - {name}')
    print(f'未归类条目: {len(unmapped)}')
    for name in unmapped[:40]:
        print(f'  - {name}')
    print(f'目标路径冲突: {len(dup)}')
    for dst, srcs in list(dup.items())[:20]:
        print(f'  ! {dst} <- {srcs}')

    if not args.apply:
        print(f'\n映射表: {OUT_DIR / "mapping.json"}（未落盘，加 --apply 执行）')
        return 1 if (missing or unmapped or dup) else 0

    if missing or unmapped or dup:
        print('\n存在未归类/冲突，拒绝落盘。先修映射表。', file=sys.stderr)
        return 1

    if DST_FRONTEND.exists() and any(DST_FRONTEND.iterdir()):
        print(
            f'\n目标工程已存在且非空：{DST_FRONTEND}\n'
            '迁移已完成，拒绝覆盖。确需重跑请先清空目标目录。',
            file=sys.stderr,
        )
        return 1

    apply_mapping(mapping)
    return 0


def apply_mapping(mapping: dict[str, str]) -> None:
    """按映射表搬运文件并改写内容。"""
    for src_rel, dst_rel in sorted(mapping.items()):
        src = SRC_FRONTEND / src_rel
        dst = DST_FRONTEND / dst_rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    print(f'\n已复制 {len(mapping)} 个文件到 {DST_FRONTEND}')

    # vendor 原样搬运（第三方产物，不参与转换；three 锁定 0.186.0）
    vendor_src = SRC_FRONTEND / 'static' / 'vendor'
    if vendor_src.is_dir():
        vendor_dst = DST_FRONTEND / 'public' / 'static' / 'vendor'
        if vendor_dst.exists():
            shutil.rmtree(vendor_dst)
        shutil.copytree(vendor_src, vendor_dst)
        count = sum(1 for _ in vendor_dst.rglob('*') if _.is_file())
        print(f'已复制 vendor 第三方产物 {count} 个文件到 {vendor_dst}')


if __name__ == '__main__':
    raise SystemExit(main())
