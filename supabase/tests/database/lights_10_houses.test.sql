-- lights.houses: visibility, submission window, geofence, one per phone,
-- address dedupe, moderation (status), and the owner edit lock.
begin;
\ir lights_fixtures.psql
select plan(50);

-- Photos the test users have "uploaded" (photo_url must name an existing object).
insert into storage.objects (bucket_id, name) values
  ('houses', '00000000-0000-4000-8000-0000000000e1/1.jpg'),
  ('houses', '00000000-0000-4000-8000-0000000000e2/1.jpg'),
  ('houses', '00000000-0000-4000-8000-0000000000e2/2.jpg'),
  ('houses', '00000000-0000-4000-8000-00000000000a/2.jpg'),
  ('houses', '00000000-0000-4000-8000-0000000000f1/1.jpg');

-- Visibility ----------------------------------------------------------------------
select tests.phase('submissions');

select tests.act_as_anon();
select is((select count(*)::int from lights.houses), 2, 'anon sees only approved houses');
reset role;

select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from lights.houses), 2, 'a voter sees only approved houses');
reset role;

select tests.act_as('00000000-0000-4000-8000-00000000000c');
select is((select count(*)::int from lights.houses), 3, 'an owner also sees their own pending house');
reset role;

select tests.act_as('00000000-0000-4000-8000-00000000000d');
select ok(exists (select 1 from lights.houses where status = 'hidden'),
  'an owner sees their own hidden house');
reset role;

select tests.act_as('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from lights.houses), 4, 'the admin sees every house');
reset role;

-- Submitting --------------------------------------------------------------------------
select tests.act_as('00000000-0000-4000-8000-0000000000e2');
select lives_ok($$
  insert into lights.houses (address, lat, lng, photo_url, title)
  values ('7000 Blackstone Drive', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e2/1.jpg',
          'North Pole North')
$$, 'a signed-in neighbor submits a house while submissions are open');
select is((select status from lights.houses where submitted_by = auth.uid()), 'pending',
  'a new submission is pending');
select is((select address_key from lights.houses where submitted_by = auth.uid()),
  '7000 blackstone dr', 'address_key is the normalized street line');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7010 Blackstone Dr', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e2/2.jpg')
$$, '23505', null, 'one house per phone');
reset role;

select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url, status)
  values ('7020 Blackstone Dr', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg',
          'approved')
$$, '42501', null, 'a submitter cannot set status (no column grant)');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('1221 CANDLEWOOD DRIVE, Columbus, OH 43235', 40.1231, -83.0516,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg')
$$, '23505', null, 'the same address in a different spelling is a duplicate');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('100 N High St', 39.9612, -82.9988,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg')
$$, '42501', 'new row violates row-level security policy for table "houses"',
  'a pin outside the geofence is rejected');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7030 Blackstone Dr', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-00000000000a/1.jpg')
$$, '42501', 'photo_url must be a photo you uploaded to the houses bucket',
  'a submitter cannot use a photo from someone else''s folder');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7030 Blackstone Dr', 40.1370, -83.0590, 'https://evil.example/x.jpg')
$$, '42501', 'photo_url must be a photo you uploaded to the houses bucket',
  'a submitter cannot use an outside photo URL');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7030 Blackstone Dr', 40.1370, -83.0590,
          'https://evil.example/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg')
$$, '42501', 'photo_url must be a photo you uploaded to the houses bucket',
  'a submitter cannot use a look-alike photo path on another host (swappable after approval)');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7030 Blackstone Dr', 40.1370, -83.0590,
          tests.photo('00000000-0000-4000-8000-0000000000e1/1.jpg?v=/../x'))
$$, '42501', 'photo_url must be a photo you uploaded to the houses bucket',
  'a photo URL with a query string or path tricks is refused');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7030 Blackstone Dr', 40.1370, -83.0590,
          tests.photo('00000000-0000-4000-8000-0000000000e1/not-uploaded-yet.jpg'))
$$, '42501', 'photo_url must be a photo you uploaded to the houses bucket',
  'a submitter cannot point at a photo they have not uploaded (it could be filled in after approval)');
