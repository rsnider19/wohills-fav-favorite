-- lights.votes: one vote per phone, the voting window and kill switch, only
-- approved houses, no self-votes, and votes are private.
begin;
\ir lights_fixtures.psql
select plan(24);

select tests.phase('voting');

-- Casting and changing a vote ---------------------------------------------------------
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select lives_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000a')
$$, 'a voter votes for an approved house while voting is open');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000b')
$$, '23505', null, 'a second vote is impossible (PK on user_id)');
-- What supabase-js upsert(onConflict: 'user_id') sends.
select lives_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000b')
  on conflict (user_id) do update set user_id = excluded.user_id, house_id = excluded.house_id
$$, 'a voter changes their vote with an upsert');
select is((select house_id::text from lights.votes), '00000000-0000-4000-9000-00000000000b',
  'the changed vote is the only vote');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-9000-00000000000a')
$$, '42501', null, 'nobody votes on someone else''s behalf');
select throws_ok($$ delete from lights.votes $$, '42501', null,
  'votes cannot be deleted by voters');
reset role;

-- Phone-verified accounts only ------------------------------------------------------------
select tests.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000a')
$$, '42501', 'new row violates row-level security policy for table "votes"',
  'an account without a phone (email or anonymous) cannot vote');
reset role;
-- A vote cast before the rule existed (as postgres); it can't be moved either.
insert into lights.votes (user_id, house_id)
  values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-9000-00000000000a')
  on conflict (user_id) do update set house_id = excluded.house_id;
select tests.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok($$
  update lights.votes set house_id = '00000000-0000-4000-9000-00000000000b'
$$, '42501', null, 'an account without a phone cannot change a vote either');
reset role;
delete from lights.votes where user_id = '00000000-0000-4000-8000-0000000000f1';

-- Only approved houses, never your own ---------------------------------------------------
select tests.act_as('00000000-0000-4000-8000-0000000000e2');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000c')
$$, '42501', null, 'no votes for a pending house');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000d')
$$, '42501', null, 'no votes for a hidden house');
reset role;

select tests.act_as('00000000-0000-4000-8000-00000000000a');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000a')
$$, '42501', null, 'no self-votes');
select lives_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000b')
$$, 'an owner can vote for someone else''s house');
select throws_ok($$
  update lights.votes set house_id = '00000000-0000-4000-9000-00000000000a'
$$, '42501', null, 'no self-votes by changing an existing vote');
reset role;

-- Privacy ---------------------------------------------------------------------------------
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from lights.votes), 1, 'a voter sees only their own vote');
reset role;

select tests.act_as_anon();
select throws_ok($$ select count(*) from lights.votes $$, '42501', null,
  'anon cannot read votes at all');
reset role;

-- The window and the kill switch --------------------------------------------------------
select tests.phase('submissions');  -- voting opens tomorrow
select tests.act_as('00000000-0000-4000-8000-0000000000e2');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000a')
$$, '42501', null, 'no votes before voting opens');
reset role;

select tests.phase('closed');
select tests.act_as('00000000-0000-4000-8000-0000000000e2');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000a')
$$, '42501', null, 'no votes after voting closes');
reset role;
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select throws_ok($$
  update lights.votes set house_id = '00000000-0000-4000-9000-00000000000a'
$$, '42501', null, 'no vote changes after voting closes');
reset role;

select tests.phase('voting');
update lights.settings set voting_open = false;
select tests.act_as('00000000-0000-4000-8000-0000000000e2');
select throws_ok($$
  insert into lights.votes (user_id, house_id)
  values (auth.uid(), '00000000-0000-4000-9000-00000000000a')
$$, '42501', null, 'the voting_open kill switch blocks votes inside the window');
reset role;
select is(lights.voting_is_open(), false, 'voting_is_open() honors the kill switch');

-- A vote whose house gets hidden ---------------------------------------------------------
update lights.settings set voting_open = true;
select tests.act_as('00000000-0000-4000-8000-0000000000ad');
update lights.houses set status = 'hidden' where id = '00000000-0000-4000-9000-00000000000b';
reset role;
select is((select count(*)::int from lights.votes where house_id = '00000000-0000-4000-9000-00000000000b'), 2,
  'hiding a house keeps the votes cast for it (they just stop counting)');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from lights.houses where id = '00000000-0000-4000-9000-00000000000b'), 0,
  'the voter no longer sees the hidden house');
select lives_ok($$
  update lights.votes set house_id = '00000000-0000-4000-9000-00000000000a'
$$, 'a voter whose house was hidden can move their vote');
select is((select house_id::text from lights.votes), '00000000-0000-4000-9000-00000000000a',
  'the moved vote now points at an approved house');
reset role;

select * from finish();
rollback;
