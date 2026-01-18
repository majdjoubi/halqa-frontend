# Backend V2 Implementation Pack (Credits / Trial / Booking / Settlement)

This file is a **backend-ready** checklist + implementation notes matching the frontend work already shipped in this repo.

Frontend already calls these endpoints (feature-flagged):
- `GET /v2/available-lessons/balance`
- `GET /v2/available-lessons/packages`
- `POST /v2/available-lessons/buy-with-wallet`
- `GET /v2/trial/eligibility?teacherId=...`
- `POST /v2/trial/verify`
- `POST /v2/slots/book`

## 0) Namespace / routing

- Production routing on Vercel is configured to forward `/v2/*` to the backend host.
- Keep the namespace as `/v2` (do not use `/api/v2` unless you also change frontend + Vercel).

## 1) Database

Apply migration:
- `db/migrations/002_v2_credits_trial_settlement.sql`

Key tables:
- `v2_package_catalog`: package definitions
- `v2_program_purchases`: paid purchases
- `v2_credit_lots`: FIFO credit lots
- `v2_trial_entitlements`: one-trial enforcement + verification
- `v2_idempotency_keys`: idempotency responses
- `v2_booking_payment_snapshots`: audit snapshot per booking
- `v2_lesson_settlements`: settlement outcomes

## 2) Constants (business rules)

- Teacher share = `0.80`
- Platform share = `0.20`
- Trial verification fee (default) = `$1.00` (non-refundable)
- Credits are **lessons** (60 min each). Booking consumes **1 lesson**.

## 3) Common error shape

Return consistent shape:
```json
{ "error": { "code": "INSUFFICIENT_CREDITS", "message": "...", "details": {} } }
```

Recommended codes:
- `INSUFFICIENT_CREDITS`
- `INSUFFICIENT_WALLET`
- `PACKAGE_NOT_ACTIVE`
- `TRIAL_NOT_ELIGIBLE`
- `TRIAL_VERIFICATION_REQUIRED`
- `SLOT_ALREADY_BOOKED`
- `DUPLICATE_IDEMPOTENCY_KEY`

## 4) Idempotency (required)

For write endpoints (`buy-with-wallet`, `trial/verify`, `slots/book`):

1) Compute `requestHash` from the *effective request body + authenticated student id*.
2) Lookup `(scope, idempotencyKey)` in `v2_idempotency_keys`.
   - If found with same `requestHash`: return stored `response_json`.
   - If found with different hash: return `DUPLICATE_IDEMPOTENCY_KEY`.
3) If not found: proceed, then store response in the table inside the same transaction.

## 5) Endpoints

### 5.1 `GET /v2/available-lessons/packages`

- Select active packages from `v2_package_catalog`.

### 5.2 `GET /v2/available-lessons/balance`

Return:
```json
{ "available": 4, "reserved": 1 }
```

Suggested query:
- available = sum(`remaining_lessons`) from `v2_credit_lots` for student.
- reserved = sum(`lessons_reserved`) from `v2_credit_reservations` where `status='active'` and `expires_at > now()`.

### 5.3 `POST /v2/available-lessons/buy-with-wallet`

Request:
```json
{ "packageId": "pkg_6", "idempotencyKey": "uuid" }
```

Transaction outline:
1) Validate package exists and active.
2) Validate student wallet has enough USD (legacy wallet system).
3) Deduct wallet USD.
4) Insert into `v2_program_purchases` (status=`paid`).
5) Insert into `v2_credit_lots` with `remaining_lessons = lessons` and `unit_price_usd` from package.
6) Store idempotency response and return updated balance.

### 5.4 `GET /v2/trial/eligibility?teacherId=...`

Rules:
- Exactly one trial per student.
- Trial is locked to a single teacher (first trial teacher).
- Trial requires verification if fee > 0 and not paid.

Suggested algorithm:
1) Ensure `v2_trial_entitlements` row exists for student (insert default if missing).
2) If `trial_used=true`: `eligible=false`, `lockedTeacherId` set.
3) Else if `locked_teacher_id` is set and != `teacherId`: `eligible=false` (reason: locked to another teacher).
4) Else eligible.

Return (frontend expects):
```json
{
  "eligible": true,
  "verificationFeeUsd": 1,
  "verificationStatus": "unpaid",
  "lockedTeacherId": null,
  "reason": null
}
```

