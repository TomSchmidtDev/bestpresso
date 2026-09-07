import type { Bean, BeanBatch } from '../api/decaid/types'

export type { Bean, BeanBatch } from '../api/decaid/types'

export interface Bag {
  bean: Bean
  batch: BeanBatch
}

export type BagFreshness = 'fresh' | 'ok' | 'stale' | 'unknown'

const DAY_MS = 24 * 60 * 60 * 1000

export function daysSinceRoast(roastDate: string | null | undefined, now: number = Date.now()): number | null {
  if (!roastDate) return null
  const roasted = new Date(roastDate).getTime()
  if (!Number.isFinite(roasted)) return null
  return Math.max(0, Math.floor((now - roasted) / DAY_MS))
}

export function bagFreshness(days: number | null): BagFreshness {
  if (days === null) return 'unknown'
  if (days <= 7) return 'fresh'
  if (days <= 14) return 'ok'
  return 'stale'
}

export function groupBeansByRoaster(beans: Bean[]): { roaster: string; beans: Bean[] }[] {
  const order: string[] = []
  const groups = new Map<string, Bean[]>()
  for (const bean of beans) {
    const existing = groups.get(bean.roaster)
    if (existing) existing.push(bean)
    else { groups.set(bean.roaster, [bean]); order.push(bean.roaster) }
  }
  return order.map((roaster) => ({ roaster, beans: groups.get(roaster)! }))
}

export function workflowContextForBag(bean: Bean, batch: BeanBatch) {
  return { beanBatchId: batch.id, coffeeName: bean.name, coffeeRoaster: bean.roaster }
}

export function findExistingBean(beans: Bean[], roaster: string, name: string): Bean | undefined {
  const normalize = (value: string) => value.trim().toLowerCase()
  const roasterKey = normalize(roaster)
  const nameKey = normalize(name)
  return beans.find((bean) => normalize(bean.roaster) === roasterKey && normalize(bean.name) === nameKey)
}

export function upsertBean(beans: Bean[], bean: Bean): Bean[] {
  const index = beans.findIndex((candidate) => candidate.id === bean.id)
  if (index === -1) return [...beans, bean]
  return beans.map((candidate, candidateIndex) => candidateIndex === index ? bean : candidate)
}

export function removeBean(beans: Bean[], beanId: string): Bean[] {
  return beans.filter((bean) => bean.id !== beanId)
}

export function upsertBatch(batches: BeanBatch[], batch: BeanBatch): BeanBatch[] {
  const index = batches.findIndex((candidate) => candidate.id === batch.id)
  if (index === -1) return [...batches, batch]
  return batches.map((candidate, candidateIndex) => candidateIndex === index ? batch : candidate)
}

export function removeBatch(batches: BeanBatch[], batchId: string): BeanBatch[] {
  return batches.filter((batch) => batch.id !== batchId)
}

export function removeBatchesForBean(batches: BeanBatch[], beanId: string): BeanBatch[] {
  return batches.filter((batch) => batch.beanId !== beanId)
}
