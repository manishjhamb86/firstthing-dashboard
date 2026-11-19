-- More than one Smart Life / Tuya account for the tank sensors (2026-11-19).
ALTER TABLE "tank_api_config" ADD COLUMN "label" TEXT;
ALTER TABLE "water_tanks" ADD COLUMN "tank_api_config_id" TEXT;
ALTER TABLE "water_tanks" ADD CONSTRAINT "water_tanks_tank_api_config_id_fkey" FOREIGN KEY ("tank_api_config_id") REFERENCES "tank_api_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Every tank synced so far came from the one account there was.
UPDATE "water_tanks" SET "tank_api_config_id" = 'singleton' WHERE EXISTS (SELECT 1 FROM "tank_api_config" WHERE "id" = 'singleton');
