import { bagFreshness, daysSinceRoast } from '../../domain/bag'
import type { ActiveBag } from '../../domain/brewing'

export function BagBar({ activeBag, onOpen }: { activeBag?: ActiveBag | null; onOpen: () => void }) {
  if (!activeBag) return <button className="bag-bar bag-bar--empty" type="button" onClick={onOpen}>
    <span className="bag-bar__icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3.5c4.2 0 7 3.9 7 8.4 0 4.2-2.9 8.6-7 8.6s-7-4.4-7-8.6c0-4.5 2.8-8.4 7-8.4Z" stroke="#878787" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 4v16" stroke="#878787" strokeWidth="1.4" strokeLinecap="round" /></svg>
    </span>
    <span className="bag-bar__text"><span className="bag-bar__label">Bag</span><span className="bag-bar__meta">Select a bag</span></span>
    <ChevronRight />
  </button>

  const days = daysSinceRoast(null)
  const freshness = bagFreshness(days)
  return <button className="bag-bar" type="button" onClick={onOpen}>
    <span className={`bag-bar__icon bag-bar__icon--${freshness}`} aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3.5c4.2 0 7 3.9 7 8.4 0 4.2-2.9 8.6-7 8.6s-7-4.4-7-8.6c0-4.5 2.8-8.4 7-8.4Z" stroke="#53d68e" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 4v16" stroke="#53d68e" strokeWidth="1.4" strokeLinecap="round" /></svg>
    </span>
    <span className="bag-bar__text">
      <span className="bag-bar__label">Bag</span>
      <span className="bag-bar__value">{activeBag.coffeeRoaster}</span>
      <span className="bag-bar__sep">·</span>
      <span className="bag-bar__value">{activeBag.coffeeName}</span>
    </span>
    <ChevronRight />
  </button>
}

function ChevronRight() {
  return <span className="bag-bar__chevron" aria-hidden="true"><svg width="7" height="12" viewBox="0 0 48 48" fill="none"><path d="M21 17L28 24L21 31" stroke="#DCDCDC" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
}
