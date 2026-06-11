-- Fan-favorite voting for the 4th of July parade ("Dynamic Duos").
--
-- Fairness model:
--   * Voters authenticate with their phone number (Supabase OTP auth).
--   * One vote per user, enforced by the primary key on votes.user_id —
--     a user can change their vote (upsert/update) but can never hold two rows.
--   * Vote tallies are hidden until settings.results_visible is flipped;
--     clients can never select other users' votes directly.

-- Parade entries (seeded via supabase/seed.sql).
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  entry_number int not null unique,
  duo_name text not null,
  members text not null,
  description text,
  emoji text not null default '🎆',
  created_at timestamptz not null default now()
);

-- One row per voter. The PK on user_id is the single-vote guarantee.
create table public.votes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index votes_entry_id_idx on public.votes (entry_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger votes_set_updated_at
  before update on public.votes
  for each row
  execute function public.set_updated_at();

-- Single-row app settings; the check on id makes a second row impossible.
create table public.settings (
  id boolean primary key default true check (id),
  voting_open boolean not null default true,
  results_visible boolean not null default false
);

insert into public.settings (id) values (true);

-- Row Level Security ---------------------------------------------------------

alter table public.entries enable row level security;
alter table public.votes enable row level security;
alter table public.settings enable row level security;

create policy "entries are public"
  on public.entries for select
  to anon, authenticated
  using (true);

create policy "settings are public"
  on public.settings for select
  to anon, authenticated
  using (true);

-- Voters can see only their own vote (so the UI can show their current pick).
create policy "read own vote"
  on public.votes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "cast own vote while voting is open"
  on public.votes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select voting_open from public.settings)
  );

create policy "change own vote while voting is open"
  on public.votes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select voting_open from public.settings)
  );

-- Results ---------------------------------------------------------------------
-- Tallies are only obtainable through this function, and only once
-- results_visible is true. security definer bypasses the votes RLS;
-- it exposes aggregate counts only, never individual votes.

create or replace function public.get_results()
returns table (
  entry_id uuid,
  entry_number int,
  duo_name text,
  members text,
  emoji text,
  vote_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select e.id, e.entry_number, e.duo_name, e.members, e.emoji,
         count(v.user_id) as vote_count
  from public.entries e
  left join public.votes v on v.entry_id = e.id
  where (select results_visible from public.settings)
  group by e.id
  order by vote_count desc, e.entry_number;
$$;

grant execute on function public.get_results() to anon, authenticated;
