-- Gaur Saundaryam's flat count was its light count too.
--
-- Twelve for twelve: 2,362 is exactly what its first invoice bills for.
UPDATE societies SET flat_count = NULL WHERE name = 'Gaur Saundaryam' AND flat_count = 2362;
