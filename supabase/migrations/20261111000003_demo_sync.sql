-- DEMO ONLY — remove before go-live with real NFS data.
-- Demo logins are not Supabase Auth users, so live demo changes (gate logs, covers, feedback status)
-- sync through this one table with anon access. Seed data is generated identically on every device.
create table gateline.demo_state (
  kind text not null check (kind in ('log', 'reassignment', 'feedback')),
  id text not null,
  payload jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
alter table gateline.demo_state enable row level security;
create policy "demo anon read" on gateline.demo_state for select to anon, authenticated using (true);
create policy "demo anon write" on gateline.demo_state for insert to anon, authenticated with check (true);
create policy "demo anon update" on gateline.demo_state for update to anon, authenticated using (true) with check (true);
create policy "demo anon delete" on gateline.demo_state for delete to anon, authenticated using (true);
alter publication supabase_realtime add table gateline.demo_state;

-- Demo event feed (gate taps, covers) visible across devices
create policy "demo anon read events" on core.events for select to anon using (true);
create policy "demo anon publish events" on core.events for insert to anon with check (module = 'gateline');

grant usage on schema core, gateline to anon, authenticated;
grant select, insert on core.events to anon, authenticated;
grant select, insert, update, delete on gateline.demo_state to anon, authenticated;
