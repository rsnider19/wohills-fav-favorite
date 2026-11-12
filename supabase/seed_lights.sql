-- Local-only seed for the holiday lights contest (runs after seed.sql on
-- `supabase db reset`). Never run this against the hosted project.
--
-- Who's who (test phones sign in with code 123456, see config.toml):
--   +1 555-555-0100  no house  (make it the admin with contest-admin ADMIN_PHONE)
--   +1 555-555-0101  owns a PENDING house   ("my entry is waiting for approval")
--   +1 555-555-0102  no house  (a fresh voter / submitter)
--   +1 555-555-0103  owns an APPROVED house ("Your house" instead of a vote button)
--   +1 555-555-0104  no house  (a second fresh voter / submitter)
-- Everyone else below is a fake neighbor (phones 1555999xxxx) who can't sign in.
--
-- Photos are picsum.photos placeholders (they need network access).

-- Refuse to run anywhere but a freshly reset local database (e.g. a stray
-- `db push --include-seed` against the live project): real neighbors' phones
-- are never in the fictional 555 range the local test accounts use.
do $$
begin
  if exists (select 1 from auth.users where coalesce(phone, '') !~ '^1555') then
    raise exception 'seed_lights.sql is local-only: auth.users has real accounts, refusing to seed';
  end if;
end;
$$;

-- Windows relative to the reset time, so the local site starts in the
-- "submissions open, voting opens in a week" phase. Use
-- `npm run contest-admin -- --contest lights` to move between phases.
update lights.settings set
  submissions_open = true,
  voting_open = true,
  results_visible = false,
  submissions_open_at = now() - interval '1 day',
  submissions_close_at = now() + interval '30 days',
  voting_opens_at = now() + interval '7 days',
  voting_closes_at = now() + interval '14 days';

-- Users. GoTrue reads the token columns as strings, so they must be '' (not
-- null) for the test phones to sign in to these pre-made accounts.
insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000'::uuid, u.id, 'authenticated', 'authenticated',
       u.phone, now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', '', '', '', '', ''
from (values
  ('11111111-0000-4000-8000-000000000101'::uuid, '15555550101'),
  ('11111111-0000-4000-8000-000000000103'::uuid, '15555550103')
) as u (id, phone)
union all
select '00000000-0000-0000-0000-000000000000'::uuid,
       ('11111111-0000-4000-8000-' || lpad((900 + n)::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', '1555999' || lpad(n::text, 4, '0'), now(),
       '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', '', '', '', '', ''
from generate_series(1, 30) n;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, json_build_object('sub', u.id::text, 'phone', u.phone)::jsonb, 'phone', now(), now(), now()
from auth.users u
where u.id::text like '11111111-0000-4000-8000-%';

-- Houses: 5 approved, 2 pending, 1 hidden. Coordinates are real Worthington
-- Hills streets (inside the geofence); house numbers are illustrative.
insert into lights.houses (id, submitted_by, address, lat, lng, photo_url, title, status) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000103',
   '1221 Candlewood Dr', 40.12314, -83.05157, 'https://picsum.photos/seed/wh-lights-1/1200/900',
   'The Griswold Special', 'approved'),
  ('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000901',
   '800 Blind Brook Dr', 40.12927, -83.04397, 'https://picsum.photos/seed/wh-lights-2/1200/900',
   'Candy Cane Lane', 'approved'),
  ('22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000902',
   '920 Clubview Blvd S', 40.12474, -83.04227, 'https://picsum.photos/seed/wh-lights-3/1200/900',
   null, 'approved'),
  ('22222222-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000903',
   '7000 Blackstone Dr', 40.13700, -83.05900, 'https://picsum.photos/seed/wh-lights-4/1200/900',
   'Frosty''s Hideout', 'approved'),
  ('22222222-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000904',
   '7100 Shelley Ct', 40.13340, -83.06000, 'https://picsum.photos/seed/wh-lights-5/1200/900',
   null, 'approved'),
  ('22222222-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000101',
   '700 Mission Hills Ln', 40.12690, -83.04000, 'https://picsum.photos/seed/wh-lights-6/1200/900',
   'Waiting on the Admin', 'pending'),
  ('22222222-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000905',
   '7200 Markhaven Dr', 40.13350, -83.05680, 'https://picsum.photos/seed/wh-lights-7/1200/900',
   null, 'pending'),
  ('22222222-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000906',
   '7300 Copperfield Dr', 40.13350, -83.05870, 'https://picsum.photos/seed/wh-lights-8/1200/900',
   'Hidden by the Admin', 'hidden');

-- Votes from the fake neighbors 907..927 (inserted directly; the window isn't
-- open yet). Approved #1: 7, #2: 5, #4: 4, #3: 2, #5: 1; plus 2 on the hidden
-- house, which never count.
insert into lights.votes (user_id, house_id)
select ('11111111-0000-4000-8000-' || lpad((900 + n)::text, 12, '0'))::uuid,
       ('22222222-0000-4000-8000-' || lpad(case
          when n <= 13 then 1 when n <= 18 then 2 when n <= 22 then 4
          when n <= 24 then 3 when n <= 25 then 5 else 8 end::text, 12, '0'))::uuid
from generate_series(7, 27) n;
