"""生成授权服务器密钥对（自建授权服务器的信任锚）。

用法::

    python -m store.tools.gen_keys
    python -m store.tools.gen_keys --force
    python -m store.tools.gen_keys --rotate

私钥写入 ``store/keys/local/``（**不要提交到公开仓库**），公钥会自动镜像到
客户端默认读取的 ``keys/`` 目录，并同步改写 ``backend/app/config.py`` 里的
``DEFAULT_LICENSE_*`` 常量。两个 PEM 的 sha256 按**文件字节**计算，用于客户端
指纹校验。若要临时用别的密钥而不改代码，可用环境变量覆盖::

    APP_LICENSE_PUBLIC_KEY_SHA256 / APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256

``--rotate`` 与 ``--force`` 的区别（S52）：

* ``--force``：直接覆盖。**旧客户端当场全部失效** —— 密钥换了、keyId 也换了
  （keyId 由公钥派生），而客户端的可信表还是旧的。
* ``--rotate``：先把当前那对改名成 ``*.previous.pem`` 再写新的。授权服务发现
  上一代四件套齐全就会把它们一起装进密钥环，按请求里的 keyId 选代 —— 于是
  「服务端换了、客户端没升级完」这段时间里两边都能用（旧客户端照旧心跳）。
  窗口是一次轮换的长度：再 ``--rotate`` 一次，上一代就被新的前任覆盖。

客户端那一侧同样要跟上：``backend/app/config.py`` 默认会同时信任当前与
``*.previous.pem`` 两把公钥（文件存在才登记），所以客户端先升级、服务端后轮换
也不会中断。
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from store.config import PROJECT_ROOT, STORE_ROOT
from store.licensing import keys

#: 客户端默认指纹常量的所在文件。轮换密钥后由本脚本直接改写（见下）。
CLIENT_CONFIG_PATH = PROJECT_ROOT / "backend" / "app" / "config.py"


def _sync_client_keys(sync_dir: Path, sources: tuple[tuple[Path, str], ...]) -> None:
    """把公钥镜像到客户端默认读取的 ``keys/`` 目录。

    客户端按 PEM **文件字节** 校验指纹，所以镜像必须与生成结果逐字节一致。
    轮换密钥后还要同步更新 ``backend/app/config.py`` 里的默认指纹常量，
    或用 ``APP_LICENSE_*_PUBLIC_KEY_SHA256`` 覆盖。
    """
    sync_dir.mkdir(parents=True, exist_ok=True)
    sync_dir.chmod(0o755)
    for source, name in sources:
        target = sync_dir / name
        if target.exists():
            target.chmod(0o644)
        target.write_bytes(source.read_bytes())
        target.chmod(0o644)
        print(f"  已同步: {target}")


def _update_client_config(
    signing_sha256: str,
    transport_sha256: str,
    *,
    config_path: Path = CLIENT_CONFIG_PATH,
) -> bool:
    """把新指纹写回 ``backend/app/config.py`` 的两个默认常量。

    这一步以前是「脚本打印、人工手抄」，0985d3d 就是手抄时把新旧两个指纹抄反了：
    公钥文件换成了新的、常量却写成旧的，于是**默认配置**（不设
    ``APP_LICENSE_*_PUBLIC_KEY_SHA256`` 的路径）下离线验签全部失败。而 start.py /
    e2e 都会显式设这两个环境变量，恰好绕过默认值，所以这个错误在带环境变量的
    路径上完全看不出来，只有 smoke 的镜像一致性断言能发现。

    所以改成脚本直接改写：只替换那两个常量的赋值行，其余内容一律不动。
    返回是否真的发生了改动。
    """
    if not config_path.is_file():
        print(f"  [警告] 未找到 {config_path}，指纹常量需手动同步。")
        return False

    original = config_path.read_text(encoding="utf-8")
    updated = original
    for constant, value in (
        ("DEFAULT_LICENSE_PUBLIC_KEY_SHA256", signing_sha256),
        ("DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256", transport_sha256),
    ):
        # 用 ^ 锚定行首 + 精确常量名 + 64 位十六进制，保证既不误伤 transport 行
        # （前缀 DEFAULT_LICENSE_ 之后紧跟 TRANSPORT），也不会碰到注释里的示例。
        pattern = re.compile(
            rf"^({constant}\s*=\s*')[0-9a-fA-F]{{64}}(')$", re.MULTILINE
        )
        if not pattern.search(updated):
            print(f"  [警告] 在 {config_path.name} 里没找到 {constant} 的赋值行，跳过。")
            continue
        updated = pattern.sub(rf"\g<1>{value}\g<2>", updated)

    if updated == original:
        print(f"  指纹常量已是当前值，无需改动：{config_path}")
        return False
    config_path.write_text(updated, encoding="utf-8")
    print(f"  已改写指纹常量：{config_path}")
    return True


def _mirror_directory(args, out_dir: Path) -> Path | None:
    """决定公钥镜像目录。

    只有 ``--out`` 指向默认密钥目录时才隐式同步到仓库根 ``keys/``；否则必须
    显式传 ``--sync-client-keys``。否则像 ``e2e`` 那样用 ``--out <临时目录>``
    的调用会把一次性密钥写进客户端信任锚，导致指纹校验全线失败。
    """
    if args.no_sync:
        return None
    if args.sync_client_keys:
        return Path(args.sync_client_keys).expanduser().resolve()
    if out_dir == (STORE_ROOT / "keys" / "local").resolve():
        return (PROJECT_ROOT / "keys").resolve()
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 HomeOS 授权服务器密钥对")
    parser.add_argument(
        "--out",
        default=str(STORE_ROOT / "keys" / "local"),
        help="密钥输出目录（默认 store/keys/local）",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="已存在时强制重新生成（**无重叠窗口**：旧客户端立刻失效）",
    )
    parser.add_argument(
        "--rotate",
        action="store_true",
        help="轮换：先把当前密钥留成上一代（*.previous.pem）再生成新的，旧客户端在窗口内仍可用",
    )
    parser.add_argument(
        "--sync-client-keys",
        default=None,
        help="显式指定客户端公钥镜像目录；缺省时仅当 --out 为 store/keys/local 才同步到仓库根 keys/",
    )
    parser.add_argument(
        "--no-sync", action="store_true", help="完全不写客户端公钥镜像目录"
    )
    args = parser.parse_args()

    out_dir = Path(args.out).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True, mode=0o700)

    signing_paths = keys.KeyPairPaths(
        out_dir / "license-private.pem", out_dir / "license-public.pem"
    )
    transport_paths = keys.KeyPairPaths(
        out_dir / "license-transport-private.pem",
        out_dir / "license-transport-public.pem",
    )

    rotated: list[Path] = []
    if args.rotate and not args.force:
        # 先把当前这一对搬成「上一代」再生成：搬走后 generate_* 看到的是空目录，
        # 于是必然写新的。先删同名的旧 previous（一次轮换 = 一个窗口）。
        if keys.rotate_pair(signing_paths):
            rotated.append(signing_paths.private_path)
        if keys.rotate_pair(transport_paths):
            rotated.append(transport_paths.private_path)

    signing = keys.generate_ed25519(signing_paths, force=args.force)
    transport = keys.generate_x25519(transport_paths, force=args.force)

    print("=" * 72)
    print("授权签名密钥（Ed25519）")
    print(f"  私钥: {signing.private_path}")
    print(f"  公钥: {signing.public_path}")
    print(f"  sha256: {signing.sha256}")
    print(f"  keyId（由公钥派生）: {keys.key_id_from_public(signing.public_path)}")
    print(f"  {'已重新生成' if signing.created else '已存在，复用'}")
    print()
    print("授权传输密钥（X25519）")
    print(f"  私钥: {transport.private_path}")
    print(f"  公钥: {transport.public_path}")
    print(f"  sha256: {transport.sha256}")
    print(f"  keyId（由公钥派生）: {keys.key_id_from_public(transport.public_path)}")
    print(f"  {'已重新生成' if transport.created else '已存在，复用'}")
    if rotated:
        print()
        print("轮换重叠窗口：以下上一代密钥保留在原目录，授权服务会自动装进密钥环")
        for path in rotated:
            print(f"  上一代: {keys.previous_path(path)}")
        print("  窗口结束（删掉上面这些 *.previous.pem）后旧客户端才真正失效。")
    print("=" * 72)
    print()
    mirror_dir = _mirror_directory(args, out_dir)
    if mirror_dir is None:
        print("未写客户端公钥镜像（--out 非默认密钥目录且未显式指定 --sync-client-keys）。")
    else:
        print(f"同步公钥到客户端目录：{mirror_dir}")
        sources = [
            (signing.public_path, "license-public.pem"),
            (transport.public_path, "license-transport-public.pem"),
        ]
        # 上一代的公钥也镜像过去：客户端要能验「服务端还没轮换完」时签发的租约
        # （客户端先升级、服务端后轮换的顺序）。缺了它客户端会在窗口期把老租约
        # 判成「不受信任的授权公钥」。
        for path, name in (
            (keys.previous_path(signing.public_path), "license-public.previous.pem"),
            (
                keys.previous_path(transport.public_path),
                "license-transport-public.previous.pem",
            ),
        ):
            if path.is_file():
                sources.append((path, name))
        _sync_client_keys(mirror_dir, tuple(sources))
        # 镜像与默认指纹常量必须同时更新：只改一个就会让默认配置的离线验签失败。
        print("同步客户端默认指纹常量：")
        _update_client_config(signing.sha256, transport.sha256)
    print()
    print("客户端默认配置（backend/app/config.py）：")
    print("  SELF_HOSTED_LICENSE_SERVER_URL = 'http://127.0.0.1:18082'")
    print("  （keyId 由公钥派生，无需手抄；下面的 sha256 常量已由本脚本改写）")
    print(f"  DEFAULT_LICENSE_PUBLIC_KEY_SHA256 = '{signing.sha256}'")
    print(f"  默认签名 keyId = '{keys.key_id_from_public(signing.public_path)}'")
    print(f"  DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 = '{transport.sha256}'")
    print(
        "  默认传输 keyId = "
        f"'{keys.key_id_from_public(transport.public_path)}'"
    )
    if mirror_dir is None:
        print("  （本次未同步镜像目录，以上常量需手动同步）")
    print()
    print("或改用环境变量固定 keyId（无需改代码，但轮换要两边同步改）：")
    print(f"  APP_LICENSE_KEY_ID={keys.key_id_from_public(signing.public_path)}")
    print(f"  APP_LICENSE_PUBLIC_KEY_FILE={signing.public_path}")
    print(f"  APP_LICENSE_PUBLIC_KEY_SHA256={signing.sha256}")
    print(
        "  APP_LICENSE_TRANSPORT_KEY_ID="
        f"{keys.key_id_from_public(transport.public_path)}"
    )
    print(f"  APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE={transport.public_path}")
    print(f"  APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256={transport.sha256}")


if __name__ == "__main__":
    main()