### 5.5 `POST /v2/trial/verify`

Request:
```json
{ "method": "wallet", "idempotencyKey": "uuid" }
```

Transaction outline:
1) Ensure entitlement row exists.
2) If fee=0: set status `not_required` and return.
3) If already `paid`: return idempotent success.
4) Charge verification fee:
   - Wallet: deduct $1 from legacy wallet (recommended for simplicity).
   - Stripe: create and confirm a payment intent / checkout (product choice).
5) Update entitlement: `verification_status='paid'`, `verified_at=now()`.

### 5.6 `POST /v2/slots/book`

Request (frontend sends `studentIanaTimezone` too):
```json
{ "teacherId":"t_9", "slotId":"slot_123", "method":"credit", "idempotencyKey":"uuid", "studentIanaTimezone":"Asia/Riyadh" }
```

Hard requirements:
- Must be **atomic** (single DB transaction).
- Must enforce **trial rules** and **credit availability** on backend.
- Must implement idempotency.

Credit booking transaction outline:
1) Verify slot is still available (or reuse existing legacy booking creation logic) and lock the slot row if possible.
2) Compute `availableLessons` from FIFO lots.
3) If < 1 => `INSUFFICIENT_CREDITS`.
4) Consume FIFO:
   - Select oldest lot with `remaining_lessons > 0` FOR UPDATE.
   - Decrement `remaining_lessons` by 1.
   - Record `sourceLotIds`.
5) Create booking in existing booking table/system.
6) Insert `v2_booking_payment_snapshots` with method=`credit`, `unit_price_usd` from the lot, and `source_lot_ids`.
7) Insert a `v2_lesson_settlements` row with status=`pending` (for later settle).

Trial booking transaction outline:
1) Ensure entitlement exists.
2) If `trial_used=true` => `TRIAL_NOT_ELIGIBLE`.
3) If `locked_teacher_id` is set and != `teacherId` => `TRIAL_NOT_ELIGIBLE`.
4) If fee>0 and `verification_status != paid` => `TRIAL_VERIFICATION_REQUIRED`.
5) Create booking.
6) Update entitlement:
   - set `locked_teacher_id = teacherId` (if null)
   - set `trial_used=true`
   - set `trial_booking_id = bookingId`
   - set `used_at = now()`
7) Insert `v2_booking_payment_snapshots` with method=`trial`.
8) Insert `v2_lesson_settlements` with status=`skipped` (trial has no payout).

## 6) Settlement (Completed + No-show handling)

Policy (FINAL per product):
- **Completed**: consume 1 credit (already done at booking) and pay teacher 80%.
- **Student no-show**: pay teacher 80% as if completed.
- **Teacher no-show**: pay teacher 80% as if completed (same rule).

Implementation approach:
- At booking time: we already consumed the credit and created `v2_lesson_settlements(status='pending')` for credit bookings.
- A worker/cron later transitions to `settled` once the session outcome is known.

Worker algorithm:
1) Find pending settlements where the booking is in a terminal outcome (completed/no_show/etc).
2) For `method='trial'`: keep `skipped`.
3) For `method='credit'`:
   - teacher_share = round(unit_price_usd * 0.80, 2)
   - platform_share = round(unit_price_usd * 0.20, 2)
   - Credit TeacherWallet money balance by `teacher_share`.
   - Mark settlement `settled`.

Important:
- Ensure settlement is idempotent by `booking_id` unique constraint.
- If the legacy system already pays teachers on completion, **do not double-pay**: either bypass legacy payout for v2 bookings or detect v2 snapshot.

## 7) What’s already done in frontend

- Feature flags:
  - `features.v2AvailableLessons`
  - `features.v2Trial`
- UI shows unified pricing as "1 lesson / 60 min" when v2 is enabled.
- Trial UI handles `TRIAL_VERIFICATION_REQUIRED` by opening the verification modal.

## 8) Minimal acceptance tests (backend)

1) Credits purchase creates a lot and increases balance.
2) Credit booking decrements FIFO lot by 1 and creates snapshot.
3) Trial verify changes status to paid.
4) Trial booking works once, then subsequent attempts return `TRIAL_NOT_ELIGIBLE`.
5) Booking with insufficient credits returns `INSUFFICIENT_CREDITS`.
6) Settlement worker pays teacher 80% for completed and for both no-show outcomes.
