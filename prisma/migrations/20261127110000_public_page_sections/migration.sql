-- AlterTable
ALTER TABLE "societies" ADD COLUMN     "public_hidden_sections" TEXT[] DEFAULT ARRAY[]::TEXT[];
