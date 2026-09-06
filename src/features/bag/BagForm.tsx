import { useState } from 'react'
import type { CreateBeanBatchInput, CreateBeanInput, UpdateBeanBatchInput, UpdateBeanInput } from '../../api/decaid/types'
import type { Bag } from '../../domain/bag'

interface BagFormProps {
  existing: Bag | null
  existingRoasters: string[]
  existingBeanNamesForRoaster: (roaster: string) => string[]
  onSave: (beanInput: CreateBeanInput, beanPatch: UpdateBeanInput, batchInput: CreateBeanBatchInput, batchPatch: UpdateBeanBatchInput) => Promise<void>
  onCancel: () => void
}

const toDateInputValue = (iso: string | null | undefined) => iso ? iso.slice(0, 10) : ''
const fromDateInputValue = (value: string): string | null => value ? new Date(`${value}T00:00:00Z`).toISOString() : null
const toNumberOrNull = (value: string): number | null => value.trim() === '' ? null : Number(value)

export function BagForm({ existing, existingRoasters, existingBeanNamesForRoaster, onSave, onCancel }: BagFormProps) {
  const [roaster, setRoaster] = useState(existing?.bean.roaster ?? '')
  const [name, setName] = useState(existing?.bean.name ?? '')
  const [species, setSpecies] = useState(existing?.bean.species ?? '')
  const [decaf, setDecaf] = useState(existing?.bean.decaf ?? false)
  const [decafProcess, setDecafProcess] = useState(existing?.bean.decafProcess ?? '')
  const [country, setCountry] = useState(existing?.bean.country ?? '')
  const [region, setRegion] = useState(existing?.bean.region ?? '')
  const [producer, setProducer] = useState(existing?.bean.producer ?? '')
  const [variety, setVariety] = useState((existing?.bean.variety ?? []).join(', '))
  const [altitudeMin, setAltitudeMin] = useState(existing?.bean.altitude?.[0]?.toString() ?? '')
  const [altitudeMax, setAltitudeMax] = useState(existing?.bean.altitude?.[1]?.toString() ?? '')
  const [processing, setProcessing] = useState(existing?.bean.processing ?? '')
  const [beanNotes, setBeanNotes] = useState(existing?.bean.notes ?? '')
  const [roastDate, setRoastDate] = useState(toDateInputValue(existing?.batch.roastDate))
  const [roastLevel, setRoastLevel] = useState(existing?.batch.roastLevel ?? '')
  const [harvestDate, setHarvestDate] = useState(existing?.batch.harvestDate ?? '')
  const [qualityScore, setQualityScore] = useState(existing?.batch.qualityScore?.toString() ?? '')
  const [frozen, setFrozen] = useState(existing?.batch.frozen ?? false)
  const [price, setPrice] = useState(existing?.batch.price?.toString() ?? '')
  const [currency, setCurrency] = useState(existing?.batch.currency ?? '')
  const [weight, setWeight] = useState(existing?.batch.weight?.toString() ?? '')
  const [weightRemaining, setWeightRemaining] = useState(existing?.batch.weightRemaining?.toString() ?? '')
  const [buyDate, setBuyDate] = useState(toDateInputValue(existing?.batch.buyDate))
  const [openDate, setOpenDate] = useState(toDateInputValue(existing?.batch.openDate))
  const [bestBeforeDate, setBestBeforeDate] = useState(toDateInputValue(existing?.batch.bestBeforeDate))
  const [freezeDate, setFreezeDate] = useState(toDateInputValue(existing?.batch.freezeDate))
  const [unfreezeDate, setUnfreezeDate] = useState(toDateInputValue(existing?.batch.unfreezeDate))
  const [batchNotes, setBatchNotes] = useState(existing?.batch.notes ?? '')
  const [saving, setSaving] = useState(false)

  const beanNames = existingBeanNamesForRoaster(roaster)
  const canSave = roaster.trim().length > 0 && name.trim().length > 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    const varietyList = variety.split(',').map((entry) => entry.trim()).filter(Boolean)
    const altitude: [number, number] | null = altitudeMin.trim() && altitudeMax.trim() ? [Number(altitudeMin), Number(altitudeMax)] : null
    const beanFields = {
      roaster: roaster.trim(),
      name: name.trim(),
      species: species.trim() || null,
      decaf,
      decafProcess: decaf ? (decafProcess.trim() || null) : null,
      country: country.trim() || null,
      region: region.trim() || null,
      producer: producer.trim() || null,
      variety: varietyList.length ? varietyList : null,
      altitude,
      processing: processing.trim() || null,
      notes: beanNotes.trim() || null,
    }
    const batchFields = {
      roastDate: fromDateInputValue(roastDate),
      roastLevel: roastLevel.trim() || null,
      harvestDate: harvestDate.trim() || null,
      qualityScore: toNumberOrNull(qualityScore),
      price: toNumberOrNull(price),
      currency: currency.trim() || null,
      weight: toNumberOrNull(weight),
      weightRemaining: toNumberOrNull(weightRemaining),
      buyDate: fromDateInputValue(buyDate),
      openDate: fromDateInputValue(openDate),
      bestBeforeDate: fromDateInputValue(bestBeforeDate),
      freezeDate: fromDateInputValue(freezeDate),
      unfreezeDate: fromDateInputValue(unfreezeDate),
      frozen,
      notes: batchNotes.trim() || null,
    }
    try {
      await onSave(beanFields as CreateBeanInput, beanFields, batchFields as CreateBeanBatchInput, batchFields)
    } finally {
      setSaving(false)
    }
  }

  return <div className="bag-form-overlay" role="presentation">
    <section className="bag-form" role="dialog" aria-modal="true" aria-labelledby="bag-form-title">
      <header className="bag-form__header">
        <h2 id="bag-form-title">{existing ? 'Edit bag' : 'New bag'}</h2>
        <div className="bag-form__actions">
          <button className="btn btn--ghost" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={() => void handleSave()} disabled={!canSave}>Save</button>
        </div>
      </header>
      <div className="bag-form__body">
        <div className="bag-form__card">
          <div className="bag-form__grid2">
            <label className="bag-form__field">
              <span>Roaster</span>
              <input list="bag-form-roasters" value={roaster} onChange={(event) => setRoaster(event.target.value)} placeholder="Enter or select roaster" />
              <datalist id="bag-form-roasters">{existingRoasters.map((candidate) => <option key={candidate} value={candidate} />)}</datalist>
            </label>
            <label className="bag-form__field">
              <span>Bean</span>
              <input list="bag-form-beans" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter or select bean name" />
              <datalist id="bag-form-beans">{beanNames.map((candidate) => <option key={candidate} value={candidate} />)}</datalist>
            </label>
          </div>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Roast date</span><input type="date" value={roastDate} onChange={(event) => setRoastDate(event.target.value)} /></label>
            <label className="bag-form__field"><span>Roast level</span><input type="text" value={roastLevel} onChange={(event) => setRoastLevel(event.target.value)} placeholder="e.g. medium-light" /></label>
          </div>
        </div>

        <div className="bag-form__card">
          <p className="bag-form__card-title">Origin &amp; variety</p>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Species</span><input type="text" value={species} onChange={(event) => setSpecies(event.target.value)} placeholder="arabica, robusta" /></label>
            <label className="bag-form__field"><span>Processing</span><input type="text" value={processing} onChange={(event) => setProcessing(event.target.value)} placeholder="washed, natural, honey" /></label>
          </div>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Country</span><input type="text" value={country} onChange={(event) => setCountry(event.target.value)} /></label>
            <label className="bag-form__field"><span>Region</span><input type="text" value={region} onChange={(event) => setRegion(event.target.value)} /></label>
          </div>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Producer</span><input type="text" value={producer} onChange={(event) => setProducer(event.target.value)} /></label>
            <label className="bag-form__field"><span>Variety</span><input type="text" value={variety} onChange={(event) => setVariety(event.target.value)} placeholder="comma separated" /></label>
          </div>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Altitude min (m)</span><input type="number" value={altitudeMin} onChange={(event) => setAltitudeMin(event.target.value)} /></label>
            <label className="bag-form__field"><span>Altitude max (m)</span><input type="number" value={altitudeMax} onChange={(event) => setAltitudeMax(event.target.value)} /></label>
          </div>
          <div className="bag-form__grid2">
            <label className="bag-form__field bag-form__field--toggle"><span>Decaf</span><input type="checkbox" checked={decaf} onChange={(event) => setDecaf(event.target.checked)} /></label>
            <label className="bag-form__field"><span>Decaf process</span><input type="text" value={decafProcess} disabled={!decaf} onChange={(event) => setDecafProcess(event.target.value)} placeholder="Swiss Water, CO2" /></label>
          </div>
        </div>

        <div className="bag-form__card">
          <p className="bag-form__card-title">Roast &amp; batch details</p>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Harvest date</span><input type="text" value={harvestDate} onChange={(event) => setHarvestDate(event.target.value)} placeholder="e.g. 2025 dry season" /></label>
            <label className="bag-form__field"><span>Quality score</span><input type="number" step="0.1" value={qualityScore} onChange={(event) => setQualityScore(event.target.value)} /></label>
          </div>
          <label className="bag-form__field bag-form__field--toggle"><span>Frozen</span><input type="checkbox" checked={frozen} onChange={(event) => setFrozen(event.target.checked)} /></label>
        </div>

        <div className="bag-form__card">
          <p className="bag-form__card-title">Purchase &amp; storage</p>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Price</span><input type="number" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
            <label className="bag-form__field"><span>Currency</span><input type="text" value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="EUR" /></label>
          </div>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Weight (g)</span><input type="number" value={weight} onChange={(event) => setWeight(event.target.value)} /></label>
            <label className="bag-form__field"><span>Weight remaining (g)</span><input type="number" value={weightRemaining} onChange={(event) => setWeightRemaining(event.target.value)} /></label>
          </div>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Buy date</span><input type="date" value={buyDate} onChange={(event) => setBuyDate(event.target.value)} /></label>
            <label className="bag-form__field"><span>Open date</span><input type="date" value={openDate} onChange={(event) => setOpenDate(event.target.value)} /></label>
          </div>
          <div className="bag-form__grid2">
            <label className="bag-form__field"><span>Best before</span><input type="date" value={bestBeforeDate} onChange={(event) => setBestBeforeDate(event.target.value)} /></label>
            <label className="bag-form__field"><span>Freeze date</span><input type="date" value={freezeDate} onChange={(event) => setFreezeDate(event.target.value)} /></label>
          </div>
          <label className="bag-form__field"><span>Unfreeze date</span><input type="date" value={unfreezeDate} onChange={(event) => setUnfreezeDate(event.target.value)} /></label>
        </div>

        <div className="bag-form__card">
          <p className="bag-form__card-title">Notes</p>
          <label className="bag-form__field"><span>Bean notes</span><textarea value={beanNotes} onChange={(event) => setBeanNotes(event.target.value)} placeholder="Tasting notes, description" /></label>
          <label className="bag-form__field"><span>Batch notes</span><textarea value={batchNotes} onChange={(event) => setBatchNotes(event.target.value)} placeholder="Notes about this specific bag" /></label>
        </div>
      </div>
    </section>
  </div>
}
