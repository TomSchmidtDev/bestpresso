import assert from 'node:assert/strict'
import test from 'node:test'
import { bagFreshness, daysSinceRoast, findExistingBean, groupBeansByRoaster, removeBatch, removeBatchesForBean, removeBean, upsertBatch, upsertBean, workflowContextForBag } from '../src/domain/bag.ts'
import type { Bean, BeanBatch } from '../src/domain/bag.ts'

const bean = (overrides: Partial<Bean> = {}): Bean => ({
  id: 'bean-1', roaster: 'Rüst & Ruh', name: 'Kenia Peaberry', decaf: false, archived: false,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides,
})
const batch = (overrides: Partial<BeanBatch> = {}): BeanBatch => ({
  id: 'batch-1', beanId: 'bean-1', frozen: false, archived: false,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides,
})

test('daysSinceRoast returns null for missing or invalid dates', () => {
  assert.equal(daysSinceRoast(null), null)
  assert.equal(daysSinceRoast(undefined), null)
  assert.equal(daysSinceRoast('not-a-date'), null)
})

test('daysSinceRoast rounds down to whole days', () => {
  const now = new Date('2026-02-11T00:00:00Z').getTime()
  assert.equal(daysSinceRoast('2026-02-01T00:00:00Z', now), 10)
  assert.equal(daysSinceRoast('2026-02-10T18:00:00Z', now), 0)
})

test('bagFreshness buckets by day count', () => {
  assert.equal(bagFreshness(null), 'unknown')
  assert.equal(bagFreshness(0), 'fresh')
  assert.equal(bagFreshness(7), 'fresh')
  assert.equal(bagFreshness(8), 'ok')
  assert.equal(bagFreshness(14), 'ok')
  assert.equal(bagFreshness(15), 'stale')
})

test('groupBeansByRoaster preserves first-seen roaster order and groups case-sensitively', () => {
  const beans = [bean({ id: 'b1', roaster: 'Rüst & Ruh' }), bean({ id: 'b2', roaster: 'Bonanza' }), bean({ id: 'b3', roaster: 'Rüst & Ruh' })]
  const groups = groupBeansByRoaster(beans)
  assert.deepEqual(groups.map((group) => group.roaster), ['Rüst & Ruh', 'Bonanza'])
  assert.deepEqual(groups[0].beans.map((candidate) => candidate.id), ['b1', 'b3'])
})

test('workflowContextForBag pulls exactly the three linked fields', () => {
  assert.deepEqual(workflowContextForBag(bean(), batch()), { beanBatchId: 'batch-1', coffeeName: 'Kenia Peaberry', coffeeRoaster: 'Rüst & Ruh' })
})

test('findExistingBean matches roaster+name case-insensitively, trimmed', () => {
  const beans = [bean({ roaster: 'Rüst & Ruh', name: 'Kenia Peaberry' })]
  assert.equal(findExistingBean(beans, ' rüst & ruh ', ' KENIA PEABERRY ')?.id, 'bean-1')
  assert.equal(findExistingBean(beans, 'Rüst & Ruh', 'Ethiopia Guji'), undefined)
})

test('upsertBean replaces an existing bean by id, appends a new one', () => {
  const beans = [bean({ id: 'b1', name: 'Old name' })]
  const updated = upsertBean(beans, bean({ id: 'b1', name: 'New name' }))
  assert.equal(updated.length, 1)
  assert.equal(updated[0].name, 'New name')
  const appended = upsertBean(beans, bean({ id: 'b2' }))
  assert.equal(appended.length, 2)
})

test('removeBean drops only the matching id', () => {
  const beans = [bean({ id: 'b1' }), bean({ id: 'b2' })]
  assert.deepEqual(removeBean(beans, 'b1').map((candidate) => candidate.id), ['b2'])
})

test('upsertBatch replaces an existing batch by id, appends a new one', () => {
  const batches = [batch({ id: 'x1', weight: 250 })]
  const updated = upsertBatch(batches, batch({ id: 'x1', weight: 200 }))
  assert.equal(updated.length, 1)
  assert.equal(updated[0].weight, 200)
  assert.equal(upsertBatch(batches, batch({ id: 'x2' })).length, 2)
})

test('removeBatch drops only the matching id, removeBatchesForBean drops all for that bean', () => {
  const batches = [batch({ id: 'x1', beanId: 'b1' }), batch({ id: 'x2', beanId: 'b1' }), batch({ id: 'x3', beanId: 'b2' })]
  assert.deepEqual(removeBatch(batches, 'x1').map((candidate) => candidate.id), ['x2', 'x3'])
  assert.deepEqual(removeBatchesForBean(batches, 'b1').map((candidate) => candidate.id), ['x3'])
})
