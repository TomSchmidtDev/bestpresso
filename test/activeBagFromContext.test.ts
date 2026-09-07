import assert from 'node:assert/strict'
import test from 'node:test'
import { activeBagFromContext } from '../src/api/decaid/adapters.ts'

test('activeBagFromContext returns null when any linked field is missing', () => {
  assert.equal(activeBagFromContext(undefined), null)
  assert.equal(activeBagFromContext({}), null)
  assert.equal(activeBagFromContext({ beanBatchId: 'b1' }), null)
  assert.equal(activeBagFromContext({ beanBatchId: 'b1', coffeeName: 'Kenia Peaberry' }), null)
})

test('activeBagFromContext returns the three linked fields when all are present', () => {
  assert.deepEqual(
    activeBagFromContext({ beanBatchId: 'b1', coffeeName: 'Kenia Peaberry', coffeeRoaster: 'Rüst & Ruh', targetDoseWeight: 18 }),
    { beanBatchId: 'b1', coffeeName: 'Kenia Peaberry', coffeeRoaster: 'Rüst & Ruh' },
  )
})
