-- Bestech Park View Residency's flat count was its light count too.
--
-- Eight for eight: 400 is exactly the number of lights its agreement
-- contracts for and that were installed. Same import error, same guard.
UPDATE societies SET flat_count = NULL WHERE name = 'Bestech Park View Residency' AND flat_count = 400;
