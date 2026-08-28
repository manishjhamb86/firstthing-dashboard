-- Ramp light 12W.
--
-- Arihant Arden's basement carries 9 of these on the same circuit as its 44
-- tube lights. They are not replaced, so they are excluded from the savings
-- calculation — which still needs a device row, because the exclusion works
-- by taking that row's theoretical load off both sides of the figure.
--
-- Its own migration, ahead of the society that needs it: the backfill joins
-- the catalog by name, and a name that is not there writes nothing at all.
INSERT INTO device_types (id, name, role, default_wattage, status, in_catalog, created_at)
VALUES ('dt-ramp12', 'Ramp light 12W', 'original', 12, 'approved', true, now())
ON CONFLICT DO NOTHING;
