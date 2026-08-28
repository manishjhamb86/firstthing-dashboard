-- The Hyde Park's flat count was its light count too.
--
-- Eleven for eleven: 1,600 is exactly the number its agreement contracts for
-- and that were installed.
UPDATE societies SET flat_count = NULL WHERE name = 'The Hyde Park' AND flat_count = 1600;
