#!/usr/bin/env python3
"""构建编排：把两个项目的产物统一收敛到工作区根 ``dist/``。

与 ``ops/start.py``（本地联调）互补，本脚本负责**分发级构建**：

  dist/
    homeos-3d/
      frontend/                 # 前端产物（宿主机构建并混淆）
      backend/linux-<arch>/     # Cython 编译后的后端（.so，无 .py 源码）
    homeos-store/
      frontend/
      backend/linux-<arch>/

子命令：

  backend [--arch ARCH] [--project 3d|store|all]
      用 Docker 的 ``app-export`` / ``store-export`` 阶段把加密后端导出到
      ``dist/<proj>/backend/linux-<arch>``。Cython 产物与平台绑定，必须在
      Linux 容器内按目标架构编译（宿主是 macOS 时尤其如此）。

  image [--arch ARCH] [--project 3d|store|all] [--tag TAG] [--push]
      从工作区根 ``dist/`` 组装运行镜像（``--target app`` / ``--target store``）。
      镜像内不再编译后端：后端 .so 与前端产物都直接 COPY 自 dist/。

  clean [--project 3d|store|all]
      删除工作区根 ``dist/`` 下对应项目的产物。

前端（含混淆）由宿主机执行 ``bun run build:frontend`` 产出；本脚本只管后端与镜像。
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parents[1]
DIST_ROOT = ROOT / 'dist'
DOCKERFILE = ROOT / 'Dockerfile'

#: 官方基础镜像（Dockerfile 的默认值）。--base-mirror 会据此拼出镜像站引用。
DEFAULT_PYTHON_IMAGE = 'python:3.14-slim-bookworm'
DEFAULT_CADDY_IMAGE = 'caddy:2.11.4-alpine'
#: 镜像站默认值来源：显式 --base-mirror > 环境变量 / .env > 不镜像（走 Docker Hub）。
BASE_MIRROR_ENV = 'HOMEOS_BASE_MIRROR'


def load_env_file(path: Path) -> None:
    """把仓库根 ``.env`` 读进 ``os.environ``（不覆盖已存在的真实环境变量）。

    与 ops/start.py 的口径一致：真实环境变量优先。这样机器相关的开关（例如
    ``HOMEOS_BASE_MIRROR``，见 Dockerfile 顶部说明）写进 .env（不入库）即可，
    不必每次在命令行重复。
    """
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        if not key:
            continue
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


class Project(NamedTuple):
    #: 命令行里的简写（--project）。
    key: str
    #: 目录名与镜像名前缀。
    name: str
    #: 导出加密后端的 Docker 阶段。
    export_target: str
    #: 组装运行镜像的 Docker 阶段。
    image_target: str


PROJECTS: dict[str, Project] = {
    '3d': Project('3d', 'homeos-3d', 'app-export', 'app'),
    'store': Project('store', 'homeos-store', 'store-export', 'store'),
}

#: 把 ``docker version`` 的架构名与 ``platform.machine()`` 归一成两种目标架构。
ARCH_ALIASES = {
    'x86_64': 'amd64',
    'amd64': 'amd64',
    'aarch64': 'arm64',
    'arm64': 'arm64',
}


def docker_bin() -> str:
    # 用绝对路径调用：既避免依赖 PATH 的歧义，也满足静态检查对「部分路径启动进程」的约束。
    resolved = shutil.which('docker')
    if not resolved:
        raise SystemExit('找不到 docker 可执行文件，请先安装并确保它在 PATH 中')
    return resolved


def repo_version() -> str:
    payload = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    version = payload.get('version') if isinstance(payload, dict) else None
    if not isinstance(version, str) or not version.strip():
        raise SystemExit('仓库根 package.json 缺少 version，无法确定产物版本')
    return version.strip()


def normalize_arch(value: str) -> str:
    arch = ARCH_ALIASES.get(value.strip().lower())
    if arch is None:
        raise SystemExit(f'不支持的架构 {value!r}（可用 amd64 / arm64）')
    return arch


def host_arch() -> str:
    """默认目标架构：优先跟随 Docker 守护进程，取不到再退回本机机器架构。"""
    try:
        output = subprocess.check_output(
            [docker_bin(), 'version', '--format', '{{.Server.Arch}}'],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        output = ''
    return normalize_arch(output or platform.machine())


def selected_projects(value: str) -> list[Project]:
    if value == 'all':
        return list(PROJECTS.values())
    return [PROJECTS[value]]


def run(command: list[str]) -> None:
    print('+ ' + ' '.join(command), flush=True)
    subprocess.check_call(command)


def buildx_cache_args(args: argparse.Namespace) -> list[str]:
    # --cache-from / --cache-to 可重复；CI 用它把「导出后端」与「组装镜像」两次
    # 调用接到同一个 gha 缓存 scope 上，避免后端被 Cython 编译两遍。
    extra: list[str] = []
    for dest in ('cache_from', 'cache_to'):
        for value in getattr(args, dest) or []:
            extra += [f'--{dest.replace("_", "-")}', value]
    return extra


def _mirrored(mirror: str, official_image: str) -> str:
    # 把官方库镜像（"python:3.14-..."）改写成镜像站引用（"<mirror>/library/python:3.14-..."）。
    # mirror 里若带协议/尾部斜杠做一次规整；已是完整仓库路径的镜像名不会被改写（见调用方）。
    host = mirror.strip().rstrip('/')
    if not host:
        return official_image
    name, _, tag = official_image.partition(':')
    return f'{host}/library/{name}:{tag}' if tag else f'{host}/library/{name}'


def base_image_args(args: argparse.Namespace) -> list[str]:
    # 基础镜像可整体指向镜像站：Docker Hub 在部分网络下拉不动
    # （auth.docker.io 超时，见 README「构建镜像」一节的说明）。
    # 优先级：显式 --python-image / --caddy-image > --base-mirror > HOMEOS_BASE_MIRROR > Dockerfile 默认。
    mirror = (getattr(args, 'base_mirror', None) or os.getenv(BASE_MIRROR_ENV, '')).strip()
    python_image = args.python_image or (_mirrored(mirror, DEFAULT_PYTHON_IMAGE) if mirror else '')
    caddy_image = args.caddy_image or (_mirrored(mirror, DEFAULT_CADDY_IMAGE) if mirror else '')
    extra: list[str] = []
    if python_image:
        extra += ['--build-arg', f'PYTHON_IMAGE={python_image}']
    if caddy_image:
        extra += ['--build-arg', f'CADDY_IMAGE={caddy_image}']
    return extra


def export_backend(args: argparse.Namespace) -> None:
    arch = normalize_arch(args.arch) if args.arch else host_arch()
    version = repo_version()
    for project in selected_projects(args.project):
        dest = DIST_ROOT / project.name / 'backend' / f'linux-{arch}'
        shutil.rmtree(dest, ignore_errors=True)
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f'导出加密后端 {project.name}（linux-{arch}）→ {dest.relative_to(ROOT)}', flush=True)
        run([
            docker_bin(), 'buildx', 'build',
            '--file', str(DOCKERFILE),
            '--target', project.export_target,
            '--output', f'type=local,dest={dest}',
            '--build-arg', f'HOMEOS_VERSION={version}',
            *base_image_args(args),
            *buildx_cache_args(args),
            str(ROOT),
        ])


def build_image(args: argparse.Namespace) -> None:
    arch = normalize_arch(args.arch) if args.arch else host_arch()
    version = repo_version()
    for project in selected_projects(args.project):
        backend = DIST_ROOT / project.name / 'backend' / f'linux-{arch}'
        frontend = DIST_ROOT / project.name / 'frontend'
        if not backend.is_dir():
            raise SystemExit(
                f'缺少后端产物 {backend.relative_to(ROOT)}；'
                f'先执行 python3 ops/build.py backend --project {project.key} --arch {arch}'
            )
        if not frontend.is_dir():
            raise SystemExit(
                f'缺少前端产物 {frontend.relative_to(ROOT)}；先执行 bun run build:frontend'
            )
        tag = args.tag or f'{project.name}:{version}'
        output = ['--push'] if args.push else ['--load']
        print(f'组装运行镜像 {project.name}（linux-{arch}，tag {tag}）', flush=True)
        run([
            docker_bin(), 'buildx', 'build',
            '--file', str(DOCKERFILE),
            '--target', project.image_target,
            '--build-arg', f'HOMEOS_VERSION={version}',
            '--build-arg', f'BACKEND_PLATFORM=linux-{arch}',
            *base_image_args(args),
            '--tag', tag,
            *output,
            *buildx_cache_args(args),
            str(ROOT),
        ])


def clean(args: argparse.Namespace) -> None:
    for project in selected_projects(args.project):
        target = DIST_ROOT / project.name
        if target.is_dir():
            shutil.rmtree(target)
            print(f'已删除 {target.relative_to(ROOT)}', flush=True)


def _add_common_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        '--project',
        choices=['3d', 'store', 'all'],
        default='all',
        help='目标项目（默认 all）',
    )


def _add_cache_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument('--cache-from', action='append', default=[], metavar='SPEC', help='透传 buildx --cache-from（可重复）')
    parser.add_argument('--cache-to', action='append', default=[], metavar='SPEC', help='透传 buildx --cache-to（可重复）')


def _add_base_image_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        '--base-mirror',
        metavar='REGISTRY',
        default=None,
        help=f'基础镜像镜像站，如 docker.m.daocloud.io；也可用环境变量 {BASE_MIRROR_ENV}。'
        'Docker Hub 拉不动时用它把 python / caddy 基础镜像整体切到镜像站',
    )
    parser.add_argument('--python-image', metavar='REF', help=f'直接指定 Python 基础镜像（默认 {DEFAULT_PYTHON_IMAGE}）')
    parser.add_argument('--caddy-image', metavar='REF', help=f'直接指定 Caddy 基础镜像（默认 {DEFAULT_CADDY_IMAGE}）')


def main() -> None:
    # 先吃 .env（真实环境变量优先），机器相关的 HOMEOS_BASE_MIRROR 等可写在那里。
    load_env_file(ROOT / '.env')
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest='command', required=True)

    backend = subparsers.add_parser('backend', help='导出 Cython 编译后的加密后端到根 dist/')
    _add_common_options(backend)
    backend.add_argument('--arch', help='目标架构 amd64 / arm64（默认跟随宿主 Docker）')
    _add_base_image_options(backend)
    _add_cache_options(backend)
    backend.set_defaults(func=export_backend)

    image = subparsers.add_parser('image', help='从根 dist/ 组装运行镜像')
    _add_common_options(image)
    image.add_argument('--arch', help='目标架构 amd64 / arm64（默认跟随宿主 Docker）')
    image.add_argument('--tag', help='镜像标签（默认 <项目名>:<版本号>）')
    image.add_argument('--push', action='store_true', help='构建后推送（默认 --load 到本地 Docker）')
    _add_base_image_options(image)
    _add_cache_options(image)
    image.set_defaults(func=build_image)

    clean_parser = subparsers.add_parser('clean', help='删除根 dist/ 下对应项目的产物')
    _add_common_options(clean_parser)
    clean_parser.set_defaults(func=clean)

    args = parser.parse_args()
    args.func(args)
    sys.exit(0)


if __name__ == '__main__':
    main()
