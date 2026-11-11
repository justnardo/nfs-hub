-- Gateline module schema (passenger services, above the wing)
create schema if not exists gateline;

create type gateline.shift as enum ('E', 'M', 'L', 'O', 'V');

create table gateline.roster_entries (
  person_id text not null references core.people(id) on delete cascade,
  date date not null,
  shift gateline.shift not null,
  published boolean not null default true,
  primary key (person_id, date)
);

-- Protected reassignment: every cover move, with manager override reason when SLA is broken
create table gateline.reassignments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift gateline.shift not null,
  person_id text not null references core.people(id),
  from_airline text not null,
  to_airline text not null references core.airlines(code),
  override_reason text,
  approved_by text,
  at timestamptz not null default now()
);

create table gateline.gate_logs (
  id text primary key,
  flight_id text not null unique references core.flights(id),
  date date not null,
  airline text not null references core.airlines(code),
  lead_id text references core.people(id),
  team jsonb not null default '[]'::jsonb,          -- [{personId, position}]
  events jsonb not null default '{}'::jsonb,        -- {door_open: "HH:mm", ...}
  pax_boarded int,
  delay_minutes int not null default 0,
  delay_cause text,
  notes text not null default '',
  status text not null default 'open' check (status in ('open', 'filed')),
  filed_at time,
  source text not null default 'device',
  updated_at timestamptz not null default now()
);
create index gate_logs_date_idx on gateline.gate_logs (date, airline);
create index gate_logs_lead_idx on gateline.gate_logs (lead_id);

create table gateline.discrepancies (
  id uuid primary key default gen_random_uuid(),
  gate_log_id text not null references gateline.gate_logs(id) on delete cascade,
  type text not null,
  note text not null,
  at time not null,
  photo_path text                                    -- storage bucket: gate-photos
);

create table gateline.feedback (
  id text primary key,
  date date not null,
  airline text not null references core.airlines(code),
  flight_id text references core.flights(id),
  kind text not null check (kind in ('complaint', 'praise')),
  from_name text,
  summary text not null,
  person_ids text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'reviewed', 'closed'))
);

alter table gateline.roster_entries enable row level security;
alter table gateline.reassignments enable row level security;
alter table gateline.gate_logs enable row level security;
alter table gateline.discrepancies enable row level security;
alter table gateline.feedback enable row level security;

create policy "staff read rosters" on gateline.roster_entries for select to authenticated using (true);
create policy "managers edit rosters" on gateline.roster_entries for all to authenticated using (core.current_role() in ('manager', 'admin'));
create policy "staff read reassignments" on gateline.reassignments for select to authenticated using (true);
create policy "supervisors request cover" on gateline.reassignments for insert to authenticated
  with check (core.current_role() in ('supervisor', 'manager', 'admin') and (override_reason is null or core.current_role() in ('manager', 'admin')));
create policy "staff read gate logs" on gateline.gate_logs for select to authenticated using (true);
create policy "leads write gate logs" on gateline.gate_logs for all to authenticated using (core.current_role() in ('lead', 'supervisor', 'manager', 'admin'));
create policy "staff read discrepancies" on gateline.discrepancies for select to authenticated using (true);
create policy "leads write discrepancies" on gateline.discrepancies for all to authenticated using (core.current_role() in ('lead', 'supervisor', 'manager', 'admin'));
create policy "supervisors read feedback" on gateline.feedback for select to authenticated using (core.current_role() in ('supervisor', 'manager', 'admin'));
create policy "managers manage feedback" on gateline.feedback for update to authenticated using (core.current_role() in ('manager', 'admin'));

alter publication supabase_realtime add table gateline.gate_logs;
