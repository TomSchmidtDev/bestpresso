import { useEffect, useRef, useState } from 'react'
import { createBean, createBeanBatch, deleteBean, deleteBeanBatch, getAllBeanBatches, getBeans, updateBean, updateBeanBatch } from '../../api/decaid/client'
import type { CreateBeanBatchInput, CreateBeanInput, UpdateBeanBatchInput, UpdateBeanInput } from '../../api/decaid/types'
import { findExistingBean, removeBatch, removeBatchesForBean, removeBean, upsertBatch, upsertBean } from '../../domain/bag'
import type { Bean, BeanBatch } from '../../domain/bag'
import type { DataConnection } from '../../domain/brewing'
import { bagFixture } from '../../fixtures/brewingFixture'

let fixtureIdCounter = 0
const nextFixtureId = (prefix: string) => `${prefix}-${Date.now()}-${fixtureIdCounter++}`

export function useBagData(connection: DataConnection) {
  const [beans, setBeans] = useState<Bean[]>(bagFixture.beans)
  const [batches, setBatches] = useState<BeanBatch[]>(bagFixture.batches)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedForConnection = useRef<DataConnection | null>(null)

  useEffect(() => {
    if (connection !== 'connected') { loadedForConnection.current = null; return }
    if (loadedForConnection.current === connection) return
    loadedForConnection.current = connection
    setLoading(true)
    setError(null)
    Promise.all([getBeans(), getAllBeanBatches()])
      .then(([fetchedBeans, fetchedBatches]) => { setBeans(fetchedBeans); setBatches(fetchedBatches) })
      .catch(() => setError('Could not load beans from Decaid.'))
      .finally(() => setLoading(false))
  }, [connection])

  const addBatchToBean = async (beanId: string, batchInput: CreateBeanBatchInput) => {
    if (connection === 'fixture') {
      const batch: BeanBatch = { ...batchInput, id: nextFixtureId('batch'), beanId, weightRemaining: batchInput.weight ?? null, frozen: batchInput.frozen ?? false, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setBatches((current) => upsertBatch(current, batch))
      return batch
    }
    const batch = await createBeanBatch(beanId, batchInput)
    setBatches((current) => upsertBatch(current, batch))
    return batch
  }

  const createBeanAndBatch = async (beanInput: CreateBeanInput, batchInput: CreateBeanBatchInput) => {
    // Reuse an existing bean (same roaster+name) instead of creating a duplicate — a "new bag"
    // for a coffee that's already on file should just add a batch to it, matching DYE2's own
    // add-bean flow (its bean-name dropdown resolves to the existing bean when it matches).
    const existingBean = findExistingBean(beans, beanInput.roaster, beanInput.name)
    if (existingBean) {
      const batch = await addBatchToBean(existingBean.id, batchInput)
      return { bean: existingBean, batch }
    }
    if (connection === 'fixture') {
      const bean: Bean = { ...beanInput, id: nextFixtureId('bean'), decaf: beanInput.decaf ?? false, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setBeans((current) => upsertBean(current, bean))
      const batch = await addBatchToBean(bean.id, batchInput)
      return { bean, batch }
    }
    const bean = await createBean(beanInput)
    setBeans((current) => upsertBean(current, bean))
    const batch = await addBatchToBean(bean.id, batchInput)
    return { bean, batch }
  }

  const updateBeanFields = async (id: string, patch: UpdateBeanInput) => {
    if (connection === 'fixture') {
      const existing = beans.find((bean) => bean.id === id)
      if (!existing) throw new Error(`Unknown fixture bean ${id}`)
      const updated: Bean = { ...existing, ...patch, updatedAt: new Date().toISOString() }
      setBeans((current) => upsertBean(current, updated))
      return updated
    }
    const updated = await updateBean(id, patch)
    setBeans((current) => upsertBean(current, updated))
    return updated
  }

  const updateBatchFields = async (id: string, patch: UpdateBeanBatchInput) => {
    if (connection === 'fixture') {
      const existing = batches.find((batch) => batch.id === id)
      if (!existing) throw new Error(`Unknown fixture batch ${id}`)
      const updated: BeanBatch = { ...existing, ...patch, updatedAt: new Date().toISOString() }
      setBatches((current) => upsertBatch(current, updated))
      return updated
    }
    const updated = await updateBeanBatch(id, patch)
    setBatches((current) => upsertBatch(current, updated))
    return updated
  }

  const deleteBeanAndBatches = async (id: string) => {
    if (connection !== 'fixture') await deleteBean(id)
    setBeans((current) => removeBean(current, id))
    setBatches((current) => removeBatchesForBean(current, id))
  }

  const deleteSingleBatch = async (id: string) => {
    if (connection !== 'fixture') await deleteBeanBatch(id)
    setBatches((current) => removeBatch(current, id))
  }

  const renameRoaster = async (oldRoaster: string, newRoaster: string) => {
    const affected = beans.filter((bean) => bean.roaster === oldRoaster)
    for (const bean of affected) await updateBeanFields(bean.id, { roaster: newRoaster })
  }

  return { beans, batches, loading, error, createBeanAndBatch, addBatchToBean, updateBeanFields, updateBatchFields, deleteBeanAndBatches, deleteSingleBatch, renameRoaster }
}
