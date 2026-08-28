-- Elite Homz's flat count was its light count too.
--
-- Nine for nine: 961 is exactly what all three of its invoices bill for.
UPDATE societies SET flat_count = NULL WHERE name = 'Elite Homz' AND flat_count = 961;
