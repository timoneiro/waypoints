# Export expenses as CSV

Status: draft
Issue: https://github.com/waypoints-pwa/waypoints/issues/17

## Problem
Expenses live only in the app. People want them in a spreadsheet, Actual Budget or Splitwise's
import, and want to know which were paid in cash (the ones missing from the bank app).

## Behavior
- On the Money tab, an **Export CSV** button saves `<trip-name>-expenses.csv` (file name via the
  existing slug helper in `src/lib/download.ts`).
- One row per live expense, oldest first, including settle-up payments marked as such.
- Columns, in order: `date`, `title`, `category`, `amount`, `currency`, `amount_<TRIPCUR>` (converted;
  empty when it can't be converted yet), `rate` (the rate used; empty if none), `paid_with`
  (`cash`, `card` or empty), `paid_by`, `split` (names, `;`-separated, with `name=amount` for an exact
  split), `type` (`expense` or `payment`), `estimate` (`yes` when a card payment is still waiting for
  the bank's rate, else empty), `notes`.
- Plain UTF-8 with a BOM so Excel opens it correctly; `,` separator; `.` decimal; amounts have no
  currency symbol or thousands separator; dates are ISO `YYYY-MM-DD`; fields containing `,` `"` or a
  newline are quoted, quotes doubled. A cell beginning with `=`, `+`, `-` or `@` is prefixed with
  `'` so spreadsheets do not run it as a formula.
- Travellers are written by name; a removed traveller's name still resolves (`names`).
- Empty trip: the button is disabled with no explanation needed beyond "No expenses yet".
- Works offline; nothing is sent anywhere.

Example row: `2027-04-03,Ramen,food,2400,JPY,14.88,161.3,cash,Ana,Ana;Bo,expense,,`.

## Out of scope
- Import, other formats (QIF, OFX), choosing columns, a date range filter.
- Exporting exchanges or photos.
- Splitwise-specific column layout (the generic CSV is what Splitwise's "import" tolerates; not
  verified against it).

## Constraints
- No external service. The file is made on the phone; follow how `src/lib/reportFile.ts` and
  `src/lib/download.ts` hand over a file (including iPhone share-sheet behaviour in
  `src/lib/shareSheet.ts`).
- Read-only: no record changes, no migration.

## Context for implementers
- Domain: add `expensesCsv(t: …)` in a new `src/domain/expensesCsv.ts` as a pure function (inputs:
  trip, expenses, travellers' names, `rateOf`); it must not import UI.
- Use `paidWithOf`, `awaitingCost`, `sharesOf`, `toTripCurrency` from `src/domain/expenses.ts`.
- Button goes in `MoneyPage` in `src/ui/items/expenses.tsx`.
- Tests: `src/domain/expensesCsv.test.ts`.
- Do not touch: record shapes, backup format (`src/db/backupIO.ts`), sync.
- Decided already: columns and order above; formula-injection guard; BOM.

## Tasks
1. **CSV builder**
   - Change: `src/domain/expensesCsv.ts` per the columns above, with a tiny `csvCell` helper.
   - Depends on: none
   - Done when: `src/domain/expensesCsv.test.ts` covers quoting (comma, quote, newline), the
     formula guard, an unconverted expense (empty converted cell), a card estimate, an exact split,
     a payment, a deleted expense (omitted), ordering, and a removed traveller.
2. **Download button**
   - Change: button on `MoneyPage` that builds the CSV and saves it via the existing download helper;
     disabled with no expenses.
   - Depends on: 1
   - Done when: manual check below passes; `npm run lint` clean.
3. **Version and changelog**
   - Change: bump the `package.json` version (minor) and add the `CHANGELOG.md` entry.
   - Depends on: 2
   - Done when: `npm test` and `npm run build` pass.

## Acceptance criteria
- [ ] The file opens in a spreadsheet with correct columns and accented characters intact.
- [ ] Converted amounts equal what the Money tab shows for the same expenses.
- [ ] A title like `=SUM(A1)` is exported as text, not a formula.
- [ ] Unconverted expenses are present with an empty converted amount; deleted ones are absent.
- [ ] The button is disabled when there are no expenses.
- [ ] Nothing is written to the database.

## Verification
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- Manual: trip with a cash JPY expense, a card EUR expense, a split with an exact amount and a
  payment; export; open in a spreadsheet and compare with the Money tab.

## Escalate when
- The download needs a permission, a service worker change, or a CSP change.
- A converted number in the file would disagree with the Money tab.

## Open questions
- None.

## Notes
- Chose a fixed generic layout over per-target (Actual/Splitwise) layouts: one format covers a
  spreadsheet and the importers' column mapping steps.
- Names rather than ids, since the file is for people and other tools.
