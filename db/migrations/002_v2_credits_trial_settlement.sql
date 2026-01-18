-- V2 Credits + Trial + Settlement schema
-- Target: PostgreSQL
-- Notes:
-- - Uses TEXT ids for student/teacher/booking to avoid coupling to a specific UUID schema.
-- - All money is stored as NUMERIC(10,2) USD.

create table if not exists v2_package_catalog (
  id text primary key,
  lessons int not null check (lessons > 0),
  price_usd numeric(10,2) not null check (price_usd >= 0),
  unit_price_usd numeric(10,2) not null check (unit_price_usd >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed packages (FINAL per product checklist: 3/6/10)
insert into v2_package_catalog (id, lessons, price_usd, unit_price_usd, active)
values
  ('pkg_3', 3, 27.00, 9.00, true),
  ('pkg_6', 6, 51.00, 8.50, true),
  ('pkg_10', 10, 80.00, 8.00, true)
on conflict (id) do update set
  lessons = excluded.lessons,
  price_usd = excluded.price_usd,
  unit_price_usd = excluded.unit_price_usd,
  active = excluded.active;

create table if not exists v2_program_purchases (
  id uuid primary key,
  student_id text not null,
  package_id text not null references v2_package_catalog(id),
  lessons int not null check (lessons > 0),
  price_usd numeric(10,2) not null check (price_usd >= 0),
  unit_price_usd numeric(10,2) not null check (unit_price_usd >= 0),
  funding_source text not null, -- 'wallet' | 'stripe' etc
  wallet_tx_id text,
  status text not null, -- 'paid' | 'failed' | 'refunded' (v2 default no refunds)
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_program_purchases_student_created
  on v2_program_purchases (student_id, created_at desc);

create table if not exists v2_credit_lots (
  id uuid primary key,
  student_id text not null,
  purchase_id uuid not null references v2_program_purchases(id) on delete cascade,
  original_lessons int not null check (original_lessons > 0),
  remaining_lessons int not null check (remaining_lessons >= 0),
  unit_price_usd numeric(10,2) not null check (unit_price_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_credit_lots_fifo
  on v2_credit_lots (student_id, created_at asc);

-- Reservations prevent double-spend during booking creation.
create table if not exists v2_credit_reservations (
  id uuid primary key,
  student_id text not null,
  booking_id text not null,
  lessons_reserved int not null check (lessons_reserved > 0),
  status text not null, -- 'active' | 'consumed' | 'released' | 'expired'
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (booking_id)
);

create index if not exists idx_v2_credit_reservations_student_status
  on v2_credit_reservations (student_id, status);

-- Snapshot of how a booking was paid (audit + settlement).
create table if not exists v2_booking_payment_snapshots (
  booking_id text primary key,
  student_id text not null,
  teacher_id text not null,
  method text not null, -- 'credit' | 'trial' | 'wallet'
  unit_price_usd numeric(10,2),
  source_lot_ids jsonb, -- e.g. ['uuid','uuid']
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_booking_payment_student_created
  on v2_booking_payment_snapshots (student_id, created_at desc);

-- Trial entitlement and enforcement.
create table if not exists v2_trial_entitlements (
  student_id text primary key,
  verification_fee_usd numeric(10,2) not null default 1.00,
  verification_status text not null default 'unpaid', -- 'unpaid' | 'paid' | 'not_required'
  verification_tx_id text,
  verified_at timestamptz,

  trial_used boolean not null default false,
  locked_teacher_id text,
  trial_booking_id text,
  used_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_v2_trial_entitlements_locked_teacher
  on v2_trial_entitlements (locked_teacher_id);

-- Idempotency store: return the same response for the same key+request.
create table if not exists v2_idempotency_keys (
  scope text not null, -- e.g. 'buy_with_wallet' | 'trial_verify' | 'slots_book'
  idempotency_key text not null,
  request_hash text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (scope, idempotency_key)
);

create index if not exists idx_v2_idempotency_keys_created
  on v2_idempotency_keys (created_at desc);

-- Settlement record: created once per booking.
create table if not exists v2_lesson_settlements (
  id uuid primary key,
  booking_id text not null unique,
  student_id text not null,
  teacher_id text not null,
  method text not null, -- 'credit' | 'trial'
  unit_price_usd numeric(10,2),
  teacher_share_usd numeric(10,2),
  platform_share_usd numeric(10,2),
  status text not null, -- 'pending' | 'settled' | 'skipped'
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_lesson_settlements_status
  on v2_lesson_settlements (status, created_at asc);
