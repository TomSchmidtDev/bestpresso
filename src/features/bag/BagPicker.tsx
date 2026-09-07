import { bagFreshness, daysSinceRoast } from '../../domain/bag'
import type { Bag } from '../../domain/bag'

interface BagPickerProps {
  bags: Bag[]
  activeBeanBatchId: string | undefined
  onSelect: (bag: Bag) => void
  onAddNew: () => void
  onManageBeans: () => void
  onDismiss: () => void
}

export function BagPicker({ bags, activeBeanBatchId, onSelect, onAddNew, onManageBeans, onDismiss }: BagPickerProps) {
  return <div className="bag-picker-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onDismiss() }}>
    <section className="bag-picker" role="dialog" aria-modal="true" aria-labelledby="bag-picker-title">
      <header className="bag-picker__header">
        <div>
          <h2 id="bag-picker-title">Select a bag</h2>
          <p>Pick an existing bag or add a new one.</p>
          <button className="bag-picker__manage-link" type="button" onClick={onManageBeans}>Manage beans &amp; roasters</button>
        </div>
        <button className="bag-picker__close" type="button" aria-label="Close" onClick={onDismiss}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 5L19 19M19 5L5 19" stroke="#dcdcdc" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </header>
      <div className="bag-picker__grid">
        {bags.map((bag) => {
          const days = daysSinceRoast(bag.batch.roastDate)
          const freshness = bagFreshness(days)
          const selected = bag.batch.id === activeBeanBatchId
          return <button key={bag.batch.id} className={`bag-card${selected ? ' bag-card--selected' : ''}`} type="button" onClick={() => onSelect(bag)}>
            <div className="bag-card__top">
              <span className={`bag-card__badge bag-card__badge--${freshness}`}>{days === null ? 'No roast date' : days === 0 ? 'Today' : `${days}d`}</span>
            </div>
            <strong>{bag.bean.roaster}</strong>
            <span className="bag-card__bean">{bag.bean.name}</span>
          </button>
        })}
        <button className="bag-card bag-card--add" type="button" onClick={onAddNew}>
          <span className="bag-card__add-icon"><svg width="16" height="16" viewBox="0 0 48 48" fill="none"><path d="M24 14v20M14 24h20" stroke="#dcdcdc" strokeWidth="3" strokeLinecap="round" /></svg></span>
          <strong>New bag</strong>
        </button>
        {!bags.length && <p className="bag-picker__empty">No bags yet — add your first one.</p>}
      </div>
    </section>
  </div>
}
