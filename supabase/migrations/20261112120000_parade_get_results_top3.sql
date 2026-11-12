-- get_results() used to return every entry's tally once results_visible was
-- flipped; the client then showed only the top 3. Anyone calling the RPC
-- directly could read the full standings. Limit it to the top 3 in SQL.
-- Same signature and ordering as 20260612000000_floats.sql, so
-- `create or replace` keeps the existing grants.
create or replace function public.get_results()
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
  order by vote_count desc, e.entry_number
  limit 3;
$$;
