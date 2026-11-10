import { expect, test } from 'bun:test'
import { placeMarker } from '../../../../homeos/frontend/src/studio/runtime/core/stage/marker-placement.ts'

function fakeElement() {
  const writes = []
  const props = {}
  const style = {
    left: '',
    top: '',
    setProperty(name, value) {
      writes.push(name)
      props[name] = value
    },
  }
  return { element: { style }, props, writes }
}

test('markers are placed through transform variables and unchanged positions are not rewritten', () => {
  const { element, props, writes } = fakeElement()
  placeMarker(element, 12.5, 40)
  expect([element.style.left, element.style.top]).toEqual(['0px', '0px'])
  expect(props).toEqual({ '--i3d-mx': '12.5px', '--i3d-my': '40px' })
  placeMarker(element, 12.5, 40)
  expect(writes.length).toBe(2)
  placeMarker(element, 13, 40)
  expect(props['--i3d-mx']).toBe('13px')
  expect(writes.length).toBe(4)
})
