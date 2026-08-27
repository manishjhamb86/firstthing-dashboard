-- Device types the 19 societies need that the catalog does not have.
--
-- A circuit_devices row points at a device_type, so these must exist before
-- any society is inserted. Idempotent: re-running changes nothing.
--
-- Street lights are here because they share a basement circuit at Aditya Mega
-- City and are excluded from the calculation — which still requires a device
-- row, since the exclusion works by taking that row's theoretical load off
-- both sides of the savings figure.

INSERT INTO device_types (id, name, role, default_wattage, status, in_catalog, created_at)
VALUES ('dt-street50', 'Street light 50W', 'original', 50, 'approved', true, now())
ON CONFLICT (id) DO NOTHING;

-- Aditya Urban Casa's lift lobby is 16 surface lights at 9W. The catalog has
-- a 12W surface light and a 9W bulb, neither of which is this.
INSERT INTO device_types (id, name, role, default_wattage, status, in_catalog, created_at)
VALUES ('dt-surface9', 'Surface light 9W', 'original', 9, 'approved', true, now())
ON CONFLICT (id) DO NOTHING;
