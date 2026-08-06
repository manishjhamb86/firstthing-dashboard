-- CreateEnum
CREATE TYPE "admin_permission" AS ENUM ('manage_admins', 'manage_users');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" "admin_permission"[],
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: move any existing role='admin' profiles into admin_users
-- (full permissions, preserving their previous unrestricted admin access)
-- before the role enum below drops the 'admin' value entirely.
INSERT INTO "admin_users" ("id", "email", "password_hash", "is_active", "permissions", "created_at")
SELECT "id", COALESCE("email", "id"::text), "password_hash", true, ARRAY['manage_admins', 'manage_users']::"admin_permission"[], "created_at"
FROM "profiles"
WHERE "role" = 'admin';

DELETE FROM "profiles" WHERE "role" = 'admin';

-- AlterEnum
BEGIN;
CREATE TYPE "role_new" AS ENUM ('customer', 'inspection', 'socmgr');
ALTER TABLE "profiles" ALTER COLUMN "role" TYPE "role_new" USING ("role"::text::"role_new");
ALTER TYPE "role" RENAME TO "role_old";
ALTER TYPE "role_new" RENAME TO "role";
DROP TYPE "public"."role_old";
COMMIT;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;
