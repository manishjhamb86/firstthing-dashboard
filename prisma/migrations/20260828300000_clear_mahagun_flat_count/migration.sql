-- Mahagun Puram's flat count was its light count too.
--
-- Fourteen for fourteen: 792 is exactly what its invoices bill for.
UPDATE societies SET flat_count = NULL WHERE name = 'Mahagun Puram' AND flat_count = 792;
