-- NFS hub · core schema (shared by Gateline, Rampline, TakeFlight and the Brain)
create schema if not exists core;

create type core.role as enum ('agent', 'lead', 'supervisor', 'manager', 'admin');
create type core.terminal as enum ('US', 'INTL');

create table core.airlines (
  code text primary key,
  name text not null,
  terminal core.terminal not null,
  colour text not null default '#0e9aa7',
  aircraft text[] not null default '{}',
  sla_counter int not null default 0,
  sla_gate int not null default 0,
  sla_jet_bridge int not null default 0,
  sla_lead int not null default 1,
  sla_supervisor int not null default 0,
  sla_confirmed boolean not null default false,
  uses_jet_bridge boolean not null default true,
  required_training text[] not null default '{}',
  station_manager jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table core.people (
  id text primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  staff_no text unique not null,
  first_name text not null,
  last_name text not null,
  role core.role not null,
  home_terminal core.terminal not null,
  core_airline text references core.airlines(code),
  trained_airlines text[] not null default '{}',
  phone text,
  hire_year int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table core.training_records (
  id bigint generated always as identity primary key,
  person_id text not null references core.people(id) on delete cascade,
  airline text not null references core.airlines(code),
  course text not null,
  completed date not null,
  expires date not null,
  source text not null default 'TakeFlight',
  unique (person_id, airline, course)
);

create table core.flights (
  id text primary key,
  date date not null,
  airline text not null references core.airlines(code),
  flight_no text not null,
  destination text not null,
  destination_name text,
  aircraft text,
  std time not null,
  sta time,
  gate text,
  terminal core.terminal not null,
  pax_booked int,
  source text not null default 'schedule'
);
create index flights_date_idx on core.flights (date, airline);

-- Nervous system: modules publish and listen here instead of calling each other.
create table core.events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  module text not null check (module in ('gateline', 'rampline', 'takeflight', 'brain')),
  type text not null,
  payload jsonb not null default '{}'::jsonb
);
create index events_type_at_idx on core.events (type, at desc);
alter publication supabase_realtime add table core.events;

-- Role lookup for RLS
create or replace function core.current_role() returns core.role
language sql stable security definer set search_path = core as $$
  select role from core.people where auth_user_id = auth.uid()
$$;

alter table core.airlines enable row level security;
alter table core.people enable row level security;
alter table core.training_records enable row level security;
alter table core.flights enable row level security;
alter table core.events enable row level security;

create policy "staff read airlines" on core.airlines for select to authenticated using (true);
create policy "admin edits airlines" on core.airlines for all to authenticated using (core.current_role() = 'admin');
create policy "staff read people" on core.people for select to authenticated using (true);
create policy "managers edit people" on core.people for all to authenticated using (core.current_role() in ('manager', 'admin'));
create policy "staff read training" on core.training_records for select to authenticated using (true);
create policy "staff read flights" on core.flights for select to authenticated using (true);
create policy "staff read events" on core.events for select to authenticated using (true);
create policy "leads and up publish events" on core.events for insert to authenticated with check (core.current_role() in ('lead', 'supervisor', 'manager', 'admin'));
