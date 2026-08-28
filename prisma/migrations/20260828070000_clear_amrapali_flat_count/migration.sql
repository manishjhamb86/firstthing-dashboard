-- Amrapali Princely Estate's flat count was never a flat count.
--
-- It was imported as 2,310 — exactly the number of lights the first invoice
-- bills for — so the original import put a light count in the flats column.
-- The user confirmed (2026-08-28) they do not have the real figure, and this
-- repo's rule is to state a gap rather than carry a number nobody trusts,
-- which is why flat_count is nullable in the first place.
--
-- Guarded on the wrong value itself, not just the name: if someone has since
-- entered a real figure, this must not reach it.
UPDATE societies
   SET flat_count = NULL
 WHERE name = 'Amrapali Princely Estate'
   AND flat_count = 2310;
