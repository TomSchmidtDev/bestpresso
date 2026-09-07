import { useState } from 'react'
import { groupBeansByRoaster } from '../../domain/bag'
import type { Bean, BeanBatch } from '../../domain/bag'

interface BeanManagerProps {
  beans: Bean[]
  batches: BeanBatch[]
  onEditBag: (bean: Bean, batch: BeanBatch) => void
  onDeleteBean: (bean: Bean) => void
  onRenameRoaster: (oldRoaster: string, newRoaster: string) => void
  onAddBag: () => void
  onClose: () => void
}

export function BeanManager({ beans, batches, onEditBag, onDeleteBean, onRenameRoaster, onAddBag, onClose }: BeanManagerProps) {
  const [renamingRoaster, setRenamingRoaster] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const groups = groupBeansByRoaster(beans)

  const startRename = (roaster: string) => { setRenamingRoaster(roaster); setRenameValue(roaster) }
  const confirmRename = (oldRoaster: string) => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== oldRoaster) onRenameRoaster(oldRoaster, trimmed)
    setRenamingRoaster(null)
  }

  return <main className="bean-manager">
    <header className="bean-manager__header">
      <div className="bean-manager__header-left">
        <button className="bean-manager__back" type="button" aria-label="Back" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 48 48" fill="none"><path d="M27 17L20 23.5L27 30" stroke="#DCDCDC" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div>
          <h1>Manage beans</h1>
          <p>Roaster is a field on each bean — renaming it updates every bean in the group.</p>
        </div>
      </div>
      <button className="bean-manager__add" type="button" onClick={onAddBag}>+ Add bag</button>
    </header>
    {groups.map((group) => <section className="bean-manager__group" key={group.roaster}>
      <div className="bean-manager__group-head">
        {renamingRoaster === group.roaster
          ? <input className="bean-manager__rename-input" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => confirmRename(group.roaster)} onKeyDown={(event) => { if (event.key === 'Enter') confirmRename(group.roaster) }} />
          : <p className="bean-manager__group-title">{group.roaster}</p>}
        <button className="bean-manager__rename-btn" type="button" title="Rename roaster" onClick={() => startRename(group.roaster)}>
          <svg width="11" height="11" viewBox="0 0 14.603 14.5" fill="none"><path d="M6.99414 1.03025C7.42323 1.03026 7.77132 1.37757 7.77148 1.80662C7.77148 2.23581 7.42333 2.58395 6.99414 2.58396H4.40332C2.82979 2.58417 1.55469 3.85999 1.55469 5.43357V10.0967C1.55491 11.6701 2.82992 12.9451 4.40332 12.9453H9.58496C11.1583 12.9451 12.4334 11.67 12.4336 10.0967V6.98728C12.4338 6.55836 12.782 6.21101 13.2109 6.21092C13.64 6.21092 13.988 6.5583 13.9883 6.98728V10.0967C13.9881 12.5284 12.0167 14.4997 9.58496 14.5H4.40332C1.97154 14.4998 0.000222676 12.5284 0 10.0967V5.43357C0 3.0016 1.9714 1.03046 4.40332 1.03025H6.99414ZM4.16602 7.83396C4.2747 7.45448 4.751 7.33133 5.03027 7.61033L6.95605 9.53611C7.23536 9.81542 7.11218 10.2918 6.73242 10.4004L4.03613 11.1709L3.96387 11.1865C3.62659 11.2341 3.33346 10.9407 3.38086 10.6035L3.39551 10.5303L4.16602 7.83396ZM10.7314 0.664042C11.617 -0.221392 13.0529 -0.221302 13.9385 0.664042C14.824 1.54954 14.8247 2.98542 13.9395 3.87107L8.53223 9.2783L8.49219 9.31346C8.30233 9.46797 8.02864 9.46811 7.83887 9.31346L7.7998 9.2783L5.3252 6.80369L5.28906 6.76365C5.13453 6.57388 5.13458 6.30013 5.28906 6.11033L5.3252 6.07029L10.7314 0.664042ZM7.15625 6.4365L8.16602 7.44627L11.4199 4.19236L10.4111 3.1826L7.15625 6.4365ZM12.8398 1.76267C12.5613 1.48438 12.1097 1.48446 11.8311 1.76267L11.6475 1.94725L12.6562 2.95603L12.8398 2.77244C13.1184 2.49378 13.1185 2.04129 12.8398 1.76267Z" fill="#9a9a9a" /></svg>
        </button>
      </div>
      <div className="bean-manager__list">
        {group.beans.map((bean) => {
          const beanBatches = batches.filter((batch) => batch.beanId === bean.id)
          return <div className="bean-manager__row" key={bean.id}>
            <div className="bean-manager__row-main">
              <strong>{bean.name}</strong>
              {bean.country && <span className="bean-manager__origin">{bean.country}{bean.region ? `, ${bean.region}` : ''}</span>}
              {bean.processing && <span className="bean-manager__chip">{bean.processing}</span>}
            </div>
            <div className="bean-manager__row-actions">
              {beanBatches[0] && <button className="bean-manager__icon-btn" type="button" title="Edit" onClick={() => onEditBag(bean, beanBatches[0])}>
                <svg width="16" height="16" viewBox="0 0 14.603 14.5" fill="none"><path d="M6.99414 1.03025C7.42323 1.03026 7.77132 1.37757 7.77148 1.80662C7.77148 2.23581 7.42333 2.58395 6.99414 2.58396H4.40332C2.82979 2.58417 1.55469 3.85999 1.55469 5.43357V10.0967C1.55491 11.6701 2.82992 12.9451 4.40332 12.9453H9.58496C11.1583 12.9451 12.4334 11.67 12.4336 10.0967V6.98728C12.4338 6.55836 12.782 6.21101 13.2109 6.21092C13.64 6.21092 13.988 6.5583 13.9883 6.98728V10.0967C13.9881 12.5284 12.0167 14.4997 9.58496 14.5H4.40332C1.97154 14.4998 0.000222676 12.5284 0 10.0967V5.43357C0 3.0016 1.9714 1.03046 4.40332 1.03025H6.99414ZM4.16602 7.83396C4.2747 7.45448 4.751 7.33133 5.03027 7.61033L6.95605 9.53611C7.23536 9.81542 7.11218 10.2918 6.73242 10.4004L4.03613 11.1709L3.96387 11.1865C3.62659 11.2341 3.33346 10.9407 3.38086 10.6035L3.39551 10.5303L4.16602 7.83396ZM10.7314 0.664042C11.617 -0.221392 13.0529 -0.221302 13.9385 0.664042C14.824 1.54954 14.8247 2.98542 13.9395 3.87107L8.53223 9.2783L8.49219 9.31346C8.30233 9.46797 8.02864 9.46811 7.83887 9.31346L7.7998 9.2783L5.3252 6.80369L5.28906 6.76365C5.13453 6.57388 5.13458 6.30013 5.28906 6.11033L5.3252 6.07029L10.7314 0.664042ZM7.15625 6.4365L8.16602 7.44627L11.4199 4.19236L10.4111 3.1826L7.15625 6.4365ZM12.8398 1.76267C12.5613 1.48438 12.1097 1.48446 11.8311 1.76267L11.6475 1.94725L12.6562 2.95603L12.8398 2.77244C13.1184 2.49378 13.1185 2.04129 12.8398 1.76267Z" fill="#e3e3e3" /></svg>
              </button>}
              <button className="bean-manager__icon-btn bean-manager__icon-btn--danger" type="button" title="Delete bean and its bags" onClick={() => onDeleteBean(bean)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="#e88a8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        })}
      </div>
    </section>)}
    {!groups.length && <p className="bean-manager__empty">No beans yet.</p>}
  </main>
}
