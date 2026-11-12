-- lights schema shape, grants, settings defaults and window helpers; plus a
-- guard that the parade's public objects are unchanged.
begin;
\ir lights_fixtures.psql
select plan(32);

select has_schema('lights');
select tables_are('lights', array['settings', 'houses', 'votes']);
select ok((select bool_and(c.relrowsecurity) from pg_class c
           where c.relnamespace = 'lights'::regnamespace and c.relkind = 'r'),
  'RLS is enabled on every lights table');
select ok(has_schema_privilege('anon', 'lights', 'usage')
      and has_schema_privilege('authenticated', 'lights', 'usage'),
  'anon and authenticated can use the schema');
select ok(not has_schema_privilege('anon', 'lights', 'create')
      and not has_schema_privilege('authenticated', 'lights', 'create'),
  'nobody but the owner creates objects in lights');

select is((select count(*)::int from pg_proc p
           where p.pronamespace = 'lights'::regnamespace
             and (p.proacl is null or exists (
               select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  0, 'no lights function is executable by PUBLIC');

select is((select array_agg(p.proname::text order by p.proname) from pg_proc p
           where p.pronamespace = 'lights'::regnamespace and p.prosecdef),
  array['get_results'], 'get_results is the only security definer function in lights');
select is((select count(*)::int from pg_proc p
           where p.pronamespace = 'lights'::regnamespace
             and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'every lights function pins an empty search_path');
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'lights' and grantee = 'PUBLIC'),
  0, 'no lights table privilege is granted to PUBLIC');
select ok(not has_sequence_privilege('anon', 'lights.houses_entry_number_seq', 'usage,select,update')
      and not has_sequence_privilege('authenticated', 'lights.houses_entry_number_seq', 'usage,select,update'),
  'API roles cannot touch the entry_number sequence');
select is((select count(*)::int from pg_policies
           where schemaname = 'storage' and tablename = 'objects' and policyname like 'lights: %'
             and position($q$bucket_id = 'houses'::text$q$ in coalesce(qual, '') || coalesce(with_check, '')) = 0),
  0, 'every lights storage policy is scoped to the houses bucket');
select is((select array_agg(x order by n)::text from (
  select 1 n, (set_config('request.jwt.claims', '{"phone":"15550000005","is_anonymous":false}', true) is not null
               and lights.caller_has_phone()) x
  union all select 2, (set_config('request.jwt.claims', '{"phone":"","email":"a@b.c"}', true) is not null
               and lights.caller_has_phone())
  union all select 3, (set_config('request.jwt.claims', '{"phone":"15550000005","is_anonymous":true}', true) is not null
               and lights.caller_has_phone())
  union all select 4, (set_config('request.jwt.claims', '{}', true) is not null and lights.caller_has_phone())
) t), '{t,f,f,f}', 'caller_has_phone: phone yes; email, anonymous or no claims no');

-- Settings ------------------------------------------------------------------------------
select is((select count(*)::int from lights.settings), 1, 'exactly one settings row');
select throws_ok($$ insert into lights.settings (id, geofence_min_lat, geofence_max_lat, geofence_min_lng, geofence_max_lng)
                    values (false, 0, 1, 0, 1) $$,
  '23514', null, 'a second settings row is impossible');
select throws_ok($$ update lights.settings set voting_closes_at = voting_opens_at $$,
  '23514', null, 'the voting window must be ordered');
select throws_ok($$ update lights.settings set geofence_min_lat = geofence_max_lat $$,
  '23514', null, 'the geofence must have area');

select tests.act_as_anon();
select is((select (results_visible, voting_open, submissions_open)::text from lights.settings),
  '(f,t,t)', 'anon reads settings');
select throws_ok($$ update lights.settings set results_visible = true $$, '42501', null,
  'anon cannot write settings');
reset role;
select tests.act_as('00000000-0000-4000-8000-0000000000ad');
select throws_ok($$ update lights.settings set results_visible = true $$, '42501', null,
  'even the admin cannot write settings through the API (service role only)');
reset role;

-- Window helpers --------------------------------------------------------------------------
select tests.phase('before_submissions');
select is((lights.submissions_are_open(), lights.voting_is_open(), lights.owner_edits_allowed())::text,
  '(f,f,f)', 'before submissions: nothing open');
select tests.phase('submissions');
select is((lights.submissions_are_open(), lights.voting_is_open(), lights.owner_edits_allowed())::text,
  '(t,f,t)', 'submissions: open, owners can edit');
select tests.phase('overlap');
select is((lights.submissions_are_open(), lights.voting_is_open(), lights.owner_edits_allowed())::text,
  '(t,t,f)', 'overlap: both open, edits locked');
select tests.phase('voting');
select is((lights.submissions_are_open(), lights.voting_is_open(), lights.owner_edits_allowed())::text,
  '(f,t,f)', 'voting only');
select tests.phase('closed');
select is((lights.submissions_are_open(), lights.voting_is_open(), lights.owner_edits_allowed())::text,
  '(f,f,f)', 'closed');
select is(lights.in_geofence(40.1231, -83.0516), true, 'Candlewood Dr is inside the geofence');
select is(lights.in_geofence(39.9612, -82.9988), false, 'downtown Columbus is outside the geofence');

-- The parade is untouched ---------------------------------------------------------------
select is((select proconfig from pg_proc where oid = 'public.get_results()'::regprocedure),
  array['search_path=""'], 'parade get_results is still the M2 version');
select ok(position('limit 3' in (select prosrc from pg_proc where oid = 'public.get_results()'::regprocedure)) > 0,
  'parade get_results still limits to 3');
select policies_are('public', 'votes',
  array['read own vote', 'cast own vote while voting is open', 'change own vote while voting is open'],
  'parade vote policies unchanged');
select policies_are('public', 'entries', array['entries are public', 'admins update entries'],
  'parade entry policies unchanged');
select is((select count(*)::int from pg_policies
           where schemaname = 'storage' and tablename = 'objects' and policyname not like 'lights: %'), 2,
  'only the two parade storage policies exist besides the lights ones');
select is((select count(*)::int from public.entries), 6, 'the parade seed is intact');

select * from finish();
rollback;
