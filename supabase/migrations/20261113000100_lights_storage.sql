-- House photos for the lights contest: a public `houses` bucket.
--
-- Public read comes from the bucket being public (public URLs need no policy).
-- Writes:
--   * owners upload only under `<their uid>/…` and only while submissions are
--     open (late entries after voting opens still need a photo);
--   * nobody but the admin overwrites an object (no owner UPDATE policy), so a
--     photo can't be swapped in place after votes come in. Clients always
--     upload to a new, unique path;
--   * owners delete their own objects only while owner edits are allowed
--     (before voting opens), e.g. to clean up a replaced photo, and never the
--     photo their entry currently shows: deleting it and uploading new content
--     at the same path would swap an approved photo without re-approval;
--   * owners need a phone on their token, like every other lights write;
--   * the admin can upload, replace and delete anything in the bucket.
-- Every policy names bucket_id = 'houses', so the parade's `floats` bucket is
-- unaffected.

-- Created here so `supabase db push` gives hosted the bucket with its limits.
-- Locally, config.toml declares the same bucket ([storage.buckets.houses]).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('houses', 'houses', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "lights: owners upload house photos while submissions are open"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'houses'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select lights.caller_has_phone())
    and (select lights.submissions_are_open())
  );

-- Owners can list/read their own folder through the API (needed by delete,
-- which returns the deleted rows). Public URLs work for everyone regardless.
create policy "lights: owners read their own house photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'houses'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "lights: owners delete own house photos before voting opens"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'houses'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select lights.owner_edits_allowed())
    and not exists (
      select 1 from lights.houses h
      where h.submitted_by = (select auth.uid())
        and right(h.photo_url, char_length('/storage/v1/object/public/houses/' || objects.name))
            = '/storage/v1/object/public/houses/' || objects.name
    )
  );

create policy "lights: admin uploads house photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'houses' and (select public.is_admin()));

create policy "lights: admin reads house photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'houses' and (select public.is_admin()));

create policy "lights: admin replaces house photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'houses' and (select public.is_admin()))
  with check (bucket_id = 'houses' and (select public.is_admin()));

create policy "lights: admin deletes house photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'houses' and (select public.is_admin()));
