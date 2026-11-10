import { expect, test } from 'bun:test'
import { createContactShadowPersistentCache } from '../../../../homeos/frontend/src/studio/app/3d-studio/plan/contact-shadow-persistent-cache.ts'
import { createReflectionPersistentCache } from '../../../../homeos/frontend/src/studio/app/3d-studio/reflection/reflection-persistent-cache.ts'

const fakeEnv = (withIndexedDb = true) => ({
  indexedDB: withIndexedDb ? { open: () => ({}) } : undefined,
  location: { search: '' },
  setTimeout: () => 1,
  clearTimeout: () => {},
  addEventListener: () => {},
})

test('stats keep the per-cache size field name', () => {
  expect(createContactShadowPersistentCache({ env: fakeEnv(), key: 'k' }).stats()).toMatchObject({
    floors: 0,
    bytes: 0,
  })
  expect(createReflectionPersistentCache({ env: fakeEnv(), key: 'k' }).stats()).toMatchObject({ receivers: 0 })
})

test('unavailable cache finishes enqueued work immediately', () => {
  let done = 0
  const cache = createReflectionPersistentCache({ env: fakeEnv(false), key: 'k' })
  cache.enqueue(
    'a',
    'sig',
    async () => null,
    () => true,
    () => done++,
  )
  expect(done).toBe(1)
  expect(createContactShadowPersistentCache({ env: fakeEnv(), key: '' }).available()).toBe(false)
})

test('done fires exactly once on replace, overflow and dispose', () => {
  const done = new Map()
  const finish = (id) => () => done.set(id, (done.get(id) || 0) + 1)
  const cache = createReflectionPersistentCache({ env: fakeEnv(), key: 'k' })
  cache.enqueue(
    'a',
    'sig-1',
    async () => null,
    () => true,
    finish('a1'),
  )
  cache.enqueue(
    'a',
    'sig-2',
    async () => null,
    () => true,
    finish('a2'),
  )
  expect(done.get('a1')).toBe(1)
  for (let index = 0; index < 8; index++)
    cache.enqueue(
      `k${index}`,
      'sig',
      async () => null,
      () => true,
      finish(`k${index}`),
    )
  expect(done.get('a2')).toBe(1)
  cache.dispose()
  for (let index = 0; index < 8; index++) expect(done.get(`k${index}`)).toBe(1)
  expect(done.get('a1')).toBe(1)
})

test('peek misses without a stored snapshot', () => {
  const cache = createContactShadowPersistentCache({ env: fakeEnv(), key: 'k' })
  expect(cache.peek('floor', 'sig')).toBeNull()
  expect(cache.stats().misses).toBe(1)
})
