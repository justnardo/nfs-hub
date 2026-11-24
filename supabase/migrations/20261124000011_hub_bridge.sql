-- NFS Hub bridge: other modules (Rampline first) publish into core.events through the hub-bridge
-- Edge Function, which checks a per-module key. Only the key's SHA-256 hash is stored here.
create table if not exists core.bridge_keys (
  module text primary key check (module in ('rampline', 'takeflight', 'brain')),
  key_hash text not null,
  created_at timestamptz not null default now()
);
alter table core.bridge_keys enable row level security;
-- No policies: only the service role (inside the Edge Function) can read it.

comment on table core.bridge_keys is 'Hashed keys modules use to publish hub events via the hub-bridge function';
