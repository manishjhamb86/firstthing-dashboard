-- RG Residency's flat count was its light count too.
--
-- Thirteen for thirteen: 1,444 is exactly what its invoices bill for.
UPDATE societies SET flat_count = NULL WHERE name = 'RG Residency' AND flat_count = 1444;
