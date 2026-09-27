#!/usr/bin/env python3
"""翻译表缓存的收益实测：真实流量基线 + 本地确定性基准。
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import pathlib
import statistics
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.server.api.ha import EntityTranslationCache  # noqa: E402

TARGET_PATH = '/api/v1/ha/translations'


def extract_log_baseline(log_path: pathlib.Path) -> dict:
    """从全局事件日志里取该接口的**真实**慢请求分布（改前基线）。"""
    slow = 0
    target: list[tuple[str, float]] = []
    with log_path.open(encoding='utf-8', errors='ignore') as handle:
        for line in handle:
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if record.get('category') != '性能':
                continue
            context = record.get('context') or {}
            duration = context.get('durationMs')
            if duration is None:
                continue
            slow += 1
            if context.get('path') == TARGET_PATH:
                target.append((record.get('timestamp') or '', float(duration)))

    durations = sorted(item[1] for item in target)
    stamps = sorted(
        dt.datetime.fromisoformat(item[0]).timestamp() for item in target if item[0]
    )
    batches = 0
    biggest = 0
    index = 0
    while index < len(stamps):
        end = index
        while end + 1 < len(stamps) and stamps[end + 1] - stamps[index] <= 5:
            end += 1
        if end > index:
            batches += 1
            biggest = max(biggest, end - index + 1)
        index = end + 1
    return {
        'slowTotal': slow,
        'targetCount': len(target),
        'share': (100.0 * len(target) / slow) if slow else 0.0,
        'medianMs': statistics.median(durations) if durations else 0.0,
        'p90Ms': durations[int(len(durations) * 0.9)] if durations else 0.0,
        'maxMs': durations[-1] if durations else 0.0,
        'batches5s': batches,
        'biggestBatch': biggest,
        'firstAt': dt.datetime.fromtimestamp(stamps[0], dt.UTC).isoformat() if stamps else '',
        'lastAt': dt.datetime.fromtimestamp(stamps[-1], dt.UTC).isoformat() if stamps else '',
    }


async def run_benchmark(latency_ms: float, concurrency: int) -> int:
    """确定性基准。返回进程退出码（0 = 全部断言通过）。"""
    latency = latency_ms / 1000.0
    failures: list[str] = []
    workdir = pathlib.Path(tempfile.mkdtemp(prefix='bench-translations-'))
    cache_path = workdir / 'entity-translations.json'
    key = EntityTranslationCache.key('conn-1', 'zh-Hans', {'xiaomi_miot', 'light'})

    def make_fetch(counter: list[int]):
        async def fetch() -> dict[str, str]:
            counter.append(1)
            await asyncio.sleep(latency)
            return {'light.demo': '演示灯'}

        return fetch

    # ① 同键并发：改前每个并发调用各回源一次；改后只回源一次。
    calls: list[int] = []
    cache = EntityTranslationCache(ttl_seconds=3600, cache_path=cache_path)
    started = time.monotonic()
    results = await asyncio.gather(*(cache.get_or_fetch(key, make_fetch(calls)) for _ in range(concurrency)))
    deduped_ms = (time.monotonic() - started) * 1000
    print('[单飞] %d 个并发同键请求：回源 %d 次，墙钟 %.0f ms' % (concurrency, len(calls), deduped_ms))
    if len(calls) != 1:
        failures.append('single-flight 期望回源 1 次，实际 %d 次' % len(calls))
    if any(item != results[0] for item in results):
        failures.append('并发调用拿到的翻译表不一致')
    if len(calls) == 1 and deduped_ms > latency_ms * 3 + 200:
        failures.append('single-flight 墙钟 %.0f ms 明显超过一次回源' % deduped_ms)

    reference: list[int] = []
    reference_fetch = make_fetch(reference)
    started = time.monotonic()
    for _ in range(concurrency):
        await reference_fetch()
    without_ms = (time.monotonic() - started) * 1000
    print(
        '[改前] 同样 %d 个请求：上游 %d 次往返，顺序回源墙钟 %.0f ms（↑%.1f 倍上游负载）'
        % (concurrency, len(reference), without_ms, len(reference) / max(len(calls), 1))
    )

    # ③ 磁盘缓存：进程重启（新实例）后不再回源。
    size = cache_path.stat().st_size if cache_path.exists() else 0
    reopened = EntityTranslationCache(ttl_seconds=3600, cache_path=cache_path)
    restarted_calls: list[int] = []
    hit = reopened.get(key)
    if hit is None:
        failures.append('磁盘缓存未命中：新实例读不到落盘的翻译表')
    print('[磁盘] 落盘 %d 字节；新实例命中=%s，回源 %d 次' % (size, hit is not None, len(restarted_calls)))
    if size <= 0:
        failures.append('磁盘缓存文件为空')

    # ④ clear()：内存、磁盘与在途代次一起作废；清空之后才回来的回源不许写回。
    slow_calls: list[int] = []

    async def slow_fetch() -> dict[str, str]:
        slow_calls.append(1)
        await asyncio.sleep(latency * 4)
        return {'light.demo': '上一台 HA 的表'}

    inflight = asyncio.ensure_future(reopened.get_or_fetch(EntityTranslationCache.key('conn-2', 'zh-Hans', set()), slow_fetch))
    await asyncio.sleep(latency)
    reopened.clear()
    await inflight
    if reopened.entries:
        failures.append('clear() 之后内存里仍有条目')
    if cache_path.exists():
        failures.append('clear() 之后磁盘文件仍在')
    if reopened.get(EntityTranslationCache.key('conn-2', 'zh-Hans', set())) is not None:
        failures.append('clear() 之后在途回源仍写回了缓存（代次没生效）')
    print('[代次] clear() 后内存空=%s，磁盘已删=%s，在途回源未写回=%s'
          % (not reopened.entries, not cache_path.exists(),
             reopened.get(EntityTranslationCache.key('conn-2', 'zh-Hans', set())) is None))

    print()
    if failures:
        for item in failures:
            print('  !! %s' % item)
        print('基准未通过：%d 项断言失败' % len(failures))
        return 1
    print('基准全部通过（回源次数与落盘都已断言钉住，不是只打印数字给人看）')
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description='翻译表缓存收益实测')
    parser.add_argument('--latency-ms', type=float, default=50.0, help='注入的每次回源延迟（毫秒）')
    parser.add_argument('--concurrency', type=int, default=8, help='并发同键请求数')
    parser.add_argument('--logs', type=pathlib.Path, default=None, help='只提取真实流量基线后退出')
    options = parser.parse_args()

    log_path = options.logs or (ROOT / 'data' / 'logs' / 'global-events.jsonl')
    if log_path.exists():
        baseline = extract_log_baseline(log_path)
        print('[真实基线] %s' % log_path)
        print('  慢请求 %d 条，其中该接口 %d 条（%.1f%%）'
              % (baseline['slowTotal'], baseline['targetCount'], baseline['share']))
        print('  耗时 中位 %.0f ms · p90 %.0f ms · 最大 %.0f ms'
              % (baseline['medianMs'], baseline['p90Ms'], baseline['maxMs']))
        print('  5 秒内 >=2 次的批次 %d 个（最大 %d 次）；样本区间（UTC）%s -> %s'
              % (baseline['batches5s'], baseline['biggestBatch'], baseline['firstAt'][:19], baseline['lastAt'][:19]))
        print('  注意：该实例在改动之后没有该接口的流量，所以「改后」只能由下面的本地基准给出。')
    else:
        print('[真实基线] 找不到日志 %s，跳过' % log_path)
    print()

    if options.logs is not None:
        return 0
    return asyncio.run(run_benchmark(options.latency_ms, options.concurrency))


if __name__ == '__main__':
    raise SystemExit(main())

