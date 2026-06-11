-- Day-of photo uploads from the site itself: the admin (identified by phone
-- number) gets an upload button on each float card. Photos go to the public
-- `floats` bucket and entries.image_url is pointed at them.
--
-- admin_config has RLS enabled with no policies, so the admin's phone number
-- is not readable by anyone; is_admin() (security definer) is the only door.

create table public.admin_config (
  id boolean primary key default true check (id),
  -- digits only, matching the JWT phone claim format (e.g. 15555550100)
  admin_phone text
);

insert into public.admin_config (id) values (true);

alter table public.admin_config enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select auth.jwt()->>'phone') = (select admin_phone from public.admin_config),
    false
  )
$$;

grant execute on function public.is_admin() to authenticated;

create policy "admins update entries"
  on public.entries for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins upload float photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'floats' and public.is_admin());

create policy "admins replace float photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'floats' and public.is_admin())
  with check (bucket_id = 'floats' and public.is_admin());
