-- Public bucket for app imagery (login photo from NFS's own site, resized to 1600px).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gateline-assets', 'gateline-assets', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
