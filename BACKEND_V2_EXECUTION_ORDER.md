# Backend V2 — Execution Order (No-Stop Checklist)

This is the **fastest safe implementation order** for the backend (Render API) to reach ✅ on the full workflow checklist.

If you only follow one doc, follow this plus [BACKEND_V2_IMPLEMENTATION_PACK.md](BACKEND_V2_IMPLEMENTATION_PACK.md).

## Phase 0 — Preflight (1–2 hours)

- Apply migration: [db/migrations/002_v2_credits_trial_settlement.sql](db/migrations/002_v2_credits_trial_settlement.sql)
- Confirm package catalog seeded: `pkg_3`, `pkg_6`, `pkg_10`.
- Decide the source of truth for student/teacher ids (string/uuid) and map consistently.

Acceptance:
- Can run `SELECT * FROM v2_package_catalog;` and see 3 rows.

## Phase 1 — Read endpoints (balance + packages) ✅

Implement:
- `GET /v2/available-lessons/packages`
- `GET /v2/available-lessons/balance`

Acceptance:
- Authenticated student gets non-error JSON.
- Balance sums FIFO lots and active reservations.

## Phase 2 — Buying packages (wallet funding) ✅

Implement:
- `POST /v2/available-lessons/buy-with-wallet`

Required details:
- Must support `idempotencyKey` semantics.
- Must return updated balance.

Acceptance:
- Wallet is debited exactly once per idempotency key.
- Credits increase by package lessons.

## Phase 3 — Trial eligibility + verify ✅

Implement:
- `GET /v2/trial/eligibility?teacherId=...`
- `POST /v2/trial/verify`

Required details:
- Enforce: one trial per student.
- Enforce: trial locked to one teacher.
- Verification fee: `$1` by default, wallet debit recommended (simplest).

Acceptance:
- Unverified user gets `verificationStatus: unpaid`.
- Verify flips to `paid` (idempotent).

## Phase 4 — Booking endpoint (credit + trial) ✅

Implement:
- `POST /v2/slots/book`

Hard requirements:
- **Atomic transaction**: entitlement/credits + booking creation.
- **Idempotency**.
- Correct error codes:
  - `INSUFFICIENT_CREDITS`
  - `TRIAL_NOT_ELIGIBLE`
  - `TRIAL_VERIFICATION_REQUIRED`
  - `SLOT_ALREADY_BOOKED`

Implementation notes:
- Credit booking consumes 1 lesson via FIFO and stores a payment snapshot.
- Trial booking marks entitlement used and stores a snapshot.
- Trial booking should create a settlement row with `status=skipped` (no payout).

Acceptance:
- Credit booking decreases available balance by 1.
- Trial booking works once; second trial booking returns `TRIAL_NOT_ELIGIBLE`.

## Phase 5 — Settlement (80/20) + no-show policy ✅

Implement:
- Worker/cron that settles v2 bookings (by reading `v2_booking_payment_snapshots` and `v2_lesson_settlements`).

Policy (final):
- Completed → teacher paid 80%.
- Student no-show → teacher paid 80%.
- Teacher no-show → teacher paid 80%.

Critical:
- Avoid double-paying if legacy system also pays teachers.

Acceptance:
- For a v2 credit booking, settlement creates exactly one teacher credit (money) and marks row `settled`.

## Phase 6 — Rollout

- Enable flags gradually:
  - `v2AvailableLessons` first
  - then `v2Trial`
- Add logs/metrics for: errors by code, idempotency collisions, slot conflicts, settlement failures.

## Final checklist mapping

- `/v2` namespace: ✅ frontend + Vercel routing already done in this repo.
- Feature flags: ✅ frontend.
- Pricing 10$ = 1 lesson: ✅ UX; backend must enforce via packages/ledger.
- Packages 3/6/10 FIFO: backend phases 0–2.
- Trial one-time + verify fee: backend phase 3.
- Booking + insufficient balance: backend phase 4.
- Completed/no-show payout 80%: backend phase 5.
