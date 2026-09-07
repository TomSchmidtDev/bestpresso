# Bag / Bean / Roaster Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick which coffee (roaster + bean + specific bag) is behind the shot they're about to pull, from a pill on the bestpresso dashboard, backed by the decaid backend's real `Bean`/`BeanBatch` REST resources.

**Architecture:** A new `src/domain/bag.ts` holds the `Bean`/`BeanBatch`-derived pure logic (freshness, roaster grouping, matching); `src/api/decaid/types.ts` + `client.ts` gain the `Bean`/`BeanBatch` wire types and thin fetch wrappers, plus three new fields on `DecaidWorkflowContext`. `useBrewingData.ts`'s existing `applyWorkflow()` (in `api/decaid/adapters.ts`) is extended to derive `model.activeBag` from the already-polled workflow — no new poll loop. A separate `src/features/bag/useBagData.ts` hook owns the Beans/Batches list (fetch + CRUD), branching on the existing `connection` state exactly like the rest of the app. Four new components in `src/features/bag/` (`BagBar`, `BagPicker`, `BagForm`, `BeanManager`) render the flow; `BeanManager` is a full page (`App.tsx`), the others are overlays owned by `AppShell.tsx`, mirroring `ScaleDevicePicker`/`CleaningSequencePicker`.

**Tech Stack:** React 19 + TypeScript (`verbatimModuleSyntax`, `noUnusedLocals`/`noUnusedParameters`), Vite, Node's built-in test runner (`node --experimental-strip-types --test test/*.test.ts`), one global stylesheet (`src/styles/index.css`), oxlint.

**Spec:** `docs/superpowers/specs/2026-09-06-bag-bean-selection-design.md`

## Global Constraints

- Only these `Bean` fields exist: `roaster, name, species, decaf, decafProcess, country, region, producer, variety, altitude, processing, notes, archived, createdAt, updatedAt, extras, id`. Only these `BeanBatch` fields exist: `beanId, roastDate, roastLevel, harvestDate, qualityScore, price, currency, weight, weightRemaining, buyDate, openDate, bestBeforeDate, freezeDate, unfreezeDate, frozen, archived, notes, createdAt, updatedAt, extras, id`. Never add a field outside these two lists.
- `DecaidWorkflowContext` gains exactly `beanBatchId`, `coffeeName`, `coffeeRoaster` — no other new context field (`grinderId`, `finalBeverageType`, etc. are out of scope).
- "Roaster" is not its own resource. There is no roaster CRUD endpoint; renaming a roaster means bulk-`updateBean`-ing every bean that shares that `roaster` string.
- `DELETE /beans/{id}` "Permanently deletes a bean and all its batches" — any delete-bean UI must say so before confirming.
- All UI strings are English (no i18n in this app).
- Follow existing conventions: `import type { ... }` for type-only imports (`verbatimModuleSyntax`), one flat `src/styles/index.css` (no CSS modules), Node test runner under `test/*.test.ts`, thin `client.ts` fetch wrappers are not unit-tested (matches every existing function there) — only pure logic gets unit tests.

---

### Task 1: Domain layer — `Bean`/`BeanBatch` pure logic

**Files:**
- Create: `src/domain/bag.ts`
- Modify: `src/domain/brewing.ts` (add `ActiveBag` type and `activeBag` field on `BrewingScreenModel`)
- Test: `test/bagDomain.test.ts`

