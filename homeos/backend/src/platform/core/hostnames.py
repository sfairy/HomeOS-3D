"""主机名在浏览器里是否「可能可用」—— 只判语法，不判连通性。

这套系统同一时刻会被**多个**入口访问：局域网 ``http://<IP>:8801``、内置自签 HTTPS
``https://<IP>:8803``、公网域名（DNS 或内网穿透）。容器自己看到的是 compose 服务名
（``homeos-store``）或回环地址 —— 那是**绝不可能**被浏览器解析的。区分这两类主机名，
是「拼给浏览器用的绝对地址」与「判断是不是同机部署」的共同前提。

放在 ``platform/core`` 而不是某个 domain 里：它只依赖标准库，安全层（来源判定）与
商店发现层都要用；让其中一层去 import 另一层只会把依赖方向搞反。
"""

from __future__ import annotations

import ipaddress

#: 单段名里浏览器**确实**能用的一类：``localhost`` 与 mDNS 的 ``*.local``。
_LOCAL_SUFFIXES = (".local",)


def browser_reachable(host: str) -> bool:
    """浏览器能不能靠这个主机名找到服务？

    否，只可能是两种「只有本机 / 容器网络内部才有意义」的写法：

    - 回环与未指定地址（``127.x`` / ``::1`` / ``localhost`` / ``0.0.0.0`` / ``::``）；
    - **不带点的单段名**（``homeos-store`` 这类 Docker Compose 服务名 / 容器别名）。

    是：其余 IP 字面量（含 IPv6）与带点的域名。注意判的是**语法**，不是可达性 ——
    判断不了的东西（跨网络的私网 IP、解析不到的域名）都算「是」，不在这个函数里纠正。

    单段名的例外：内网 DNS 里真有一个叫 ``store`` 的主机时这里会误判。那种部署应当在商店上
    显式配 ``STORE_BASE_URL``（``declared=true`` 时不走推断）。
    """
    name = host.strip().strip('[]').casefold()
    if not name:
        return False
    try:
        address = ipaddress.ip_address(name)
    except ValueError:
        return '.' in name
    return not (address.is_loopback or address.is_unspecified)


def direct_port_host(host: str) -> bool:
    """浏览器是不是在用「同一台机器的某个端口」访问（而不是一个独立的公网域名）？

    用于同机部署的商店入口：主应用与商店共用同一个 IP、只差端口时，浏览器既然能用
    ``http://192.168.31.175:8801`` 打开主应用，就一定能用 ``http://192.168.31.175:8802``
    打开商店 —— 这个推断比任何配置都可靠，且**离线也成立**。

    判为「端口直连」的形态：IP 字面量、``localhost``、``*.local`` 这类 mDNS 名、
    以及不带点的单段名。公网域名不算：它的 8802 端口通常没有发布，商店走的是另一个域名。
    """
    name = host.strip().strip('[]').casefold()
    if not name:
        return False
    try:
        ipaddress.ip_address(name)
    except ValueError:
        if name == 'localhost' or name.endswith(_LOCAL_SUFFIXES):
            return True
        return '.' not in name
    else:
        return True


def authority(host: str, port: int | None = None) -> str:
    """把主机名（含 IPv6 字面量）与端口拼成 URL 的 authority 段。"""
    name = host.strip()
    if ':' in name and not name.startswith('['):
        name = f'[{name}]'
    return f'{name}:{port}' if port else name


__all__ = ['authority', 'browser_reachable', 'direct_port_host']
