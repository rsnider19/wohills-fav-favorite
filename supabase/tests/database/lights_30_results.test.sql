-- lights.get_results(): hidden until the reveal, then the top 3 approved
-- houses only, ranked by votes with entry_number breaking ties.
begin;
\ir lights_fixtures.psql
select plan(10);

-- More approved houses and voters, inserted as postgres. Votes go straight in
-- (as postgres) so they can target hidden/pending houses too.
insert into lights.houses (id, submitted_by, address, lat, lng, photo_url, status) values
  ('00000000-0000-4000-9000-0000000000e1', '00000000-0000-4000-8000-0000000000e1',
   '7000 Blackstone Dr', 40.1370, -83.0590, 'https://example.test/e1.jpg', 'approved'),
  ('00000000-0000-4000-9000-0000000000e2', '00000000-0000-4000-8000-0000000000e2',
   '1000 Newcomer Rd', 40.1347, -83.0588, 'https://example.test/e2.jpg', 'approved');

insert into auth.users (id, aud, role, phone)
select ('00000000-0000-4000-8000-1' || lpad(n::text, 11, '0'))::uuid,
       'authenticated', 'authenticated', '1555100' || lpad(n::text, 4, '0')
from generate_series(1, 28) n;

-- Hidden D gets 9 votes and pending C gets 8: neither may appear.
-- Approved: A 5, B 3, E1 3, E2 1. B (lower entry_number) ranks above E1.
insert into lights.votes (user_id, house_id)
select ('00000000-0000-4000-8000-1' || lpad(n::text, 11, '0'))::uuid,
       case
         when n <= 9 then '00000000-0000-4000-9000-00000000000d'::uuid
         when n <= 17 then '00000000-0000-4000-9000-00000000000c'::uuid
         when n <= 22 then '00000000-0000-4000-9000-00000000000a'::uuid
         when n <= 25 then '00000000-0000-4000-9000-00000000000b'::uuid
         else '00000000-0000-4000-9000-0000000000e1'::uuid
       end
from generate_series(1, 28) n;
insert into lights.votes (user_id, house_id) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-9000-0000000000e2');

-- Before the reveal --------------------------------------------------------------------
select tests.act_as_anon();
select is((select count(*)::int from lights.get_results()), 0, 'no results before the reveal (anon)');
reset role;
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from lights.get_results()), 0, 'no results before the reveal (signed in)');
reset role;
select tests.act_as('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from lights.get_results()), 0, 'no results before the reveal (admin)');
reset role;

-- After the reveal ------------------------------------------------------------------------
update lights.settings set results_visible = true;
select tests.act_as_anon();
select results_eq(
  $$ select house_id::text, vote_count::int, rank::int from lights.get_results() $$,
  $$ values ('00000000-0000-4000-9000-00000000000a', 5, 1),
            ('00000000-0000-4000-9000-00000000000b', 3, 2),
            ('00000000-0000-4000-9000-0000000000e1', 3, 3) $$,
  'top 3 approved houses with counts and ranks; ties go to the earlier entry');
select ok(not exists (
  select 1 from lights.get_results()
  where house_id in ('00000000-0000-4000-9000-00000000000c', '00000000-0000-4000-9000-00000000000d')
), 'pending and hidden houses never appear, whatever their votes');
select is((select count(*)::int from lights.get_results()), 3, 'never more than 3 rows');
reset role;

-- Function hygiene -----------------------------------------------------------------------
select is((select prosecdef from pg_proc where oid = 'lights.get_results()'::regprocedure), true,
  'get_results is security definer');
select is((select proconfig from pg_proc where oid = 'lights.get_results()'::regprocedure),
  array['search_path=""'], 'get_results pins an empty search_path');
select ok(has_function_privilege('anon', 'lights.get_results()', 'execute'),
  'anon can call get_results');
select ok(not has_table_privilege('anon', 'lights.votes', 'select'),
  'anon has no direct access to votes');

select * from finish();
rollback;