**Interfaces:**
- Consumes: nothing (pure, self-contained; `Bean`/`BeanBatch` types come from Task 2's `api/decaid/types.ts`, imported here as `import type`)
- Produces (for later tasks): `daysSinceRoast(roastDate, now?)`, `bagFreshness(days)`, `groupBeansByRoaster(beans)`, `workflowContextForBag(bean, batch)`, `findExistingBean(beans, roaster, name)`, `upsertBean(beans, bean)`, `removeBean(beans, beanId)`, `upsertBatch(batches, batch)`, `removeBatchesForBean(batches, beanId)`, `removeBatch(batches, batchId)`; the `ActiveBag` type and `BrewingScreenModel.activeBag` field.

Task 2 doesn't exist yet, so this task defines minimal local type stubs it needs (`Bean`, `BeanBatch`) directly — Task 2 will re-point them at the real `api/decaid/types.ts` definitions (same shape, so no behavior changes, just an import swap noted at the end of Task 2).

- [ ] **Step 1: Write the failing tests**

Create `test/bagDomain.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test test/bagDomain.test.ts`
Expected: FAIL — `src/domain/bag.ts` does not exist yet (module not found).

- [ ] **Step 3: Write `src/domain/bag.ts`**

```ts
export interface Bean {
  id: string
  roaster: string
  name: string
  species?: string | null
  decaf: boolean
  decafProcess?: string | null
  country?: string | null
  region?: string | null
  producer?: string | null
  variety?: string[] | null
  altitude?: [number, number] | null
  processing?: string | null
  notes?: string | null
  archived: boolean
  createdAt: string
  updatedAt: string
  extras?: Record<string, unknown> | null
}

export interface BeanBatch {
  id: string
  beanId: string
  roastDate?: string | null
  roastLevel?: string | null
  harvestDate?: string | null
  qualityScore?: number | null
  price?: number | null
  currency?: string | null
  weight?: number | null
  weightRemaining?: number | null
  buyDate?: string | null
  openDate?: string | null
  bestBeforeDate?: string | null
  freezeDate?: string | null
  unfreezeDate?: string | null
  frozen: boolean
  archived: boolean
  notes?: string | null
  createdAt: string
  updatedAt: string
  extras?: Record<string, unknown> | null
}

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test test/bagDomain.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Add `ActiveBag` and `BrewingScreenModel.activeBag`**

In `src/domain/brewing.ts`, insert immediately before the `BrewingScreenModel` interface (currently at line 81):

```ts
export interface ActiveBag {
  beanBatchId: string
  coffeeName: string
  coffeeRoaster: string
}

```

Then change the `BrewingScreenModel` interface to add one field:

```ts
export interface BrewingScreenModel {
  readiness: MachineReadiness
  activeProfileId?: string
  activeBag?: ActiveBag | null
  utilities: MachineUtility[]
  profiles: BrewProfile[]
  previousShot: PreviousShot | null
}
```

- [ ] **Step 6: Run the full test suite and the type checker**

Run: `node --experimental-strip-types --test test/*.test.ts`
Expected: PASS, no regressions.
Run: `npx tsc -b --noEmit`
Expected: PASS, no errors. `activeBag` is optional, so no existing `BrewingScreenModel` object literal (including the one in `src/fixtures/brewingFixture.ts`, not touched until Task 5) needs to change for this to type-check.

- [ ] **Step 7: Commit**

```bash
git add src/domain/bag.ts src/domain/brewing.ts test/bagDomain.test.ts
git commit -m "$(cat <<'EOF'
feat: add Bean/BeanBatch domain types and pure bag logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 2: API layer — types and client functions

**Files:**
- Modify: `src/api/decaid/types.ts`
- Modify: `src/api/decaid/client.ts`
- Modify: `src/domain/bag.ts` (repoint `Bean`/`BeanBatch` to re-export from `api/decaid/types.ts` instead of defining them locally, so there is exactly one definition)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Bean`, `BeanBatch`, `CreateBeanInput`, `UpdateBeanInput`, `CreateBeanBatchInput`, `UpdateBeanBatchInput` (in `api/decaid/types.ts`); `getBeans`, `createBean`, `updateBean`, `deleteBean`, `getBeanBatches`, `createBeanBatch`, `getAllBeanBatches`, `updateBeanBatch`, `deleteBeanBatch` (in `api/decaid/client.ts`); `DecaidWorkflowContext` gains `beanBatchId?`, `coffeeName?`, `coffeeRoaster?`.

- [ ] **Step 1: Extend `DecaidWorkflowContext` and add `Bean`/`BeanBatch` types**

In `src/api/decaid/types.ts`, replace line 36:

```ts
export interface DecaidWorkflowContext { targetDoseWeight?: number | null; targetYield?: number | null; grinderSetting?: string | null }
```

with:

```ts
export interface DecaidWorkflowContext { targetDoseWeight?: number | null; targetYield?: number | null; grinderSetting?: string | null; beanBatchId?: string | null; coffeeName?: string | null; coffeeRoaster?: string | null }
```

Then append at the end of the file:

```ts

export interface Bean {
  id: string
  roaster: string
  name: string
  species?: string | null
  decaf: boolean
  decafProcess?: string | null
  country?: string | null
  region?: string | null
  producer?: string | null
  variety?: string[] | null
  altitude?: [number, number] | null
  processing?: string | null
  notes?: string | null
  archived: boolean
  createdAt: string
  updatedAt: string
  extras?: Record<string, unknown> | null
}
export type CreateBeanInput = Pick<Bean, 'roaster' | 'name'> & Partial<Pick<Bean, 'species' | 'decaf' | 'decafProcess' | 'country' | 'region' | 'producer' | 'variety' | 'altitude' | 'processing' | 'notes' | 'extras'>>
export type UpdateBeanInput = Partial<Omit<Bean, 'id' | 'createdAt' | 'updatedAt'>>

export interface BeanBatch {
  id: string
  beanId: string
  roastDate?: string | null
  roastLevel?: string | null
  harvestDate?: string | null
  qualityScore?: number | null
  price?: number | null
  currency?: string | null
  weight?: number | null
  weightRemaining?: number | null
  buyDate?: string | null
  openDate?: string | null
  bestBeforeDate?: string | null
  freezeDate?: string | null
  unfreezeDate?: string | null
  frozen: boolean
  archived: boolean
  notes?: string | null
  createdAt: string
  updatedAt: string
  extras?: Record<string, unknown> | null
}
export type CreateBeanBatchInput = Partial<Omit<BeanBatch, 'id' | 'beanId' | 'weightRemaining' | 'archived' | 'createdAt' | 'updatedAt'>>
export type UpdateBeanBatchInput = Partial<Omit<BeanBatch, 'id' | 'beanId' | 'createdAt' | 'updatedAt'>>
```

- [ ] **Step 2: Add client functions**

In `src/api/decaid/client.ts`, add `Bean, BeanBatch, CreateBeanBatchInput, CreateBeanInput, UpdateBeanBatchInput, UpdateBeanInput` to the existing type import on line 2 (alphabetical, matching the file's existing ordering), then insert the following block right after `updateWorkflow` (after line 95, before `updateProfileMetadata`):

```ts

export const getBeans = (includeArchived = false) => getJson<Bean[]>(`/beans${includeArchived ? '?includeArchived=true' : ''}`)

export async function createBean(input: CreateBeanInput) {
  const response = await fetch(`${getDecaidEndpoints().apiBase}/beans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(`Decaid bean creation returned ${response.status}: ${await response.text()}`)
  return await response.json() as Bean
}

export async function updateBean(id: string, patch: UpdateBeanInput) {
  const response = await fetch(`${getDecaidEndpoints().apiBase}/beans/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error(`Decaid bean update returned ${response.status}: ${await response.text()}`)
  return await response.json() as Bean
}

export async function deleteBean(id: string) {
  const response = await fetch(`${getDecaidEndpoints().apiBase}/beans/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Decaid bean deletion returned ${response.status}`)
}

export const getBeanBatches = (beanId: string, includeArchived = false) => getJson<BeanBatch[]>(`/beans/${encodeURIComponent(beanId)}/batches${includeArchived ? '?includeArchived=true' : ''}`)

export async function createBeanBatch(beanId: string, input: CreateBeanBatchInput) {
  const response = await fetch(`${getDecaidEndpoints().apiBase}/beans/${encodeURIComponent(beanId)}/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(`Decaid batch creation returned ${response.status}: ${await response.text()}`)
  return await response.json() as BeanBatch
}

export const getAllBeanBatches = (includeArchived = false) => getJson<BeanBatch[]>(`/bean-batches${includeArchived ? '?includeArchived=true' : ''}`)

export async function updateBeanBatch(id: string, patch: UpdateBeanBatchInput) {
  const response = await fetch(`${getDecaidEndpoints().apiBase}/bean-batches/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error(`Decaid batch update returned ${response.status}: ${await response.text()}`)
  return await response.json() as BeanBatch
}

export async function deleteBeanBatch(id: string) {
  const response = await fetch(`${getDecaidEndpoints().apiBase}/bean-batches/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Decaid batch deletion returned ${response.status}`)
}
```

No unit test for this step: every existing function in `client.ts` (`getWorkflow`, `updateWorkflow`, `createProfile`, `connectDevice`, ...) is an untested thin fetch wrapper — this repo verifies them by type-checking + manual/integration use, not unit tests. Stay consistent.

- [ ] **Step 3: Repoint `src/domain/bag.ts` to the canonical types**

Replace the `Bean` and `BeanBatch` interface definitions at the top of `src/domain/bag.ts` (added in Task 1, Step 3) with a re-export, so there is exactly one source of truth:

```ts
export type { Bean, BeanBatch } from '../api/decaid/types'
```

Delete the two `export interface Bean { ... }` / `export interface BeanBatch { ... }` blocks Task 1 added — everything else in `src/domain/bag.ts` (the `Bag` interface, `BagFreshness`, and all the functions) stays exactly as-is; they already only reference the field names, which are unchanged.

- [ ] **Step 4: Run the full test suite and the type checker**

Run: `node --experimental-strip-types --test test/*.test.ts`
Expected: PASS, no regressions (Task 1's tests import `Bean`/`BeanBatch` from `../src/domain/bag.ts`, which now re-exports the same shape — no test changes needed).
Run: `npx tsc -b --noEmit`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/api/decaid/types.ts src/api/decaid/client.ts src/domain/bag.ts
git commit -m "$(cat <<'EOF'
feat: add Bean/BeanBatch API types and decaid client functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 3: Wire `activeBag` into `applyWorkflow`

**Files:**
- Modify: `src/api/decaid/adapters.ts`
- Test: `test/activeBagFromContext.test.ts`

**Interfaces:**
- Consumes: `ActiveBag` (Task 1, `domain/brewing.ts`), `DecaidWorkflow`/`DecaidWorkflowContext` (Task 2, `api/decaid/types.ts`).
- Produces: `activeBagFromContext(context)`; `applyWorkflow(...)`'s return now includes `activeBag`, which every one of its 9 existing call sites in `useBrewingData.ts` picks up automatically.

- [ ] **Step 1: Write the failing test**

Create `test/activeBagFromContext.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test test/activeBagFromContext.test.ts`
Expected: FAIL — `activeBagFromContext` is not exported from `adapters.ts`.

- [ ] **Step 3: Implement `activeBagFromContext` and wire it into `applyWorkflow`**

In `src/api/decaid/adapters.ts`, change line 1's import to also bring in `ActiveBag`:

```ts
import type { ActiveBag, BrewProfile, BrewingScreenModel, PreviousShot, ProfileTargetPoint } from '../../domain/brewing'
```

Add `DecaidWorkflowContext` to the existing type import from `./types` (line 4):

```ts
import type { DecaidProfileRecord, DecaidProfileStep, DecaidWorkflow, DecaidWorkflowContext, FavoriteAssignments, ShotRecord } from './types'
```

Add this function right before `applyWorkflow` (before line 184):

```ts
export function activeBagFromContext(context: DecaidWorkflowContext | undefined): ActiveBag | null {
  const beanBatchId = context?.beanBatchId
  const coffeeName = context?.coffeeName
  const coffeeRoaster = context?.coffeeRoaster
  if (!beanBatchId || !coffeeName || !coffeeRoaster) return null
  return { beanBatchId, coffeeName, coffeeRoaster }
}

```

Then change `applyWorkflow`'s return statement (currently `return { ...model, profiles, activeProfileId: active?.id ?? profiles[0]?.id, utilities }`) to:

```ts
  return { ...model, profiles, activeProfileId: active?.id ?? profiles[0]?.id, activeBag: activeBagFromContext(workflow.context), utilities }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test test/activeBagFromContext.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `node --experimental-strip-types --test test/*.test.ts`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/api/decaid/adapters.ts test/activeBagFromContext.test.ts
git commit -m "$(cat <<'EOF'
feat: derive activeBag from the workflow context in applyWorkflow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 4: `selectBag` action in `useBrewingData`

**Files:**
- Modify: `src/features/brew/useBrewingData.ts`

**Interfaces:**
- Consumes: `updateWorkflow` (already imported), `applyWorkflow` (already imported), `workflowContextForBag` (Task 1, `domain/bag.ts`), `Bean`/`BeanBatch` (Task 1).
- Produces: `selectBag(bean: Bean, batch: BeanBatch): Promise<boolean>`, returned from the hook alongside `selectProfile`.

- [ ] **Step 1: Add the import**

Add to `src/features/brew/useBrewingData.ts`, alongside the existing `domain/brewing` type import (line 10), a new import for the domain bag helper (this is a value import, not type-only, since `workflowContextForBag` is a function):

```ts
import { workflowContextForBag } from '../../domain/bag'
import type { Bean, BeanBatch } from '../../domain/bag'
```

Place these two lines directly after line 11 (`import { brewingFixture, demoLiveBrewFixture } from '../../fixtures/brewingFixture'`).

- [ ] **Step 2: Add the `selectBag` function**

Insert immediately after the closing brace of `selectProfile` (after line 1338, before the blank line at 1339):

```ts

  const selectBag = async (bean: Bean, batch: BeanBatch) => {
    const context = workflowContextForBag(bean, batch)
    if (connection === 'fixture') {
      setModel((current) => ({ ...current, activeBag: context }))
      return true
    }
    if (connection !== 'connected') {
      showSettingFeedback({ status: 'error', message: 'Connect to Decaid before selecting a bag.' })
      return false
    }
    try {
      const workflow = await updateWorkflow({ context })
      setModel((current) => applyWorkflow(current, workflow, profileRecords.current, favoriteAssignments.current, retainedAdHocProfileId.current))
      return true
    } catch {
      showSettingFeedback({ status: 'error', message: 'That bag could not be selected.' })
      return false
    }
  }
```

- [ ] **Step 3: Expose it from the hook's return value**

In the final `return { ... }` statement (line 1419), add `selectBag` to the end of the object, right after `removeFavoriteProfile`:

```ts
  return { model, allProfiles, favoriteProfileIds, favoriteProfileSlots, liveBrew, utilityOperation, previousShotStatus, shotHistory, loadHistoryShot, heatingSeconds, connection, machineConnection, demoPullEnabled, scale, availableScales, scaleConnectPendingId, scaleTarePending, brewStopPending, brewSkipPending, cleaningStartPending, cleaningPreparedProfileId, sleepPending, sleepScreenActive, machineActionError, settingFeedback: settingFeedbackVisible ? settingFeedback : null, settingsDisabled, toggleSleep, wakeMachine, stopEspresso, skipBrewStage, startDemoBrew, prepareCleaningSequence, cancelCleaningSequence, dismissLiveBrew, searchForScale, connectToScale, dismissScalePicker, tareConnectedScale: () => requestScaleTare(false), updateMachineSetting, updateProfileSetting, profileRecordForEditing, saveProfileCopy, selectProfile, setFavoriteProfileSlot, removeFavoriteProfile, selectBag }
```

- [ ] **Step 4: Run the type checker**

Run: `npx tsc -b --noEmit`
Expected: PASS, no errors.

No unit test: `selectBag` mirrors `selectProfile` exactly, which itself has no direct test (it's exercised through the running app, per this repo's convention for stateful hook actions that call the network).

- [ ] **Step 5: Commit**

```bash
git add src/features/brew/useBrewingData.ts
git commit -m "$(cat <<'EOF'
feat: add selectBag action to useBrewingData

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 5: Fixture data

**Files:**
- Modify: `src/fixtures/brewingFixture.ts`

**Interfaces:**
- Consumes: `Bean`, `BeanBatch` (Task 1/2, `domain/bag.ts`).
- Produces: `bagFixture: { beans: Bean[]; batches: BeanBatch[] }`, exported for `useBagData` (Task 6) to seed its fixture-mode state; `brewingFixture.activeBag` set to one of them so the dashboard pill has something to show out of the box.

- [ ] **Step 1: Add the import**

Add to the top of `src/fixtures/brewingFixture.ts`:

```ts
import type { Bean, BeanBatch } from '../domain/bag'
```

- [ ] **Step 2: Add `bagFixture`**

Insert before the `export const brewingFixture: BrewingScreenModel = {` line (currently line 45):

```ts
const FIXTURE_ROAST_DATE = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()

export const bagFixture: { beans: Bean[]; batches: BeanBatch[] } = {
  beans: [
    { id: 'fixture-bean-1', roaster: 'Rüst & Ruh', name: 'Kenia Peaberry', species: 'arabica', decaf: false, country: 'Kenya', region: 'Nyeri', producer: null, variety: ['SL28', 'SL34'], altitude: [1750, 1950], processing: 'washed', notes: 'Blackcurrant, brown sugar, bright acidity.', archived: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'fixture-bean-2', roaster: 'Bonanza Coffee', name: 'Ethiopia Guji Washed', species: 'arabica', decaf: false, country: 'Ethiopia', region: 'Guji', producer: null, variety: ['Heirloom'], altitude: [1900, 2100], processing: 'washed', notes: null, archived: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ],
  batches: [
    { id: 'fixture-batch-1', beanId: 'fixture-bean-1', roastDate: FIXTURE_ROAST_DATE, roastLevel: 'medium-light', harvestDate: null, qualityScore: 87.5, price: 16.5, currency: 'EUR', weight: 250, weightRemaining: 180, buyDate: null, openDate: null, bestBeforeDate: null, freezeDate: null, unfreezeDate: null, frozen: false, archived: false, notes: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'fixture-batch-2', beanId: 'fixture-bean-2', roastDate: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(), roastLevel: 'light', harvestDate: null, qualityScore: null, price: null, currency: null, weight: 250, weightRemaining: 250, buyDate: null, openDate: null, bestBeforeDate: null, freezeDate: null, unfreezeDate: null, frozen: false, archived: false, notes: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ],
}
```

- [ ] **Step 3: Set `brewingFixture.activeBag`**

In the `brewingFixture` object literal, add `activeBag` right after `activeProfileId: 'adaptive-v2',` (currently line 47):

```ts
  activeBag: { beanBatchId: 'fixture-batch-1', coffeeName: 'Kenia Peaberry', coffeeRoaster: 'Rüst & Ruh' },
```

- [ ] **Step 4: Run the type checker and full test suite**

Run: `npx tsc -b --noEmit`
Expected: PASS, no errors anywhere in the project.
Run: `node --experimental-strip-types --test test/*.test.ts`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/fixtures/brewingFixture.ts
git commit -m "$(cat <<'EOF'
feat: add sample beans/batches to the brewing fixture

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 6: `useBagData` hook

**Files:**
- Create: `src/features/bag/useBagData.ts`

**Interfaces:**
- Consumes: `getBeans, createBean, updateBean, deleteBean, getAllBeanBatches, createBeanBatch, updateBeanBatch, deleteBeanBatch` (Task 2, `api/decaid/client`); `upsertBean, removeBean, removeBatchesForBean, upsertBatch, removeBatch` (Task 1, `domain/bag`); `bagFixture` (Task 5, `fixtures/brewingFixture`); `Bean, BeanBatch, CreateBeanInput, UpdateBeanInput, CreateBeanBatchInput, UpdateBeanBatchInput` (Task 2, `api/decaid/types`); a `DataConnection` value from the caller (the same `connection` `useBrewingData` already exposes).
- Produces (for the UI tasks): `useBagData(connection: DataConnection)` returning `{ beans, batches, loading, error, createBeanAndBatch(input: CreateBeanInput, batchInput: CreateBeanBatchInput), updateBeanFields(id, patch: UpdateBeanInput), updateBatchFields(id, patch: UpdateBeanBatchInput), deleteBeanAndBatches(id), deleteSingleBatch(id), renameRoaster(oldRoaster, newRoaster) }`.

No unit test for this task: it is a thin React-state wrapper around already-tested pure functions (Task 1) and already-untested client calls (Task 2), exactly like `useBrewingData` itself has no direct test. Its logic is exercised through the pure functions' tests plus manual verification in the running app (Task 11).

- [ ] **Step 1: Write `src/features/bag/useBagData.ts`**

```ts
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
    if (connection !== 'connected' || loadedForConnection.current === connection) return
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
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/bag/useBagData.ts
git commit -m "$(cat <<'EOF'
feat: add useBagData hook for bean/batch CRUD

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 7: `BagBar` dashboard pill

**Files:**
- Create: `src/features/bag/BagBar.tsx`
- Modify: `src/features/brew/BrewingPanel.tsx`
- Modify: `src/styles/index.css`

**Interfaces:**
- Consumes: `ActiveBag` (Task 1, `domain/brewing`), `daysSinceRoast`, `bagFreshness` (Task 1, `domain/bag`).
- Produces: `<BagBar activeBag={... } onOpen={...} />`; `BrewingPanel` gains an `onOpenBagPicker: () => void` prop and an `activeBag?: ActiveBag | null` prop.

- [ ] **Step 1: Write `src/features/bag/BagBar.tsx`**

```tsx
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
```

`daysSinceRoast`/`bagFreshness` are wired for the freshness-colored icon ring added in Step 3's CSS; the actual day count and its text ("4 days off roast") are added in Task 8 once the picker has the full `Bag` (bean+batch) to read `roastDate` from — `BagBar` itself only receives `ActiveBag` (the denormalized `beanBatchId/coffeeName/coffeeRoaster` triple on the live workflow), which has no `roastDate`. Leave the `daysSinceRoast(null)` call as a harmless placeholder computing `null` for now; do not add a `roastDate` field to `ActiveBag` — that would violate the "only linked fields on the workflow context" constraint.

- [ ] **Step 2: Wire `BagBar` into `BrewingPanel`**

In `src/features/brew/BrewingPanel.tsx`, add the import (after the existing `ProfileTargetChart` import):

```ts
import { BagBar } from '../bag/BagBar'
```

Add `import type { ActiveBag } from '../../domain/brewing'` is unnecessary since `ActiveBag` already ships via the existing `import type { BrewProfile, EditableProfileSetting } from '../../domain/brewing'` line — change that line to:

```ts
import type { ActiveBag, BrewProfile, EditableProfileSetting } from '../../domain/brewing'
```

Add `activeBag` and `onOpenBagPicker` to the component's prop destructuring (currently `export function BrewingPanel({ profiles, activeProfileId, settingsDisabled, demoMode = false, onUpdateProfile, onSelectProfile, onStartDemoBrew, onManageProfiles }: { ... })`):

```ts
export function BrewingPanel({ profiles, activeProfileId, activeBag, settingsDisabled, demoMode = false, onUpdateProfile, onSelectProfile, onStartDemoBrew, onManageProfiles, onOpenBagPicker }: { profiles: BrewProfile[]; activeProfileId?: string; activeBag?: ActiveBag | null; settingsDisabled?: boolean; demoMode?: boolean; onUpdateProfile: (profileId: string, setting: EditableProfileSetting, value: number) => void; onSelectProfile: (profileId: string) => Promise<boolean>; onStartDemoBrew?: (profileId: string) => void; onManageProfiles: () => void; onOpenBagPicker: () => void }) {
```

Insert `<BagBar activeBag={activeBag} onOpen={onOpenBagPicker} />` right after the `manage-profiles` button and before the `brew-metrics` div (currently line 183-184):

```tsx
    <button className="manage-profiles" type="button" onClick={onManageProfiles}>See all profiles →</button>
    <BagBar activeBag={activeBag} onOpen={onOpenBagPicker} />
    <div className="brew-metrics" aria-live="polite">
```

- [ ] **Step 3: Add CSS**

Append to `src/styles/index.css`:

```css
.bag-bar { width: 100%; height: 52px; margin: 0 0 16px; padding: 0 8px 0 12px; border: 0; border-radius: 26px; background: rgba(255,255,255,.06); display: flex; align-items: center; gap: 12px; color: inherit; font: inherit; cursor: pointer; }
.bag-bar:hover { background: rgba(255,255,255,.09); }
.bag-bar--empty { color: #878787; }
.bag-bar__icon { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.06); display: flex; align-items: center; justify-content: center; flex: none; }
.bag-bar__icon--fresh { background: rgba(61,192,120,.16); }
.bag-bar__icon--ok { background: rgba(216,184,77,.16); }
.bag-bar__icon--stale { background: rgba(222,97,97,.16); }
.bag-bar__text { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; overflow: hidden; white-space: nowrap; }
.bag-bar__label { color: #878787; font-size: 10px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
.bag-bar__value { color: #fff; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.bag-bar__sep { color: #5a5a5a; }
.bag-bar__meta { color: #a9a9a9; font-size: 13px; font-weight: 500; }
.bag-bar__chevron { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.06); display: flex; align-items: center; justify-content: center; flex: none; }
```

- [ ] **Step 4: Update `AppShell.tsx`'s `BrewingPanel` usage so the build still compiles**

`BrewingPanel` now requires `onOpenBagPicker`. `AppShell.tsx` doesn't have that callback yet — Task 11 adds it properly. For this task only, pass a temporary no-op so the app keeps compiling and running in isolation: in `src/app/AppShell.tsx`, change the `<BrewingPanel .../>` element (currently `<BrewingPanel profiles={model.profiles} activeProfileId={model.activeProfileId} settingsDisabled={settingsDisabled} demoMode={demoPullEnabled} onUpdateProfile={onUpdateProfileSetting} onSelectProfile={onSelectProfile} onStartDemoBrew={onStartDemoBrew} onManageProfiles={onManageProfiles} />`) to:

```tsx
<BrewingPanel profiles={model.profiles} activeProfileId={model.activeProfileId} activeBag={model.activeBag} settingsDisabled={settingsDisabled} demoMode={demoPullEnabled} onUpdateProfile={onUpdateProfileSetting} onSelectProfile={onSelectProfile} onStartDemoBrew={onStartDemoBrew} onManageProfiles={onManageProfiles} onOpenBagPicker={() => {}} />
```

- [ ] **Step 5: Run the type checker, then the app**

Run: `npx tsc -b --noEmit`
Expected: PASS.
Run: `npm run dev`, open the app. Expected: the dashboard shows a "Bag" pill under "See all profiles →" reading "Rüst & Ruh · Kenia Peaberry" (from the fixture); clicking it does nothing yet (Task 11 wires the picker). Stop the dev server after checking.

- [ ] **Step 6: Commit**

```bash
git add src/features/bag/BagBar.tsx src/features/brew/BrewingPanel.tsx src/app/AppShell.tsx src/styles/index.css
git commit -m "$(cat <<'EOF'
feat: show the active bag as a pill in the brew panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 8: `BagPicker` overlay

**Files:**
- Create: `src/features/bag/BagPicker.tsx`
- Modify: `src/features/bag/BagBar.tsx` (pass full freshness info once the picker has real `Bag` data — see Step 1)
- Modify: `src/styles/index.css`

**Interfaces:**
- Consumes: `Bag`, `bagFreshness`, `daysSinceRoast`, `groupBeansByRoaster` (Task 1, `domain/bag`); `beans`, `batches` from `useBagData` (Task 6).
- Produces: `<BagPicker bags={Bag[]} activeBeanBatchId={string | undefined} onSelect={(bag: Bag) => void} onAddNew={() => void} onManageBeans={() => void} onDismiss={() => void} />`.

- [ ] **Step 1: Add a `roastDate`-aware freshness line to `BagBar`**

Now that a joined `Bag` (bean+batch) is available elsewhere, keep `BagBar` itself simple and correct: it only ever receives the workflow's `ActiveBag` (no `roastDate`), so its freshness ring uses the neutral/unknown state until Task 11 threads the actual matching `Bag` through. In `src/features/bag/BagBar.tsx`, replace the `const days = daysSinceRoast(null)` line with a comment-free direct use of an optional `roastDate` prop:

Change the prop signature to accept an optional matching bag:

```tsx
export function BagBar({ activeBag, activeBagRoastDate, onOpen }: { activeBag?: ActiveBag | null; activeBagRoastDate?: string | null; onOpen: () => void }) {
```

And replace:

```ts
  const days = daysSinceRoast(null)
  const freshness = bagFreshness(days)
```

with:

```ts
  const days = daysSinceRoast(activeBagRoastDate)
  const freshness = bagFreshness(days)
```

And add the day count to the visible text — replace the `<span className="bag-bar__value">{activeBag.coffeeName}</span>` line with:

```tsx
      <span className="bag-bar__value">{activeBag.coffeeName}</span>
      {days !== null && <><span className="bag-bar__sep">·</span><span className="bag-bar__meta">{days === 0 ? 'Roasted today' : `${days}d off roast`}</span></>}
```

- [ ] **Step 2: Write `src/features/bag/BagPicker.tsx`**

```tsx
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
```

- [ ] **Step 3: Add CSS**

Append to `src/styles/index.css`:

```css
.bag-picker-overlay { position: fixed; inset: 0; z-index: 700; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.7); }
.bag-picker { width: min(800px, calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow: hidden; border-radius: 24px; color: #fff; background: rgba(77,66,66,.95); box-shadow: 0 24px 70px rgba(0,0,0,.45); display: grid; grid-template-rows: auto 1fr; }
.bag-picker__header { padding: 20px 26px 16px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.bag-picker__header h2 { margin: 0; font-size: 24px; font-weight: 600; }
.bag-picker__header p { margin: 6px 0 0; color: #dcdcdc; font-size: 14px; }
.bag-picker__manage-link { display: block; margin-top: 10px; padding: 0; border: 0; background: none; color: #53d68e; font-size: 13px; font-weight: 600; cursor: pointer; }
.bag-picker__close { width: 40px; height: 40px; flex: none; border: 0; border-radius: 50%; background: rgba(89,84,80,.7); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.bag-picker__grid { background: #30292a; padding: 22px 26px 26px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; align-content: start; overflow: auto; }
.bag-card { position: relative; height: 150px; padding: 18px; border: 2px solid transparent; border-radius: 20px; background: rgba(77,66,66,.5); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.bag-card--selected { border-color: #3dc078; background: rgba(77,66,66,.7); }
.bag-card strong { display: block; margin-top: 28px; color: #fff; font-size: 16px; font-weight: 600; }
.bag-card__bean { display: block; margin-top: 4px; color: #b7b7b7; font-size: 13px; }
.bag-card__badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.bag-card__badge--fresh { color: #3dc078; background: rgba(61,192,120,.16); }
.bag-card__badge--ok { color: #d8b84d; background: rgba(216,184,77,.16); }
.bag-card__badge--stale { color: #de6161; background: rgba(222,97,97,.16); }
.bag-card__badge--unknown { color: #a9a9a9; background: rgba(255,255,255,.08); }
.bag-card--add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; border: 2px dashed rgba(255,255,255,.18); background: transparent; color: #9a9a9a; }
.bag-card--add strong { margin: 0; color: #cfcfcf; font-size: 14px; }
.bag-card__add-icon { width: 40px; height: 40px; border-radius: 50%; background: rgba(89,84,80,.6); display: flex; align-items: center; justify-content: center; }
.bag-picker__empty { grid-column: 1/-1; margin: 24px 0; text-align: center; color: #a9a9a9; font-size: 14px; }
```

- [ ] **Step 4: Run the type checker**

Run: `npx tsc -b --noEmit`
Expected: PASS. (`BagPicker` isn't mounted anywhere yet — Task 11 does that — so this only checks the file compiles on its own.)

- [ ] **Step 5: Commit**

```bash
git add src/features/bag/BagBar.tsx src/features/bag/BagPicker.tsx src/styles/index.css
git commit -m "$(cat <<'EOF'
feat: add BagPicker overlay and roast-freshness display on the pill

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 9: `BagForm` (create/edit)

**Files:**
- Create: `src/features/bag/BagForm.tsx`
- Modify: `src/styles/index.css`

**Interfaces:**
- Consumes: `Bean`, `BeanBatch`, `Bag` (Task 1, `domain/bag`); `CreateBeanInput`, `CreateBeanBatchInput`, `UpdateBeanInput`, `UpdateBeanBatchInput` (Task 2, `api/decaid/types`).
- Produces: `<BagForm existing={Bag | null} existingRoasters={string[]} existingBeanNamesForRoaster={(roaster: string) => string[]} onSave={(beanInput, beanPatch, batchInput, batchPatch) => Promise<void>} onCancel={() => void} />` — full field set from the spec, nothing else. The exact save-callback shape is deliberately asymmetric (both a `*Input` for create and a `*Patch` for update) so the caller (Task 11) decides create vs. update without `BagForm` needing to know about `useBagData`.

- [ ] **Step 1: Write `src/features/bag/BagForm.tsx`**

```tsx
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
```

- [ ] **Step 2: Add CSS**

Append to `src/styles/index.css`:

```css
.bag-form-overlay { position: fixed; inset: 0; z-index: 800; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.7); }
.bag-form { width: min(680px, calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow: hidden; border-radius: 24px; color: #fff; background: rgba(77,66,66,.95); box-shadow: 0 24px 70px rgba(0,0,0,.45); display: grid; grid-template-rows: auto 1fr; }
.bag-form__header { padding: 20px 26px; display: flex; align-items: center; justify-content: space-between; }
.bag-form__header h2 { margin: 0; font-size: 22px; font-weight: 600; }
.bag-form__actions { display: flex; gap: 12px; }
.bag-form__body { background: #30292a; padding: 22px 26px 26px; overflow: auto; display: grid; gap: 18px; }
.bag-form__card { border-radius: 20px; background: rgba(0,0,0,.35); padding: 20px 22px; display: grid; gap: 14px; }
.bag-form__card-title { margin: 0; color: #fff; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.bag-form__grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.bag-form__field { display: grid; gap: 6px; }
.bag-form__field span { color: #a9a9a9; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
.bag-form__field input[type="text"], .bag-form__field input[type="number"], .bag-form__field input[type="date"] { height: 44px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(89,84,80,.4); color: #fff; font-size: 14px; }
.bag-form__field textarea { min-height: 72px; padding: 10px 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(89,84,80,.4); color: #fff; font-family: inherit; font-size: 13px; resize: none; }
.bag-form__field--toggle { flex-direction: row; align-items: center; display: flex; gap: 10px; }
.bag-form__field--toggle input { width: 20px; height: 20px; }
.btn { height: 46px; padding: 0 22px; border: 0; border-radius: 23px; font-size: 14px; font-weight: 700; cursor: pointer; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn--ghost { background: rgba(105,101,98,.72); color: #d8d8d8; }
.btn--primary { background: #3dc078; color: #10261a; }
```

- [ ] **Step 4: Run the type checker**

Run: `npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/bag/BagForm.tsx src/styles/index.css
git commit -m "$(cat <<'EOF'
feat: add BagForm with the full Bean/BeanBatch field set

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 10: `BeanManager` full-screen list

**Files:**
- Create: `src/features/bag/BeanManager.tsx`
- Modify: `src/styles/index.css`

**Interfaces:**
- Consumes: `groupBeansByRoaster` (Task 1, `domain/bag`); `Bean`, `BeanBatch` (Task 1).
- Produces: `<BeanManager beans={Bean[]} batches={BeanBatch[]} onEditBag={(bean: Bean, batch: BeanBatch) => void} onDeleteBean={(bean: Bean) => void} onRenameRoaster={(oldRoaster: string, newRoaster: string) => void} onAddBag={() => void} onClose={() => void} />`.

- [ ] **Step 1: Write `src/features/bag/BeanManager.tsx`**

```tsx
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
```

- [ ] **Step 2: Add CSS**

Append to `src/styles/index.css`:

```css
.bean-manager { width: min(1194px, 100%); margin: 0 auto; padding: 28px 32px 60px 40px; min-height: 100vh; background: radial-gradient(circle at 16% 16%, #060707 0, #141414 22%, transparent 50%), linear-gradient(124deg, #181818 36%, #4d4038 100%); color: #707070; }
.bean-manager__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.bean-manager__header-left { display: flex; align-items: center; gap: 16px; }
.bean-manager__back { width: 48px; height: 48px; flex: none; border: 0; border-radius: 50%; background: rgba(89,84,80,.5); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.bean-manager__header h1 { margin: 0; color: #fff; font-size: 26px; font-weight: 600; }
.bean-manager__header p { margin: 4px 0 0; color: #878787; font-size: 13px; }
.bean-manager__add { height: 48px; padding: 0 20px; border: 1px solid rgba(61,192,120,.5); border-radius: 24px; background: rgba(61,192,120,.14); color: #53d68e; font-size: 14px; font-weight: 700; cursor: pointer; }
.bean-manager__group { margin-bottom: 18px; }
.bean-manager__group-head { display: flex; align-items: center; gap: 8px; margin: 0 0 10px 4px; }
.bean-manager__group-title { margin: 0; color: #878787; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.bean-manager__rename-input { height: 24px; padding: 0 6px; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; background: rgba(0,0,0,.4); color: #fff; font-size: 12px; }
.bean-manager__rename-btn { width: 22px; height: 22px; flex: none; border: 0; border-radius: 50%; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.bean-manager__rename-btn:hover { background: rgba(255,255,255,.16); }
.bean-manager__list { border-radius: 24px; background: rgba(0,0,0,.5); overflow: hidden; }
.bean-manager__row { display: flex; align-items: center; gap: 18px; padding: 16px 26px; border-bottom: 1px solid rgba(255,255,255,.06); }
.bean-manager__row:last-child { border-bottom: 0; }
.bean-manager__row-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 14px; }
.bean-manager__row-main strong { color: #fff; font-size: 15px; font-weight: 600; }
.bean-manager__origin { color: #878787; font-size: 13px; }
.bean-manager__chip { padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; background: rgba(89,84,80,.5); color: #cfcfcf; }
.bean-manager__row-actions { display: flex; gap: 10px; }
.bean-manager__icon-btn { width: 40px; height: 40px; flex: none; border: 0; border-radius: 50%; background: rgba(89,84,80,.55); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.bean-manager__icon-btn--danger:hover { background: rgba(222,97,97,.25); }
.bean-manager__empty { color: #878787; font-size: 14px; }
```

- [ ] **Step 3: Run the type checker**

Run: `npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/bag/BeanManager.tsx src/styles/index.css
git commit -m "$(cat <<'EOF'
feat: add BeanManager screen grouped by roaster

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```

---

### Task 11: Wire it all together

**Files:**
- Modify: `src/app/AppShell.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/brew/BrewingPanel.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: a working end-to-end feature — this task has no new exported interface; its "deliverable" is the running app.

The bag list (`useBagData`) is owned by `App.tsx` alone — never called inside `AppShell` — because both `AppShell` (picker/form) and `BeanManager` (a sibling top-level screen) must see the same list. `AppShell` receives it, and the "edit/new bag" target, purely as props; it keeps only the picker's open/closed boolean as local state (the same shape as `cleaningPickerOpen`).

- [ ] **Step 1: Add the `activeBagRoastDate` prop to `BrewingPanel`**

In `src/features/brew/BrewingPanel.tsx`, change the `ActiveBag` type import (added in Task 7, Step 2) and the prop destructuring to add `activeBagRoastDate`:

```ts
export function BrewingPanel({ profiles, activeProfileId, activeBag, activeBagRoastDate, settingsDisabled, demoMode = false, onUpdateProfile, onSelectProfile, onStartDemoBrew, onManageProfiles, onOpenBagPicker }: { profiles: BrewProfile[]; activeProfileId?: string; activeBag?: ActiveBag | null; activeBagRoastDate?: string | null; settingsDisabled?: boolean; demoMode?: boolean; onUpdateProfile: (profileId: string, setting: EditableProfileSetting, value: number) => void; onSelectProfile: (profileId: string) => Promise<boolean>; onStartDemoBrew?: (profileId: string) => void; onManageProfiles: () => void; onOpenBagPicker: () => void }) {
```

Change the `<BagBar .../>` element (added in Task 7, Step 2) to:

```tsx
<BagBar activeBag={activeBag} activeBagRoastDate={activeBagRoastDate} onOpen={onOpenBagPicker} />
```

- [ ] **Step 2: Add bag props to `AppShellProps` and local picker state**

In `src/app/AppShell.tsx`, add these imports alongside the existing feature imports:

```ts
import { BagForm } from '../features/bag/BagForm'
import { BagPicker } from '../features/bag/BagPicker'
```

Add `import type { Bag, Bean, BeanBatch } from '../domain/bag'` as its own line, next to the existing `import type { ... } from '../domain/brewing'` block.

In `AppShellProps`, add these fields next to `onManageProfiles: () => void`:

```ts
  bags: Bag[]
  bagEditTarget: { bean: Bean; batch: BeanBatch } | 'new' | null
  existingRoasters: string[]
  existingBeanNamesForRoaster: (roaster: string) => string[]
  selectBag: (bean: Bean, batch: BeanBatch) => Promise<boolean>
  createBagAndSelect: (beanInput: import('../api/decaid/types').CreateBeanInput, batchInput: import('../api/decaid/types').CreateBeanBatchInput) => Promise<void>
  updateBagAndSelect: (beanId: string, beanPatch: import('../api/decaid/types').UpdateBeanInput, batchId: string, batchPatch: import('../api/decaid/types').UpdateBeanBatchInput) => Promise<void>
  onClearBagEditTarget: () => void
  onRequestNewBag: () => void
  onManageBeans: () => void
```

(the two inline `import('../api/decaid/types')` types are only used here to avoid a fourth near-duplicate type-only import block — leave them inline exactly as written; do not add a separate `import type` line for them.)

Add these to the component's destructured parameters, next to `onManageProfiles`:

```ts
bags, bagEditTarget, existingRoasters, existingBeanNamesForRoaster, selectBag, createBagAndSelect, updateBagAndSelect, onClearBagEditTarget, onRequestNewBag, onManageBeans,
```

Inside the function body, after the existing `const [cleaningPickerOpen, setCleaningPickerOpen] = useState(false)` line, add:

```ts
  const [bagPickerOpen, setBagPickerOpen] = useState(false)
  const bagFormOpen = bagEditTarget !== null
  const editingBag = bagEditTarget !== null && bagEditTarget !== 'new' ? bagEditTarget : null
  const activeBagEntry = bags.find((bag) => bag.batch.id === model.activeBag?.beanBatchId)
```

- [ ] **Step 3: Pass the new `BrewingPanel` props**

Change the `<BrewingPanel .../>` element — after Task 7, Step 4 it reads `<BrewingPanel profiles={model.profiles} activeProfileId={model.activeProfileId} activeBag={model.activeBag} settingsDisabled={settingsDisabled} demoMode={demoPullEnabled} onUpdateProfile={onUpdateProfileSetting} onSelectProfile={onSelectProfile} onStartDemoBrew={onStartDemoBrew} onManageProfiles={onManageProfiles} onOpenBagPicker={() => {}} />` — to:

```tsx
<BrewingPanel profiles={model.profiles} activeProfileId={model.activeProfileId} activeBag={model.activeBag} activeBagRoastDate={activeBagEntry?.batch.roastDate} settingsDisabled={settingsDisabled} demoMode={demoPullEnabled} onUpdateProfile={onUpdateProfileSetting} onSelectProfile={onSelectProfile} onStartDemoBrew={onStartDemoBrew} onManageProfiles={onManageProfiles} onOpenBagPicker={() => setBagPickerOpen(true)} />
```

- [ ] **Step 4: Render the picker and form overlays**

After the existing `{cleaningPickerOpen && <CleaningSequencePicker .../>}` line, add:

```tsx
    {bagPickerOpen && <BagPicker bags={bags} activeBeanBatchId={model.activeBag?.beanBatchId} onSelect={(bag) => { void selectBag(bag.bean, bag.batch).then((success) => { if (success) setBagPickerOpen(false) }) }} onAddNew={() => { setBagPickerOpen(false); onRequestNewBag() }} onManageBeans={() => { setBagPickerOpen(false); onManageBeans() }} onDismiss={() => setBagPickerOpen(false)} />}
    {bagFormOpen && <BagForm existing={editingBag} existingRoasters={existingRoasters} existingBeanNamesForRoaster={existingBeanNamesForRoaster} onCancel={onClearBagEditTarget} onSave={async (beanInput, beanPatch, batchInput, batchPatch) => {
      if (editingBag) await updateBagAndSelect(editingBag.bean.id, beanPatch, editingBag.batch.id, batchPatch)
      else await createBagAndSelect(beanInput, batchInput)
      onClearBagEditTarget()
    }} />}
```

- [ ] **Step 5: Own the bag data and routing in `App.tsx`**

In `src/App.tsx`, add to the imports:

```ts
import { BeanManager } from './features/bag/BeanManager'
import { useBagData } from './features/bag/useBagData'
import type { Bean, BeanBatch } from './domain/bag'
```

Change `type AppPage = 'home' | 'profiles' | 'previous-pull'` to:

```ts
type AppPage = 'home' | 'profiles' | 'previous-pull' | 'beans'
```

Change `currentPage`'s validity check to:

```ts
const currentPage = (): AppPage => {
  const page = new URLSearchParams(window.location.search).get('page')
  return page === 'profiles' || page === 'previous-pull' || page === 'beans' ? page : 'home'
}
```

Inside `App()`, right after `const data = useBrewingData()`, add:

```ts
  const bagData = useBagData(data.connection)
  const [bagEditTarget, setBagEditTarget] = useState<{ bean: Bean; batch: BeanBatch } | 'new' | null>(null)
  const bags = bagData.beans.flatMap((bean) => bagData.batches.filter((batch) => batch.beanId === bean.id).map((batch) => ({ bean, batch })))
  const existingRoasters = [...new Set(bagData.beans.map((bean) => bean.roaster))]
  const existingBeanNamesForRoaster = (roaster: string) => bagData.beans.filter((bean) => bean.roaster === roaster).map((bean) => bean.name)
  const createBagAndSelect = async (beanInput: Parameters<typeof bagData.createBeanAndBatch>[0], batchInput: Parameters<typeof bagData.createBeanAndBatch>[1]) => {
    const { bean, batch } = await bagData.createBeanAndBatch(beanInput, batchInput)
    await data.selectBag(bean, batch)
  }
  const updateBagAndSelect = async (beanId: string, beanPatch: Parameters<typeof bagData.updateBeanFields>[1], batchId: string, batchPatch: Parameters<typeof bagData.updateBatchFields>[1]) => {
    const bean = await bagData.updateBeanFields(beanId, beanPatch)
    const batch = await bagData.updateBatchFields(batchId, batchPatch)
    await data.selectBag(bean, batch)
  }
```

Add a `beans` branch to the `if/else if/else` chain that builds `screen`, right before the final `else`:

```tsx
  else if (page === 'beans') screen = <BeanManager beans={bagData.beans} batches={bagData.batches} onEditBag={(bean, batch) => { setBagEditTarget({ bean, batch }); navigate('home') }} onDeleteBean={(bean) => { if (window.confirm(`Delete "${bean.name}" and all its bags? This can't be undone.`)) void bagData.deleteBeanAndBatches(bean.id) }} onRenameRoaster={(oldRoaster, newRoaster) => void bagData.renameRoaster(oldRoaster, newRoaster)} onAddBag={() => { setBagEditTarget('new'); navigate('home') }} onClose={() => navigate('home')} />
```

- [ ] **Step 6: Pass the bag props to `AppShell`**

Change the existing `<AppShell {...data} ... />` element's prop list (it currently ends `... onManageProfiles={() => navigate('profiles')} onOpenPreviousShot={() => navigate('previous-pull')} />`) to add the new props before the closing `/>`:

```tsx
<AppShell {...data} onSleep={data.toggleSleep} onWake={data.wakeMachine} onStopEspresso={data.stopEspresso} onSkipBrewStage={data.skipBrewStage} onStartDemoBrew={data.startDemoBrew} onPrepareCleaning={data.prepareCleaningSequence} onCancelCleaning={data.cancelCleaningSequence} onDismissLiveBrew={data.dismissLiveBrew} onSearchScale={data.searchForScale} onConnectScale={data.connectToScale} onDismissScalePicker={data.dismissScalePicker} onTareScale={data.tareConnectedScale} onUpdateMachineSetting={data.updateMachineSetting} onUpdateProfileSetting={data.updateProfileSetting} onSelectProfile={data.selectProfile} onOpenSettings={() => window.location.assign(getDecaidSettingsUrl())} onManageProfiles={() => navigate('profiles')} onOpenPreviousShot={() => navigate('previous-pull')} bags={bags} bagEditTarget={bagEditTarget} existingRoasters={existingRoasters} existingBeanNamesForRoaster={existingBeanNamesForRoaster} selectBag={data.selectBag} createBagAndSelect={createBagAndSelect} updateBagAndSelect={updateBagAndSelect} onClearBagEditTarget={() => setBagEditTarget(null)} onRequestNewBag={() => setBagEditTarget('new')} onManageBeans={() => navigate('beans')} />
```

- [ ] **Step 7: Type-check and manually verify the full flow**

Run: `npx tsc -b --noEmit`
Expected: PASS. If it isn't, the most likely mismatch is a prop name between `AppShellProps` (Step 2), the `<AppShell .../>` call site (Step 6), and where each prop is read inside `AppShell`'s body (Steps 2–4) — re-read all three against each other before moving on.

Run: `npm run dev` and manually walk through, in the fixture connection (default, no real machine):
1. Dashboard shows the "Rüst & Ruh · Kenia Peaberry" bag pill with a freshness badge.
2. Click the pill → picker opens with 2 fixture bags, the active one marked selected.
3. Select the other bag → picker closes, pill updates to "Bonanza Coffee · Ethiopia Guji Washed".
4. Reopen the picker, click "New bag" → full form opens; fill in Roaster + Bean name (required) and Save → picker/form close, pill shows the new bag.
5. Click "Manage beans & roasters" from the picker → full-screen list grouped by roaster; click the rename icon on a group, type a new name, blur → all beans in that group now show the new roaster.
6. Click delete on a bean → confirm dialog mentions its bags are deleted too; confirm → bean and its batches disappear from the list.
7. From the list, click edit on a bag → navigates home with the form open, pre-filled; change a field, Save → pill reflects the change.
8. Click back → returns to the dashboard.

Stop the dev server once all eight checks pass. Fix any wiring issue before committing.

- [ ] **Step 8: Run the full test suite one more time**

Run: `node --experimental-strip-types --test test/*.test.ts`
Expected: PASS, no regressions anywhere.

- [ ] **Step 9: Commit**

```bash
git add src/app/AppShell.tsx src/App.tsx src/features/brew/BrewingPanel.tsx
git commit -m "$(cat <<'EOF'
feat: wire the bag picker, form, and manager into the app shell

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvxtT9DwjDBedaYxDegzGb
EOF
)"
```
