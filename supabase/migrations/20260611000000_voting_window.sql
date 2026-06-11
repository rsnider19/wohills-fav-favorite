-- Voting window: voting is only open between settings.voting_opens_at and
-- settings.voting_closes_at, evaluated against the database clock inside RLS.
-- The client countdown is cosmetic; this is the enforcement.
--
-- Either bound may be null (no restriction on that side), and the existing
-- voting_open boolean remains as an emergency kill switch — all conditions
-- must hold for a vote to be accepted.

alter table public.settings
  add column voting_opens_at timestamptz,
  add column voting_closes_at timestamptz;

alter table public.settings
  add constraint voting_window_valid
  check (
    voting_opens_at is null
    or voting_closes_at is null
    or voting_opens_at < voting_closes_at
  );

create or replace function public.voting_is_open()
returns boolean
language sql
stable
set search_path = public
as $$
  select s.voting_open
     and (s.voting_opens_at is null or now() >= s.voting_opens_at)
     and (s.voting_closes_at is null or now() < s.voting_closes_at)
  from public.settings s
$$;

grant execute on function public.voting_is_open() to anon, authenticated;

drop policy "cast own vote while voting is open" on public.votes;
drop policy "change own vote while voting is open" on public.votes;

create policy "cast own vote while voting is open"
  on public.votes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.voting_is_open()
  );

create policy "change own vote while voting is open"
  on public.votes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.voting_is_open()
  );
