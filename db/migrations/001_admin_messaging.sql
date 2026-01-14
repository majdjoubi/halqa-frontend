-- Admin Messaging (SendGrid-only) schema
-- Target: PostgreSQL (recommended). Required env var: DATABASE_URL

create table if not exists messaging_campaigns (
  id uuid primary key,
  created_at timestamptz not null default now(),
  created_by_email text,

  audience_type text not null,
  total_recipients int not null default 0,

  subject text not null,
  html_body text not null,

  status text not null,
  scheduled_at timestamptz,

  from_email text not null,
  reply_to_email text not null
);

create table if not exists messaging_recipients (
  id bigserial primary key,
  campaign_id uuid not null references messaging_campaigns(id) on delete cascade,

  email text not null,
  first_name text,
  role text,

  unsubscribed boolean not null default false,

  unique (campaign_id, email)
);

create table if not exists messaging_send_jobs (
  id bigserial primary key,
  campaign_id uuid not null references messaging_campaigns(id) on delete cascade,
  recipient_id bigint not null references messaging_recipients(id) on delete cascade,

  scheduled_at timestamptz not null,

  status text not null,
  attempts int not null default 0,
  last_error text,

  sendgrid_message_id text,
  sent_at timestamptz
);

create index if not exists idx_messaging_send_jobs_due
  on messaging_send_jobs (status, scheduled_at);

create table if not exists messaging_send_events (
  id bigserial primary key,
  campaign_id uuid,
  recipient_email text,
  event_type text not null,
  occurred_at timestamptz,
  sg_message_id text,
  payload jsonb
);

create index if not exists idx_messaging_send_events_campaign
  on messaging_send_events (campaign_id);

create table if not exists messaging_unsubscribe_tokens (
  email text primary key,
  token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists messaging_unsubscribes (
  email text primary key,
  unsubscribed_at timestamptz not null default now()
);
