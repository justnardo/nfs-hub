-- DEMO ONLY: special service requests, gate changes and staff alerts sync through demo_state.
-- Production: SSRs arrive from the airline DCS (PNL/ADL) into hub.flight_ssr; alerts in gateline.notices with RLS per recipient.
alter table gateline.demo_state drop constraint if exists demo_state_kind_check;
alter table gateline.demo_state add constraint demo_state_kind_check
  check (kind in ('log', 'reassignment', 'feedback', 'roster', 'airline', 'route', 'person', 'profile', 'request', 'rules', 'period', 'audit', 'charter', 'advice', 'notice'));

-- Web Push subscriptions (one row per phone/browser). Kept across demo resets so phones stay enrolled.
-- Only the gateline-push edge function (service role) reads or writes them; the VAPID private key is an
-- Edge Function secret (VAPID_PRIVATE_KEY). Production adds Supabase Auth checks inside the function.
create table if not exists gateline.push_subscriptions (
  endpoint text primary key,
  person_id text not null,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_person on gateline.push_subscriptions (person_id);
alter table gateline.push_subscriptions enable row level security;
revoke all on gateline.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on gateline.push_subscriptions to service_role;
