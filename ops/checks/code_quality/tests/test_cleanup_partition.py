"""cleanup.py 单趟 partition 变换的等价性与性能检查。"""

from __future__ import annotations

import random
import time
import unittest


def legacy_partition(items, removed, binding_key):
    deleted = [item for item in items if binding_key(item) in removed]
    if not deleted:
        return None
    return deleted, [item for item in items if item not in deleted]


def new_partition(items, removed, binding_key):
    deleted = []
    kept = []
    for item in items:
        (deleted if binding_key(item) in removed else kept).append(item)
    if not deleted:
        return None
    return deleted, kept


class CleanupPartitionEquivalenceTest(unittest.TestCase):
    def test_random_inputs_match(self):
        rng = random.Random(20261020)
        for _ in range(300):
            size = rng.randint(0, 30)
            items = [
                {'id': f'i{i}', 'key': rng.choice(['a', 'b', 'c', 'd']), 'label': f'l{i}'}
                for i in range(size)
            ]
            removed = {rng.choice(['a', 'b', 'c', 'd']) for _ in range(rng.randint(0, 3))}
            legacy = legacy_partition(items, removed, lambda item: item['key'])
            new = new_partition(items, removed, lambda item: item['key'])
            self.assertEqual(legacy, new)
            if new is not None:
                self.assertEqual(
                    [item['id'] for item in new[1]],
                    [item['id'] for item in items if item['key'] not in removed],
                )

    def test_partition_benchmark(self):
        items = [{'id': str(i), 'key': str(i % 50)} for i in range(6000)]
        removed = {str(i) for i in range(0, 50, 3)}

        def run(fn):
            start = time.perf_counter()
            fn(items, removed, lambda item: item['key'])
            return (time.perf_counter() - start) * 1000

        legacy_ms = min(run(legacy_partition) for _ in range(3))
        new_ms = min(run(new_partition) for _ in range(3))
        print(f'\n[bench] cleanup partition 6000 items: legacy={legacy_ms:.3f}ms new={new_ms:.3f}ms speedup={legacy_ms / new_ms:.2f}x')


if __name__ == '__main__':
    unittest.main(verbosity=2)
