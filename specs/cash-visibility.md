# Cash visibility on the Money tab

Status: draft
Issue: none

## Problem
Expenses say whether they were paid in cash or by card (since 0.2.0 and 0.7.0), but the Money tab
never uses it: you cannot see how much cash is left, which expenses will be missing from the bank
app, or the card/cash split.

## Behavior
1. **Cash left, per currency.** In the Exchange rates card, each foreign currency with at least one
   exchange shows "Cash left: 42,000 JPY" = everything received by exchanges in that currency minus
   cash expenses in that currency (group total, all travellers). Negative shows as "−3,000 JPY (more
   cash spent than changed: an exchange may be missing)" in the warning style.
2. **Payment mark on rows.** Each expense row shows a small "Cash" or "Card" tag when
   `paidWithOf(expense, tripCurrency)` knows it. Expenses where it is `undefined` show nothing there.
3. **Card vs cash split.** Below the category bars, one line "Card 1,100 · Cash 240 · Not noted 60"
   in the trip's currency, using only converted, non-transfer expenses (like `totals`). "Not noted"
   appears only when non-zero. Settle-up payments are excluded.
4. Cash spent counts only expenses where `paidWithOf(...) === 'cash'`; trip-currency cash expenses
   have no exchange and are not part of "cash left" (that is per foreign currency only).

Example: exchanges received 50,000 JPY and 10,000 JPY. Cash expenses in JPY total 27,500. Cash left
shows 32,500 JPY. Card payments in JPY are not subtracted.

## Out of scope
- Per-person cash, or tying withdrawals to who spent.
- Changing how expenses convert, or the card/cash form fields.
- Editing the old "not noted" expenses in bulk.

## Constraints
- Read-only derived numbers: no new fields, no new records, no migration.
- Money maths is whole-number safe: do not round until display (use `fmtMoney`).

## Context for implementers
- `src/domain/expenses.ts`: `paidWithOf`, `awaitingCost`, `totals`, `exchangeRates`, `rateFinder`.
  Add the new pure functions there.
- UI: `MoneyPage`, `RatesCard` and `ExpenseRow` in `src/ui/items/expenses.tsx`.
- Tests next to the domain file: `src/domain/expenses.test.ts`.
- Do not touch: `src/db/*`, record shapes, sync.
- Decided already: group total, per currency; excluded: transfers and deleted records.

## Tasks
1. **cashLeft**
   - Change: `cashLeft(exchanges, expenses, tripCurrency): Map<string, number>` in
     `src/domain/expenses.ts`: per foreign currency, sum of live exchange `amount` minus live,
     non-transfer expenses in that currency with `paidWithOf === 'cash'`.
   - Depends on: none
   - Done when: new tests in `expenses.test.ts`: no exchanges (empty map), exchange only, cash and
     card mix (card ignored), pre-0.7.0 expense with its own rate (counts as card), deleted records
     ignored, negative result, transfer excluded.
2. **paymentSplit**
   - Change: `paymentSplit(expenses, rateOf, tripCurrency): { card, cash, unsaid }` in trip currency,
     excluding transfers, deleted and unconverted; trip-currency expenses with no `paidWith` are
     `unsaid`.
   - Depends on: none
   - Done when: tests cover each bucket and that the three add up to `totals().total`.
3. **Money tab UI**
   - Change: show cash left in `RatesCard`, tag on `ExpenseRow`, split line on `MoneyPage`.
   - Depends on: 1, 2
   - Done when: manual check below passes; `npm run lint` clean.
4. **Version and changelog**
   - Change: patch bump in `package.json` and a `CHANGELOG.md` entry.
   - Depends on: 3
   - Done when: `npm test` and `npm run build` pass.

## Acceptance criteria
- [ ] Cash left per currency equals exchanges received minus cash spent, for a hand-made example.
- [ ] Card expenses and trip-currency expenses do not reduce cash left.
- [ ] Each expense row shows Cash/Card, or nothing where it is not noted.
- [ ] Card + Cash + Not noted equals the "Spent so far" figure.
- [ ] A trip with no foreign currency shows no cash-left and no change other than the split line.
- [ ] No data changes: existing trips open and sync exactly as before.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- Manual: trip in EUR, exchange 50,000 JPY for 310 EUR, add one JPY cash and one JPY card expense,
  check the three figures.

## Escalate when
- A needed number can only come from changing a record shape or the conversion code.
- Existing `expenses.test.ts` cases would have to change to pass.

## Open questions
- None.

## Notes
- "Not noted" exists because trip-currency expenses before 0.7.0 have no `paidWith`
  (`paidWithOf` returns `undefined`).
- Per-person cash is a parked idea (`specs/BACKLOG.md`).
