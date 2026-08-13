-- CreateEnum
CREATE TYPE "admin_permission" AS ENUM ('manage_admins', 'manage_users');

-- CreateEnum
CREATE TYPE "portal_authority" AS ENUM ('office_bearer', 'committee', 'manager');

-- CreateEnum
CREATE TYPE "society_status" AS ENUM ('prospect', 'active', 'suspended', 'terminated');

-- CreateEnum
CREATE TYPE "service_line" AS ENUM ('lighting', 'pumps', 'solar', 'wastewater');

-- CreateEnum
CREATE TYPE "circuit_state" AS ENUM ('surveyed', 'eligible', 'benchmarking', 'benchmark_confirmed', 'awaiting_installation', 'active_billing', 'retired');

-- CreateTable
CREATE TABLE "societies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flat_count" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "society_status" NOT NULL DEFAULT 'prospect',
    "next_election_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "societies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "society_contacts" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "post" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "society_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "portal_authority" "portal_authority",
    "society_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" "admin_permission"[],
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuits" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "service_line" "service_line" NOT NULL,
    "light_type" TEXT NOT NULL,
    "metered_light_count" INTEGER NOT NULL,
    "represented_light_count" INTEGER NOT NULL,
    "wattage" DOUBLE PRECISION NOT NULL,
    "working_hours" DOUBLE PRECISION,
    "eligibility_checklist" JSONB,
    "state" "circuit_state" NOT NULL DEFAULT 'surveyed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "society_contacts_society_id_idx" ON "society_contacts"("society_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_society_id_idx" ON "profiles"("society_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "circuits_society_id_idx" ON "circuits"("society_id");

-- AddForeignKey
ALTER TABLE "society_contacts" ADD CONSTRAINT "society_contacts_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