select throws_ok($$
  insert into lights.houses (submitted_by, address, lat, lng, photo_url)
  values ('00000000-0000-4000-8000-0000000000e2', '7040 Blackstone Dr', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg')
$$, '42501', null, 'a submitter cannot submit on behalf of someone else');
reset role;

select tests.act_as_anon();
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7050 Blackstone Dr', 40.1370, -83.0590, 'https://example.test/x.jpg')
$$, '42501', null, 'anon cannot submit');
reset role;

select tests.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7050 Blackstone Dr', 40.1370, -83.0590,
          tests.photo('00000000-0000-4000-8000-0000000000f1/1.jpg'))
$$, '42501', 'new row violates row-level security policy for table "houses"',
  'an account without a phone (email or anonymous) cannot submit');
reset role;

-- Submission window
select tests.phase('before_submissions');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7060 Blackstone Dr', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg')
$$, '42501', null, 'no submissions before the window opens');
reset role;

select tests.phase('closed');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7060 Blackstone Dr', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg')
$$, '42501', null, 'no submissions after the window closes');
reset role;

select tests.phase('submissions');
update lights.settings set submissions_open = false;
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select throws_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7060 Blackstone Dr', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg')
$$, '42501', null, 'the submissions_open kill switch blocks submissions');
reset role;

select tests.phase('overlap');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select lives_ok($$
  insert into lights.houses (address, lat, lng, photo_url)
  values ('7060 Blackstone Dr', 40.1370, -83.0590,
          'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-0000000000e1/1.jpg')
$$, 'late entries are accepted after voting opens while submissions are open');
reset role;

-- Moderation -------------------------------------------------------------------------
select tests.phase('submissions');
select tests.act_as('00000000-0000-4000-8000-00000000000c');
select throws_ok($$
  update lights.houses set status = 'approved' where id = '00000000-0000-4000-9000-00000000000c'
$$, '42501', 'only the admin can change an entry''s status',
  'an owner cannot approve their own entry');
reset role;

select tests.phase('overlap');
select tests.act_as('00000000-0000-4000-8000-00000000000c');
select lives_ok($$
  update lights.houses set status = 'approved' where id = '00000000-0000-4000-9000-00000000000c'
$$, 'after voting opens an owner''s update matches no rows (no error)');
reset role;
select is((select status from lights.houses where id = '00000000-0000-4000-9000-00000000000c'),
  'pending', 'an owner still cannot approve their entry after voting opens');

select tests.act_as('00000000-0000-4000-8000-0000000000e1');
update lights.houses set status = 'hidden', title = 'pwned'
  where id = '00000000-0000-4000-9000-00000000000a';
reset role;
select is((select (status, title)::text from lights.houses where id = '00000000-0000-4000-9000-00000000000a'),
  '(approved,"The Griswold Special")', 'a non-owner cannot change someone else''s house');

select tests.act_as('00000000-0000-4000-8000-0000000000ad');
select lives_ok($$
  update lights.houses set status = 'approved' where id = '00000000-0000-4000-9000-00000000000c'
$$, 'the admin approves an entry (even after voting opens)');
select lives_ok($$
  update lights.houses set title = 'Fixed by admin' where id = '00000000-0000-4000-9000-00000000000a'
$$, 'the admin edits an entry after voting opens');
reset role;
select is((select (status, title)::text from lights.houses where id = '00000000-0000-4000-9000-00000000000a'),
  '(approved,"Fixed by admin")', 'an admin edit keeps the entry approved');
select is((select status from lights.houses where id = '00000000-0000-4000-9000-00000000000c'),
  'approved', 'the admin''s approval sticks');

-- Owner edits before voting opens ------------------------------------------------------
select tests.phase('submissions');
select tests.act_as('00000000-0000-4000-8000-00000000000a');
select lives_ok($$
  update lights.houses set title = 'Brighter Now' where id = '00000000-0000-4000-9000-00000000000a'
$$, 'an owner edits their entry before voting opens');
reset role;
select is((select status from lights.houses where id = '00000000-0000-4000-9000-00000000000a'),
  'pending', 'an owner edit sends an approved entry back to pending');

