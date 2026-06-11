-- The 2026 lineup: one float per street. Themes, emoji, descriptions, and
-- photos are unknown until parade day — the admin fills them in from the
-- site (✏️ Edit / 📷 Photo buttons). An empty theme renders as a mystery
-- card before voting opens and falls back to the street name after.
insert into public.entries (entry_number, theme, street, description, emoji, image_url) values
  (1, '', 'Blindbrook',       null, '🎆', null),
  (2, '', 'NewCopperMark',    null, '🎆', null),
  (3, '', 'Blackstone',       null, '🎆', null),
  (4, '', 'Shelley & Tenney', null, '🎆', null),
  (5, '', 'Mission Hills',    null, '🎆', null),
  (6, '', 'Candlewood',       null, '🎆', null);
