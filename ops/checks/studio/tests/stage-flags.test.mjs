import { expect, test } from 'bun:test'
import { forwardedStageFlags } from '../../../../homeos/frontend/src/studio/app/bridge/scene/stage-flags.ts'

const forward = (search) => forwardedStageFlags(new URLSearchParams(search))

test('only whitelisted values are forwarded', () => {
  expect(forward('?furniture-runtime=compact&reflection-detail=high&x=1')).toEqual({ 'furniture-runtime': 'compact' })
  expect(forward('?texture-quality=legacy&reflection-motion-resolution=cap')).toEqual({
    'texture-quality': 'legacy',
    'reflection-motion-resolution': 'cap',
  })
})

test('diagnostic sub-flags require performance-diagnostics', () => {
  expect(forward('?reflection-work=baseline')).toEqual({})
  expect(forward('?performance-diagnostics=1&reflection-work=baseline')).toEqual({
    'performance-diagnostics': '1',
    'reflection-work': 'baseline',
  })
})
