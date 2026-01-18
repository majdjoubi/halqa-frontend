# V2 Credits / Trial / Packages — Implementation Spec (Side System)

This document defines the production-oriented architecture, backend contract, and frontend UX for introducing unified pricing, prepaid packages, and a one-time trial **without breaking the existing wallet-based system**.

> Scope note: This repo is the Angular frontend. Backend changes are described as an API contract + data model spec to be implemented in the API service.

## 1) Goals / Non-goals

### Goals
- Keep current wallet top-up and legacy bookings working as-is.
- Add a feature-flagged **side system** under the `/v2` namespace.
- Unified price: **$10 per 60 minutes** (displayed as “1 lesson” credit during booking).
- Packages (credits) with FIFO consumption internally.
- Trial with hard enforcement (per student, and per teacher-per-student).
- Settlement: after lesson completion, **TeacherWallet += 80%**, platform keeps 20% (only for *paid* lessons).
- No automated refunds/cancellations; disputes handled manually via email.

### Non-goals (for v1)
- Rewriting scheduling/slot rendering.
- Migrating old bookings into credits.
- Automated disputes/refunds.

## 2) Glossary

- **Lesson / Credit**: 1 unit = 60-minute 1:1 booking.
- **Available lessons**: student-facing credit balance.
- **Reserved lessons**: held while a booking is pending/created (to prevent double spend).
- **Credit lot**: an internal batch from a purchase, used FIFO.
- **Program Escrow**: virtual accounting bucket holding prepaid value until lessons complete.
- **Settlement**: on completion, move value from escrow to TeacherWallet (80%) + platform (20%).
- **Trial verification fee**: optional, non-refundable $1 charge to reduce trial abuse. (If business decides “pure free trial”, set amount to 0.)

## 3) Business Rules (final, implementation-ready)

### Unified pricing
- Public price is fixed: **$10 per 60-minute lesson**.
- Teacher list may still show legacy hourly rate until UX is finalized, but **booking consumes 1 lesson credit** (not USD).

### Packages
Packages define the number of lessons and a total USD price:
- 1 → $10
- 3 → $27
- 6 → $51
- 10 → $80

Rules:
- Packages are prepaid.
- Purchases convert into credits; credits accumulate; no cap.
- Consumption is FIFO across credit lots.

### Trial
- Each student can take **exactly one trial lesson**.
- Trial is 60 minutes.
- Trial is limited to **one teacher only** (student chooses teacher). Enforce:
  - one trial per student (hard)
  - one trial per teacher-per-student (hard)
- Trial lessons **do not** affect StudentWallet or TeacherWallet.

Verification fee policy:
- `trialVerificationFeeUsd = 1` (non-refundable) to unlock trial.
- Verification fee is **not** added to StudentWallet and does not go to TeacherWallet.
- If the business wants a pure free trial, set `trialVerificationFeeUsd = 0`.

### Cancellations / no-show / refunds
- No automated refunds.
- No cancellation (or, if cancellation exists in legacy, credits are not restored automatically in v2).
- No-show is treated according to policy; v2 default:
  - if student no-shows → counts as consumed/completed (credits consumed)
  - teacher is paid **as if the lesson happened** (no difference)
- Disputes handled manually via `info@halqa.online`.

## 4) High-level Architecture

### Existing (must remain)
- StudentWallet top-ups (Stripe/PayPal).
- Legacy booking deducts from StudentWallet and credits TeacherWallet.

### New side system (v2)
Add modules:
1. **Credits Ledger / Escrow**
   - Tracks purchases, remaining lessons, reservations, consumption.
2. **Trial Module**
   - Tracks eligibility, verification fee payment, and one-time booking enforcement.
3. **Settlement Engine**
   - On lesson completion, computes the unit price snapshot, releases escrow, and credits TeacherWallet.

Feature flags:
- `features.v2AvailableLessons`
- `features.v2Trial`

## 5) Data Models (backend)

Below are suggested relational entities and JSON examples.

### 5.1 PackageCatalog
Static or admin-managed catalog.

```json
{
  "id": "pkg_10",
  "lessons": 10,
  "priceUsd": 80,
  "unitPriceUsd": 8,
  "active": true
}
```

### 5.2 ProgramPurchase
One record per successful package purchase.

```json
{
  "id": "pp_123",
  "studentId": "stu_1",
  "packageId": "pkg_6",
  "lessons": 6,
  "priceUsd": 51,
  "unitPriceUsd": 8.5,
  "fundingSource": "wallet",
  "walletTxId": "wtx_999",
  "status": "paid",
  "createdAt": "2026-01-18T10:00:00Z"
}
```

### 5.3 CreditLot (FIFO)
A lot represents the purchased lessons still remaining.

```json
{
  "id": "lot_abc",
  "studentId": "stu_1",
  "purchaseId": "pp_123",
  "originalLessons": 6,
  "remainingLessons": 4,
  "unitPriceUsd": 8.5,
  "createdAt": "2026-01-18T10:00:00Z"
}
```

### 5.4 CreditReservation
Created when booking is initiated (prevents double-spend).

```json
{
  "id": "resv_1",
  "studentId": "stu_1",
  "bookingId": "bk_777",
  "lessonsReserved": 1,
  "status": "active",
  "expiresAt": "2026-01-18T10:05:00Z"
}
```

### 5.5 BookingPaymentSnapshot
Stored on booking for auditability.

