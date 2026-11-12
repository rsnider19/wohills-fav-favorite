-- storage.objects policies for the `houses` bucket, exercised directly in SQL
-- (the Storage API runs the same RLS as the caller's role). The HTTP smoke test
-- (supabase/tests/lights-smoke.mjs) covers the real upload path.
begin;
\ir lights_fixtures.psql
select plan(18);

select is((select (public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'houses'),
  '(t,10485760,"{image/jpeg,image/png,image/webp}")', 'houses bucket: public, 10 MiB, jpeg/png/webp');

-- Owners: own folder, submission window --------------------------------------------------
select tests.phase('submissions');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select lives_ok($$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('houses', '00000000-0000-4000-8000-0000000000e1/one.jpg', auth.uid()::text)
$$, 'an owner uploads into their own folder while submissions are open');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('houses', '00000000-0000-4000-8000-00000000000a/sneaky.jpg', auth.uid()::text)
$$, '42501', null, 'an owner cannot upload into someone else''s folder');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('houses', 'loose.jpg', auth.uid()::text)
$$, '42501', null, 'an owner cannot upload outside a folder');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('floats', '00000000-0000-4000-8000-0000000000e1/x.jpg', auth.uid()::text)
$$, '42501', null, 'the houses policies do not open the floats bucket');
-- No UPDATE policy for owners: the update matches 0 rows (no error).
update storage.objects set metadata = '{"swapped":true}'
  where bucket_id = 'houses' and name = '00000000-0000-4000-8000-0000000000e1/one.jpg';
reset role;
select is((select metadata from storage.objects where name = '00000000-0000-4000-8000-0000000000e1/one.jpg'),
  null, 'owners cannot overwrite an object (no update policy)');

select tests.phase('overlap');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select lives_ok($$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('houses', '00000000-0000-4000-8000-0000000000e1/two.jpg', auth.uid()::text)
$$, 'late submitters can still upload after voting opens');
select is((select count(*)::int from storage.objects where bucket_id = 'houses'), 2,
  'an owner can list their own folder');
reset role;

select tests.phase('closed');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('houses', '00000000-0000-4000-8000-0000000000e1/three.jpg', auth.uid()::text)
$$, '42501', null, 'no uploads after submissions close');
reset role;

-- Deletes: owners only before voting opens -------------------------------------------------
select set_config('storage.allow_delete_query', 'true', true);
select tests.phase('overlap');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
delete from storage.objects where bucket_id = 'houses' and name like '00000000-0000-4000-8000-0000000000e1/%';
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'houses'), 2,
  'owners cannot delete photos after voting opens');

select tests.phase('submissions');
select tests.act_as('00000000-0000-4000-8000-0000000000e1');
delete from storage.objects where bucket_id = 'houses' and name = '00000000-0000-4000-8000-0000000000e1/two.jpg';
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'houses'), 1,
  'owners delete their own photos before voting opens');

-- Admin ---------------------------------------------------------------------------------
select tests.phase('closed');
select tests.act_as('00000000-0000-4000-8000-0000000000ad');
select lives_ok($$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('houses', '00000000-0000-4000-8000-0000000000e1/replacement.jpg', auth.uid()::text)
$$, 'the admin uploads anywhere in the bucket, any time');
select lives_ok($$
  update storage.objects set metadata = '{"by":"admin"}'
  where bucket_id = 'houses' and name = '00000000-0000-4000-8000-0000000000e1/one.jpg'
$$, 'the admin can replace an object');
delete from storage.objects where bucket_id = 'houses' and name = '00000000-0000-4000-8000-0000000000e1/one.jpg';
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'houses'), 1,
  'the admin deletes any object');

-- Other people's photos and the photo an entry shows ---------------------------------------
select tests.phase('submissions');
insert into storage.objects (bucket_id, name) values
  ('houses', '00000000-0000-4000-8000-00000000000a/theirs.jpg'),
  ('houses', '00000000-0000-4000-8000-00000000000c/shown.jpg'),
  ('houses', '00000000-0000-4000-8000-00000000000c/old.jpg');
update lights.houses set photo_url = tests.photo('00000000-0000-4000-8000-00000000000c/shown.jpg')
  where id = '00000000-0000-4000-9000-00000000000c';

select tests.act_as('00000000-0000-4000-8000-0000000000e1');
delete from storage.objects where bucket_id = 'houses' and name = '00000000-0000-4000-8000-00000000000a/theirs.jpg';
reset role;
select ok(exists (select 1 from storage.objects where name = '00000000-0000-4000-8000-00000000000a/theirs.jpg'),
  'an owner cannot delete someone else''s photo');

select tests.act_as('00000000-0000-4000-8000-00000000000c');
delete from storage.objects where bucket_id = 'houses' and name like '00000000-0000-4000-8000-00000000000c/%';
reset role;
select ok(exists (select 1 from storage.objects where name = '00000000-0000-4000-8000-00000000000c/shown.jpg'),
  'an owner cannot delete the photo their entry shows (no delete-and-reupload swap)');
select ok(not exists (select 1 from storage.objects where name = '00000000-0000-4000-8000-00000000000c/old.jpg'),
  'an owner can still delete a photo their entry no longer shows');

select tests.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('houses', '00000000-0000-4000-8000-0000000000f1/x.jpg', auth.uid()::text)
$$, '42501', null, 'an account without a phone cannot upload');
reset role;

select * from finish();
rollback;
