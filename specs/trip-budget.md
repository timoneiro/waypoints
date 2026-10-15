# Trip budget

Status: draft
Issue: https://github.com/waypoints-pwa/waypoints/issues/15
Builds after: none

## Problem
The Money tab shows what was spent but not against what. Groups agree a budget before a trip and have
no way to see how much of it is left.

## Behavior
On the Money tab, a **Budget** card appears above the category bars.
- Without a budget: a small "Set a budget" link opens an inline form.
- The form has **Total** (required, in the trip's currency) and, optionally, an amount per expense
  category (the same categories as expenses). Categories left empty have no budget.
- With a budget the card shows: "€1,200 budget · €740 spent · €460 left" and a progress bar. Over the
  budget shows "€85 over" in the warning style (`notice notice-warn`), never blocking anything. Over/under is decided on the cent-rounded value, so spending exactly the budget is never "over".
- If category amounts are set, each category bar in the existing breakdown also shows its own
  "spent of budget" and turns to the warning style when over.
- "Spent" is exactly the figure the Money tab already shows (`totals().total`: settle-up payments and
  unconverted expenses are not counted).
- Edit or remove the budget from the same card. Removing clears it for everyone.
- The budget is part of the trip, so it syncs and merges like the trip does (newest edit wins).
- If the trip's currency is changed after the budget was set, the budget is shown as "set in EUR:
  set it again" and is not used, rather than silently reinterpreted.

Example: total 1,200 EUR, food 400 EUR. Spent 740 EUR of which food 450: the card says 460 left;
the food bar says "450 of 400 · 50 over".

## Out of scope
- Per-person budgets, daily budgets, alerts or notifications, budget history.
- Converting a budget when the trip currency changes.
- Counting a budget in more than one currency.

## Constraints
- Stored on the trip record as optional fields (older apps keep unknown fields, `CLAUDE.md`). No new
  table, no Dexie version, no `LINK_VERSION` change.
- Writes through `src/db/actions.ts`; no direct `db.trips.put`.

## Context for implementers
- Read `CLAUDE.md` ("never lose them") and `src/domain/expenses.ts` (`totals`).
- `MoneyPage` and its helpers live in `src/ui/items/expenses.tsx` (the card order is in `MoneyPage`).
- `Trip` is in `src/db/types.ts`; its validation is the `trips` entry in `SPECS` of
  `src/domain/records.ts`.
- Trip edits today go through `updateTrip` in `src/db/actions.ts`, which needs the full form and the
  travellers. Add a small `patchTrip(tripId, changes)` beside it, modelled on `patchRecord` (skips
  an unchanged save, sets `updatedAt`, calls `markChanged('trips', …)`).
- Money formatting: `fmtMoney` (already imported in `expenses.tsx`).
- Do not touch: Dexie versions, `LINK_VERSION`, exchange-rate code.
- Decided already: budget is a field of the trip, one currency (the trip's), optional categories.

## Tasks
1. **Trip fields and validation**
   - Change: add `budget?: { total: number; currency: string; categories?: Record<string, number> }`
     to `Trip` in `src/db/types.ts`; add an optional `budget` check in `SPECS.trips` in
     `src/domain/records.ts` (object; `total` is `positive`; `currency` is `currency`; at most 20
     category keys, `WORD` keys, `money` values).
   - Depends on: none
   - Done when: `npm run typecheck` passes; new tests accept a valid budget and reject a negative
     total, a bad currency and 21 categories.
   - Executor: sonnet
2. **Domain function**
   - Change: new `budgetStatus(trip, totals)` in `src/domain/budget.ts` returning `undefined` (no
     budget), `{ stale: true }` (currency differs) or `{ total, spent, left, over, categories }`.
   - Depends on: 1
   - Done when: `src/domain/budget.test.ts` covers no budget, under, exactly at, over, stale
     currency, and a category with no spending.
   - Executor: haiku
3. **Write path**
   - Change: `patchTrip` in `src/db/actions.ts`; test in `src/db/actions.test.ts` that an unchanged
     save writes nothing and a change lands in `unsent` and `outbox`.
   - Depends on: 1
   - Done when: `npm test` passes.
   - Executor: sonnet
4. **Money tab UI**
   - Change: Budget card and inline form in `src/ui/items/expenses.tsx`; per-category figures on the
     existing bars.
   - Depends on: 2, 3
   - Done when: the manual check under Verification passes; `npm run lint` is clean.
   - Executor: sonnet
5. **Version and changelog**
   - Change: bump the `package.json` minor version and add the `CHANGELOG.md` entry.
   - Depends on: 4
   - Done when: `npm test` (incl. changelog test) and `npm run build` pass.
   - Executor: haiku

## Acceptance criteria
- [ ] With no budget, the Money tab looks as before plus a "Set a budget" link.
- [ ] Setting a total shows budget, spent and left, matching the existing "Spent so far" number.
- [ ] Over budget shows the amount over in the warning style and blocks nothing.
- [ ] Category amounts show spent-of-budget per category and flag the ones over.
- [ ] Removing the budget returns the tab to its old look, and the removal syncs.
- [ ] Changing the trip currency after setting a budget shows the "set it again" message.
- [ ] A budget set on one phone appears on another after a link or server sync; an edit on the
      older copy does not undo a newer one.
- [ ] Opening a trip with no budget field works unchanged (no migration).

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- Manual: create a trip in EUR, add two expenses (one food), set a total of 100 and food 20, check the
  numbers, make it over, remove it, then change the trip currency with a budget set.

## Escalate when
- The change seems to need a new table, a Dexie version, or a backup-format change.
- Totals on the Money tab would have to change to make the budget figures work.
- Two attempts at a failing sync/merge test don't fix it.

## Open questions
- None.

## Notes
- Chose optional fields on the trip over a new table: one budget per trip, no concurrent edits worth
  merging at field level, and no server image or Dexie version needed.
- Settle-up payments are not spending, so they do not count against the budget (matches `totals`).
