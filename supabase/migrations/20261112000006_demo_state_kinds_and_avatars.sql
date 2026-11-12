-- DEMO ONLY: manager edits, profiles and requests sync through demo_state too.
alter table gateline.demo_state drop constraint if exists demo_state_kind_check;
alter table gateline.demo_state add constraint demo_state_kind_check
  check (kind in ('log', 'reassignment', 'feedback', 'roster', 'airline', 'route', 'person', 'profile', 'request', 'rules'));

-- Staff profile photos (resized to 256px in the browser before upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gateline-avatars', 'gateline-avatars', true, 524288, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "demo avatar upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'gateline-avatars' and name ~ '^p[0-9]+-[0-9]+\.jpg$');
