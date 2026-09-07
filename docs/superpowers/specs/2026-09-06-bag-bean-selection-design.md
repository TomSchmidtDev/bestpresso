# Bag / Bean / Roaster selection — design

Date: 2026-09-06
Status: approved for planning

## Purpose

Let a user pick which coffee (roaster + bean + specific bag/roast) is behind
the shot they're about to pull, directly from the bestpresso dashboard —
mirroring what the Decenza app calls a "Bag" and what the community DYE2
plugin already models against the same decaid backend bestpresso talks to.

## Verified backend contract

bestpresso does not persist any bean data today (`ShotRecord` /
`DecaidWorkflow` in `src/api/decaid/types.ts` carry only profile/machine
values). The decaid backend itself, however, already exposes a real,
documented REST resource for this — verified against
`decentespresso/dye2` (`rea_restapi.yml`, `KV_CONTRACT.md`,
`dye2-plugin/src/pages/add-bean.ts`) on 2026-09-06. This spec adds no field
that isn't in that contract.

### `Bean` — identity (roaster + bean), `/api/v1/beans`

| field | type | notes |
|---|---|---|
| id | string | UUID, server-assigned |
| roaster | string | required |
| name | string | required |
| species | string \| null | e.g. "arabica" |
| decaf | boolean | default false |
| decafProcess | string \| null | |
| country | string \| null | |
| region | string \| null | |
| producer | string \| null | |
| variety | string[] \| null | |
| altitude | [number, number] \| null | [min, max] metres |
| processing | string \| null | e.g. "washed" |
| notes | string \| null | |
| archived | boolean | default false |
| createdAt / updatedAt | string (ISO) | server-assigned |
| extras | object \| null | untouched passthrough |

`GET /beans[?includeArchived]`, `POST /beans` (requires `roaster`+`name`),
`GET/PUT/DELETE /beans/{id}`. **`DELETE` cascades**: "Permanently deletes a
bean and all its batches" — the UI must say so before confirming.

### `BeanBatch` — one bag, `/api/v1/bean-batches`

| field | type | notes |
|---|---|---|
| id | string | UUID |
| beanId | string | parent Bean |
| roastDate | string (ISO) \| null | |
| roastLevel | string \| null | free text, e.g. "medium-light" |
| harvestDate | string \| null | free text |
| qualityScore | number \| null | |
| price | number \| null | |
| currency | string \| null | |
| weight | number \| null | grams; sets `weightRemaining` on create |
| weightRemaining | number \| null | grams |
| buyDate / openDate / bestBeforeDate / freezeDate / unfreezeDate | string (ISO) \| null | |
| frozen | boolean | default false |
| archived | boolean | default false |
| notes | string \| null | |
| createdAt / updatedAt | string (ISO) | |
| extras | object \| null | |

`GET /beans/{beanId}/batches[?includeArchived]`, `POST` same path (bean-scoped
create). `GET /bean-batches[?includeArchived]` (all batches, cross-bean —
used to build the picker without N+1 requests). `GET/PUT/DELETE
/bean-batches/{id}`.

### Linking a bag to the current shot

`WorkflowContext` (the shot's `context`, already fetched via
`getWorkflow()`/written via `updateWorkflow()` in
`src/api/decaid/client.ts`) already accepts `beanBatchId`, `coffeeName`,
`coffeeRoaster` on the real backend — bestpresso's own `DecaidWorkflowContext`
type just hasn't declared them yet. Selecting a bag is exactly:

```ts
updateWorkflow({ context: { beanBatchId, coffeeName, coffeeRoaster } })
```