select tests.act_as('00000000-0000-4000-8000-00000000000a');
select throws_ok($$
  update lights.houses set lat = 39.9612, lng = -82.9988 where id = '00000000-0000-4000-9000-00000000000a'
$$, '42501', 'new row violates row-level security policy for table "houses"',
  'an owner cannot move the pin outside the geofence');
select throws_ok($$
  update lights.houses set address = '800 Blind Brook Drive' where id = '00000000-0000-4000-9000-00000000000a'
$$, '23505', null, 'an owner cannot change to an address already entered');
select throws_ok($$
  update lights.houses set photo_url = 'https://evil.example/x.jpg' where id = '00000000-0000-4000-9000-00000000000a'
$$, '42501', 'photo_url must be a photo you uploaded to the houses bucket',
  'an owner cannot point the photo outside their folder');
select lives_ok($$
  update lights.houses
     set photo_url = 'http://127.0.0.1:55321/storage/v1/object/public/houses/00000000-0000-4000-8000-00000000000a/2.jpg'
   where id = '00000000-0000-4000-9000-00000000000a'
$$, 'an owner replaces the photo with one from their folder');
select throws_ok($$
  update lights.houses set created_at = now() - interval '1 year' where id = '00000000-0000-4000-9000-00000000000a'
$$, '42501', null, 'timestamps are not client-writable');
reset role;

select tests.act_as('00000000-0000-4000-8000-00000000000d');
update lights.houses set title = 'Let me back in' where id = '00000000-0000-4000-9000-00000000000d';
reset role;
select is((select (status, title)::text from lights.houses where id = '00000000-0000-4000-9000-00000000000d'),
  '(hidden,"Let me back in")', 'an owner edit leaves a hidden entry hidden (no way back into the queue)');

select tests.act_as('00000000-0000-4000-8000-00000000000b');
select lives_ok($$
  delete from lights.houses where id = '00000000-0000-4000-9000-00000000000b'
$$, 'an owner can withdraw before voting opens');
reset role;
select ok(not exists (select 1 from lights.houses where id = '00000000-0000-4000-9000-00000000000b'),
  'the withdrawn house is gone');

-- The edit lock -------------------------------------------------------------------------
select tests.phase('overlap');
select tests.act_as('00000000-0000-4000-8000-00000000000a');
update lights.houses set title = 'Swapped after votes' where id = '00000000-0000-4000-9000-00000000000a';
delete from lights.houses where id = '00000000-0000-4000-9000-00000000000a';
reset role;
select is((select title from lights.houses where id = '00000000-0000-4000-9000-00000000000a'),
  'Brighter Now', 'an owner cannot edit after voting opens');
select ok(exists (select 1 from lights.houses where id = '00000000-0000-4000-9000-00000000000a'),
  'an owner cannot withdraw after voting opens');

update lights.settings set voting_open = false;
select tests.act_as('00000000-0000-4000-8000-00000000000a');
update lights.houses set title = 'Swapped during a pause' where id = '00000000-0000-4000-9000-00000000000a';
reset role;
select is((select title from lights.houses where id = '00000000-0000-4000-9000-00000000000a'),
  'Brighter Now', 'pausing voting (kill switch) does not unlock owner edits');

select tests.phase('submissions');
update lights.settings set voting_opens_at = null;
select is(lights.owner_edits_allowed(), false,
  'with no scheduled voting start, owner edits are locked (fail closed)');

-- Address normalization -------------------------------------------------------------------
select is(lights.normalize_address('1221 Candlewood Drive, Columbus, OH 43235'), '1221 candlewood dr',
  'normalize: suffix and city/state/ZIP after a comma');
select is(lights.normalize_address('  1221   candlewood dr.  '), '1221 candlewood dr',
  'normalize: case, punctuation and spacing');
select is(lights.normalize_address('920 Clubview Boulevard South Columbus Ohio 43235-1234'),
  '920 clubview blvd s', 'normalize: trailing city/state/ZIP without commas, directions');
select is(lights.normalize_address('7000 Northway Drive'), '7000 northway dr',
  'normalize: only whole words are abbreviated');

select * from finish();
rollback;
