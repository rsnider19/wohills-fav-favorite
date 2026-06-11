-- Placeholder parade floats — replace with the real lineup before the parade.
-- Each street builds one float around a "Dynamic Duos" theme.
-- image_url placeholders use picsum.photos for local development; on parade
-- day, upload real photos to the public `floats` storage bucket and paste
-- their public URLs here (or update the rows in the dashboard).
insert into public.entries (entry_number, theme, street, description, emoji, image_url) values
  (1, 'Stars & Stripes',       'Shelley Ct',      'A fifty-foot flag you can hear snapping from two blocks away.', '🇺🇸', 'https://picsum.photos/seed/float1/800/600'),
  (2, 'Peanut Butter & Jelly', 'Mission Hills',   'Two slices of bread have never been this patriotic.', '🥪', 'https://picsum.photos/seed/float2/800/600'),
  (3, 'Thunder & Lightning',   'Highgate Ct',     'A storm cloud on wheels, complete with sound effects.', '⚡', 'https://picsum.photos/seed/float3/800/600'),
  (4, 'Salt & Pepper',         'Plesenton Dr',    'Two giant shakers seasoning the parade route.', '🧂', 'https://picsum.photos/seed/float4/800/600'),
  (5, 'Rocket & Booster',      'Brookside Dr',    'A two-stage rocket with a working countdown.', '🚀', 'https://picsum.photos/seed/float5/800/600'),
  (6, 'Liberty & Justice',     'Foxboro Ct',      'Lady Liberty and a gavel-wielding judge on a flatbed.', '🗽', 'https://picsum.photos/seed/float6/800/600');