(the same call DYE2's `roasters.ts` confirm handler makes). `coffeeName` /
`coffeeRoaster` are denormalized display strings written alongside the id,
same pattern DYE2 uses for its favourites/recipes snapshots — not a second
source of truth, just a cache so the dashboard pill never needs a join to
render.

**Non-goals** (present on `WorkflowContext` but out of scope here):
`grinderId`, `grinderModel`, `finalBeverageType`, `baristaName`,
`drinkerName`, `extras`. "Roaster" is not its own resource — it is the
`roaster` string on `Bean`; there is no roaster CRUD endpoint.

## Architecture

### Domain types — `src/domain/bag.ts` (new)

`Bean`, `BeanBatch` (mirroring the tables above), plus a UI-only `Bag` view
model (`{ bean: Bean; batch: BeanBatch }`) produced by joining the two —
never persisted as its own shape.

### API layer — `src/api/decaid/types.ts` + `client.ts`

- Extend `DecaidWorkflowContext` with `beanBatchId?`, `coffeeName?`,
  `coffeeRoaster?` (all `string | null`).
- Add `Bean`/`BeanBatch` types (or import from `domain/bag.ts` if that avoids
  duplication — decide in the plan).
- New client functions, following the existing thin-wrapper style (see
  `getWorkflow`, `updateWorkflow`, `createProfile`): `getBeans`,
  `createBean`, `updateBean`, `deleteBean`, `getBeanBatches(beanId)`,
  `createBeanBatch(beanId, input)`, `getAllBeanBatches`, `updateBeanBatch`,
  `deleteBeanBatch`. Bag selection reuses the existing `updateWorkflow`.

### State wiring

`useBrewingData.ts` (1420 lines) is touched minimally: `BrewingScreenModel`
gains an `activeBag` field (`{ beanBatchId, coffeeName, coffeeRoaster } |
null`) read off the workflow context the hook already polls — no new poll
loop. The Beans/BeanBatches list (not part of live shot polling) gets its
own hook, `src/features/bag/useBagData.ts`, covering fetch + create/update/
delete + "select this bag" (which just calls `updateWorkflow`). The exact
integration point in `useBrewingData.ts` is for the implementation plan to
pin down (file/line), not this design doc.

### Fixture / demo mode

`connection === 'fixture'` (no real device, e.g. `src/fixtures/
brewingFixture.ts`) currently serves the whole `BrewingScreenModel` from
static data. Add 2–3 sample beans with batches to the fixture so the pill,
picker, and manager are fully demoable without hardware. `useBagData` treats
`fixture` connection as "serve/mutate the in-memory fixture list" instead of
hitting the network (mirrors how the rest of the app already branches on
`connection`).

### UI — `src/features/bag/` (new, sibling of `features/brew`, `features/profiles`)

- `BagBar.tsx` — the dashboard pill. Lives in `BrewingPanel`, between "See
  all profiles →" and the Temp/Grind size/Dose/Yield row (per the approved
  mockup). Shows roaster · bean · days-since-roast, or an empty/"Select a
  bag" state. Tapping opens `BagPicker`.
- `BagPicker.tsx` — overlay, same visual pattern as `ScaleDevicePicker` /
  `CleaningSequencePicker`. Grid of bags (batch + parent bean joined),
  freshness badge, "+ New bag", link into `BeanManager`.
  Confirm → `updateWorkflow`.
- `BagForm.tsx` — create/edit. Full `Bean` + `BeanBatch` field set from the
  tables above, nothing else (matches `dye2-plugin/src/pages/add-bean.ts`
  section-for-section: identity, origin, roast & batch, purchase & storage,
  notes).
- `BeanManager.tsx` — full-screen list (pattern: `ProfilesPanel`), grouped by
  `roaster`. No separate "manage roasters" screen: a rename affordance on
  the group header bulk-updates the `roaster` field (`updateBean`) across
  every bean in that group. Deleting a bean warns that its bags go with it
  (cascade, per the API).
- `bagAdapters.ts` — pure functions: join Bean+BeanBatch → `Bag`, compute a
  freshness tier from `roastDate` (fresh/ok/stale, reusing the app's
  existing green/amber/red semantics), group beans by roaster, build the
  `updateWorkflow` patch. These are what get unit tests (matching the
  existing `test/*.test.ts` convention of testing extracted pure logic, not
  the thin fetch wrappers or the components themselves).

### Language

All UI strings in English, matching the rest of the skin (no i18n exists).
The German mockup copy was for review purposes only and is not carried into
the implementation.

## Testing strategy

Node's built-in test runner, `test/*.test.ts`, same as the rest of the repo.
Unit-test `bagAdapters.ts` (freshness tiers, roaster grouping/rename,
workflow-patch construction) and any other pure logic split out of the new
components (following how `profileCarouselMotion.ts`, `brewRatio.ts` etc.
are tested today). No React rendering test harness exists in this repo
today; component wiring is exercised through these extracted pure functions
plus manual verification in the running app, consistent with current
practice.

## Open questions for the implementation plan (not this design)

- Exact `useBrewingData.ts` integration point (which existing poll result
  the `activeBag` fields are read from).
- Whether `Bean`/`BeanBatch` types live in `domain/bag.ts` only, or are
  re-exported through `api/decaid/types.ts` too, to match how `BrewProfile`
  vs `DecaidProfile` are currently split between domain and API layers.
