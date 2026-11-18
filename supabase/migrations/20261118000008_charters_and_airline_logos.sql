-- DEMO ONLY: charter / ad-hoc flights sync through demo_state alongside the schedule.
-- Production: hub.adhoc_flights shared by Rampline and Gateline (one record per charter, both apps read it).
alter table gateline.demo_state drop constraint if exists demo_state_kind_check;
alter table gateline.demo_state add constraint demo_state_kind_check
  check (kind in ('log', 'reassignment', 'feedback', 'roster', 'airline', 'route', 'person', 'profile', 'request', 'rules', 'period', 'audit', 'charter'));

-- Airline logos uploaded by managers (trimmed and resized to ≤400×160 PNG in the browser)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gateline-airline-logos', 'gateline-airline-logos', true, 524288, array['image/png'])
on conflict (id) do nothing;

create policy "demo airline logo upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'gateline-airline-logos' and name ~ '^[A-Z0-9]{2,3}-[0-9]+\.png$');
