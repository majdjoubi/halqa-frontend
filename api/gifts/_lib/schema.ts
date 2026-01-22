import { dbQuery } from '../../_lib/db';

let ensured = false;

export async function ensureGiftSchema(): Promise<void> {
  if (ensured) return;

  // Base table
  await dbQuery(
    `create table if not exists gift_vouchers (
      id bigserial primary key,
      code text not null unique,
      package_id text not null,
      lessons int not null,
      price_usd numeric(10,2) not null,
      currency text not null default 'USD',
      provider text not null,
      stripe_checkout_session_id text unique,
      stripe_payment_intent_id text unique,
      paypal_order_id text unique,
      status text not null,
      purchaser_email text,
      recipient_name text,
      message text,
      created_at timestamptz not null default now(),
      paid_at timestamptz,
      expires_at timestamptz not null,
      redeemed_at timestamptz,
      redeemed_by_email text,
      redeemed_by_student_id text,
      halqa_wallet_credit_tx_id text,
      halqa_package_purchase_id text
    )`
  );

  // Forward-compatible schema evolution (safe on existing deployments)
  await dbQuery(`alter table gift_vouchers add column if not exists stripe_checkout_session_id text`);
  await dbQuery(`alter table gift_vouchers add column if not exists stripe_payment_intent_id text`);
  await dbQuery(`alter table gift_vouchers add column if not exists paypal_order_id text`);
  await dbQuery(`alter table gift_vouchers add column if not exists purchaser_email text`);
  await dbQuery(`alter table gift_vouchers add column if not exists recipient_name text`);
  await dbQuery(`alter table gift_vouchers add column if not exists message text`);
  await dbQuery(`alter table gift_vouchers add column if not exists paid_at timestamptz`);
  await dbQuery(`alter table gift_vouchers add column if not exists expires_at timestamptz`);
  await dbQuery(`alter table gift_vouchers add column if not exists redeemed_at timestamptz`);
  await dbQuery(`alter table gift_vouchers add column if not exists redeemed_by_email text`);
  await dbQuery(`alter table gift_vouchers add column if not exists redeemed_by_student_id text`);
  await dbQuery(`alter table gift_vouchers add column if not exists halqa_wallet_credit_tx_id text`);
  await dbQuery(`alter table gift_vouchers add column if not exists halqa_package_purchase_id text`);

  await dbQuery(`create index if not exists idx_gift_vouchers_status on gift_vouchers(status)`);
  await dbQuery(`create index if not exists idx_gift_vouchers_expires_at on gift_vouchers(expires_at)`);

  ensured = true;
}