```json
{
  "bookingId": "bk_777",
  "method": "credit",
  "unitPriceUsd": 8.5,
  "sourceLotIds": ["lot_abc"],
  "createdAt": "2026-01-18T10:00:05Z"
}
```

### 5.6 TrialEntitlement + TrialUsage

```json
{
  "studentId": "stu_1",
  "verificationFeeUsd": 1,
  "verificationStatus": "paid",
  "trialUsed": true,
  "trialTeacherId": "t_9",
  "trialBookingId": "bk_trial_1",
  "usedAt": "2026-01-20T12:00:00Z"
}
```

### 5.7 LessonSettlement

```json
{
  "id": "set_1",
  "bookingId": "bk_777",
  "studentId": "stu_1",
  "teacherId": "t_9",
  "method": "credit",
  "unitPriceUsd": 8.5,
  "teacherShareUsd": 6.8,
  "platformShareUsd": 1.7,
  "status": "settled",
  "settledAt": "2026-01-20T13:05:00Z"
}
```

## 6) API Contract (v2)

### Common error shape
```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "To book, you need at least 1 available lesson.",
    "details": {}
  }
}
```

### 6.1 Available lessons

#### `GET /v2/available-lessons/balance`
Response:
```json
{ "available": 4, "reserved": 1 }
```

#### `GET /v2/available-lessons/packages`
Response:
```json
[
  { "id": "pkg_1", "lessons": 1, "priceUsd": 10, "unitPriceUsd": 10, "active": true },
  { "id": "pkg_3", "lessons": 3, "priceUsd": 27, "unitPriceUsd": 9, "active": true }
]
```

#### `POST /v2/available-lessons/buy-with-wallet`
Request:
```json
{ "packageId": "pkg_6", "idempotencyKey": "uuid" }
```
Response:
```json
{ "purchaseId": "pp_123", "balance": { "available": 6, "reserved": 0 } }
```
Errors:
- `INSUFFICIENT_WALLET`
- `PACKAGE_NOT_ACTIVE`
- `DUPLICATE_IDEMPOTENCY_KEY`

### 6.2 Trial

#### `GET /v2/trial/eligibility?teacherId=...`
Response:
```json
{
  "eligible": true,
  "verificationFeeUsd": 1,
  "reason": null,
  "constraints": {
    "onePerStudent": true,
    "oneTeacherOnly": true
  }
}
```

#### `POST /v2/trial/verify`
Used to charge the verification fee (wallet or Stripe checkout depends on product decision).
Request:
```json
{ "method": "wallet", "idempotencyKey": "uuid" }
```
Response:
```json
{ "verificationStatus": "paid" }
```

### 6.3 Booking (recommended contract)

Because the legacy booking endpoint likely deducts wallet, v2 should provide a booking endpoint that **atomically**:
- checks trial/credits
- reserves/consumes 1 lesson
- creates booking

#### `POST /v2/slots/book`
Request:
```json
{
  "teacherId": "t_9",
  "slotId": "slot_123",
  "method": "credit",
  "idempotencyKey": "uuid"
}
```

Alternative for trial:
```json
{
  "teacherId": "t_9",
  "slotId": "slot_123",
  "method": "trial",
  "idempotencyKey": "uuid"
}
```

Response:
```json
{
  "bookingId": "bk_777",
  "payment": { "method": "credit", "unitPriceUsd": 8.5 },
  "balance": { "available": 3, "reserved": 1 }
}
```

Errors:
- `INSUFFICIENT_CREDITS`
- `TRIAL_NOT_ELIGIBLE`
- `SLOT_ALREADY_BOOKED`
- `DUPLICATE_IDEMPOTENCY_KEY`

### 6.4 Completion + settlement

#### `POST /v2/lessons/settle`
Internal/admin/cron-triggered settlement.
Request:
```json
{ "bookingId": "bk_777" }
```
Response:
```json
{ "status": "settled", "teacherShareUsd": 6.8, "platformShareUsd": 1.7 }
```

## 7) Critical Consistency Requirements

- **Atomicity**: booking + reserve/consume must be in a single DB transaction.
- **Idempotency**: all purchase/booking endpoints accept `idempotencyKey`.
- **Snapshot pricing**: store `unitPriceUsd` at booking time (from the FIFO lot used).
- **Auditability**: ledger entries for purchase, reservation, consumption, and settlement.

## 8) Frontend UX Flow (summary)

### All Teachers (minimal change)
- Show “Available lessons” badge.
- On “Book Now”:
  - if `available >= 1` → proceed
  - else → open purchase modal

### Purchase modal
- Show packages in USD (only inside buying flow).
- Provide “Top up wallet” CTA.

### Trial CTA (future)
- Show trial eligibility on teacher profile / booking sidebar.
- If eligible but not verified: show verification CTA.

## 9) Step-by-step Implementation Plan

1. Backend: implement `/v2/available-lessons/*` + package catalog + buy-with-wallet.
2. Backend: implement `/v2/slots/book` credit method (atomic reserve+booking).
3. Frontend: when v2 enabled, switch booking call from legacy `bookSlot` to `/v2/slots/book`.
4. Backend: implement trial eligibility + verification + `/v2/slots/book` trial method.
5. Backend: add settlement worker (time-based completion) and TeacherWallet crediting.
6. Rollout: enable flags for internal users; add metrics + logs.

---

If you want, I can also add a small section mapping current frontend files/services to these endpoints.
