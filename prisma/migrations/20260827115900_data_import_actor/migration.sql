-- The actor every imported row belongs to.
--
-- It runs first because the catalog and the backfilled societies both point
-- at it, and several of those columns cannot be null.

-- The import's own actor.
--
-- Several imported rows require an owner that cannot be null, and a fresh
-- database has no people in it yet. This row is not a login: it is inactive,
-- and its password hash is of random bytes nobody kept, so both the row check
-- in resolveAdmin() and bcrypt refuse it independently.
INSERT INTO admin_users (id, email, password_hash, name, permissions, is_active, created_at)
VALUES ('sys-data-import', 'import@firsthing.invalid', '$2b$10$Ph9Uy9Wl1kkKQwGZ5Nr7ZOqW1cCk9uZ2vJQKZ3xY8mR6tN0aB4dLu',
        'Data import', ARRAY[]::admin_permission[], false, now())
ON CONFLICT DO NOTHING;
