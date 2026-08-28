-- Surface light 18W.
--
-- Gaur Saundaryam's basement carries five of these alongside its 42 tube
-- lights; three were replaced and two were not, and the two that were not are
-- what the agreed benchmark deducts. The catalog has 12W and 9W surface
-- lights, neither of which is this one.
--
-- Its own migration, ahead of the society that needs it: the backfill joins
-- the catalog by name and raises if the name is absent.
INSERT INTO device_types (id, name, role, default_wattage, status, in_catalog, created_at)
VALUES ('dt-surface18', 'Surface light 18W', 'original', 18, 'approved', true, now())
ON CONFLICT DO NOTHING;
