-- Reshape entries to match the real parade: each float has a theme
-- (e.g. "Salt & Pepper"), is built by a street (e.g. "Shelley Ct"),
-- and gets a photo uploaded on parade day.

alter table public.entries rename column duo_name to theme;
alter table public.entries rename column members to street;
alter table public.entries add column image_url text;

-- Float photos live in a public storage bucket named `floats`:
-- local config in supabase/config.toml ([storage.buckets.floats]);
-- hosted: create it in Dashboard → Storage (public). Upload day-of and
-- paste the public URL into entries.image_url.

-- Return type changes, so the function must be dropped first.
drop function public.get_results();

create function public.get_results()
returns table (
  entry_id uuid,
  entry_number int,
  theme text,
  street text,
  emoji text,
  image_url text,
  vote_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select e.id, e.entry_number, e.theme, e.street, e.emoji, e.image_url,
         count(v.user_id) as vote_count
  from public.entries e
  left join public.votes v on v.entry_id = e.id
  where (select results_visible from public.settings)
  group by e.id
  order by vote_count desc, e.entry_number;
$$;

grant execute on function public.get_results() to anon, authenticated;
