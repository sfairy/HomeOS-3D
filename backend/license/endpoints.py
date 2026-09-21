"""授权服务器端点池：三批地址的选路、洗牌与失败拉黑。

三批含义（LICENSE_ENDPOINT_BATCH_NAMES）：
- esa / eo —— 云厂商边缘接入，优先使用（抗封、延迟低）；
- direct   —— 源站直连，只在前两批全部不可用时才用。

对外契约：service 层调用 candidates() 拿到按优先级排好的候选列表并逐个尝试，
失败时调用 mark_failed 把地址临时拉黑。黑名单只存在于内存中，进程重启即清空 ——
它的定位是「快速止损」，而不是持久状态。
"""
from __future__ import annotations
import random
import threading
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
# 一轮计划重试的间隔下限（秒）。端点拉黑时长与它对齐：黑名单若比重试节奏还长，
# 每一轮自动重试都会整轮撞在冷却里，把「自动恢复」拖成「干等一个冷却周期」。
LICENSE_RETRY_SECONDS = 120
# 失败地址拉黑时长。与重试间隔取同一枚常量，保证每轮重试都至少有机会重新探测所有地址。
LICENSE_ENDPOINT_BLACKLIST_SECONDS = LICENSE_RETRY_SECONDS
# 批次白名单：只有这三类名字可以被配置，写错会直接抛 ValueError，
# 而不是被静默忽略导致「配了地址却永远不生效」。
LICENSE_ENDPOINT_BATCH_NAMES = ('esa', 'eo', 'direct')


@dataclass(frozen=True)
class LicenseEndpoint:
    """一个候选授权服务器地址。

    frozen 是有意的：端点对象会被放进列表反复传递，
    冻结后不可能被就地改写，排查问题时能确定地址来源。
    """
    # 所属批次，既决定尝试优先级，也是失败日志里的定位信息。
    batch: str
    # 已去掉尾部斜杠的根地址，与接口 path 直接拼接成完整 URL。
    base_url: str


class LicenseEndpointPool:
    """按批次优先级挑选授权服务器，并在失败后暂时拉黑。

    优先级：esa / eo（两批同级，批内随机洗牌）> direct。
    洗牌是为了在多个等效地址之间做客户端侧负载均衡，
    避免大量安装在升级后同时挤向同一个入口。
    """

    def __init__(self, batches: Iterable[tuple[str, Iterable[str]]], *, blacklist_seconds: int = LICENSE_ENDPOINT_BLACKLIST_SECONDS, clock: Callable[[], float] = time.monotonic, rng: random.Random | None = None) -> None:
        """参数:
            batches: 形如 [('esa', [url, ...]), ('direct', [...])] 的原始配置。
            blacklist_seconds: 失败后的拉黑时长。
            clock: 取当前时间的函数，测试可注入假时钟。
            rng: 洗牌用的随机源，默认 SystemRandom。
        """
        # 可重入锁：candidates() 内部会调用其它读取方法，用普通 Lock 会自锁。
        self._lock = threading.RLock()
        self._batches = self._normalize_batches(batches)
        # 兜底成至少 1 秒：配置成 0/负数会导致「刚拉黑就解除」，失去止损作用。
        self._blacklist_seconds = max(1, blacklist_seconds)
        self._clock = clock
        # SystemRandom 直接取操作系统熵源，不受 random.seed 影响，
        # 因此选路顺序不会被外部（或测试残留）的全局播种左右。
        self._rng = rng or random.SystemRandom()
        self._blacklist_until = {}

    @staticmethod
    def _normalize_batches(batches: Iterable[tuple[str, Iterable[str]]]) -> dict[str, tuple[str, ...]]:
        """归一化配置：校验批次名、清洗地址、全局去重。
        异常:
            ValueError: 批次名不在白名单内，或地址不是 HTTP/HTTPS。
        """
        # 先把三个批次键都建好（即使一个地址都没配），后续取值不必再判 None。
        normalized = {name: () for name in LICENSE_ENDPOINT_BATCH_NAMES}
        seen = set()
        for raw_name, raw_urls in batches:
            # 批次名大小写不敏感、容忍首尾空格：配置里写 'ESA ' 也能命中。
            name = raw_name.strip().lower()
            if name not in normalized:
                raise ValueError(f'未知授权服务器批次：{raw_name}')
            urls = []
            for raw_url in raw_urls:
                # 去掉尾部斜杠，拼接接口 path 时不会出现双斜杠。
                url = raw_url.strip().rstrip('/')
                # 去重是跨批次全局的：同一地址配在多个批次里只保留首次出现的那个。
                if not url or url in seen:
                    continue
                # 明确限定 scheme，避免配置里混入 file:// 之类的地址。
                if not url.startswith(('https://', 'http://')):
                    raise ValueError('授权服务器地址必须使用 HTTP 或 HTTPS。')
                seen.add(url)
                urls.append(url)
            normalized[name] = tuple(urls)
        return normalized

    @property
    def configured(self) -> bool:
        """是否至少配置了一个地址；全空时 service 层直接报「尚未配置授权服务器」。"""
        # 读操作也加锁：与 candidates() / mark_failed 的写操作互斥。
        with self._lock:
            return any(self._batches.values())

    def candidates(self) -> list[LicenseEndpoint]:
        """返回本次可用的候选端点，列表顺序即尝试顺序。
        """
        with self._lock:
            now = self._clock()
            # 顺手清理已过期的黑名单项：没有后台清理任务，不在这里清字典会
            # 随失败过的地址数一直增长。
            self._blacklist_until = {url: expires_at for url, expires_at in self._blacklist_until.items() if expires_at > now}
            available = {batch: [url for url in urls if url not in self._blacklist_until] for batch, urls in self._batches.items()}
            # esa 与 eo 同级，随机决定先后顺序；两批都空时 preferred 为空。
            preferred = [batch for batch in ('esa', 'eo') if available[batch]]
            self._rng.shuffle(preferred)
            # 只有前面两批全不可用时才使用 direct —— 直连通常延迟更高、也更容易被封。
            batch_order = preferred + (['direct'] if available['direct'] else [])
            result = []
            for batch in batch_order:
                urls = list(available[batch])
                # 同批内多地址同样洗牌，做客户端侧负载均衡。
                self._rng.shuffle(urls)
                result.extend(LicenseEndpoint(batch=batch, base_url=url) for url in urls)
            return result

    def mark_failed(self, base_url: str) -> None:
        """把某地址拉黑一段时间；由 service 层在连接失败 / 5xx / 格式错误时调用。"""
        with self._lock:
            # 以 self._clock() 起算，与 candidates() 的过期判据用同一时间源。
            self._blacklist_until[base_url] = self._clock() + self._blacklist_seconds

    def retry_failed(self) -> None:
        """清空黑名单，让一次计划重试能重新探测所有地址。

        存在的理由是「拉黑」与「人工重试」的判据不同：拉黑是为了在连续失败时快速止损，
        而用户明确点了重试，就是要求「现在就再试一遍」，沿用旧冷却会让这一下必然无效。
        """
        with self._lock:
            self._blacklist_until.clear()
