-- AlterEnum
ALTER TYPE "inventory_unit_status" ADD VALUE 'sent_for_repair';

-- AlterEnum
ALTER TYPE "stock_movement_kind" ADD VALUE 'send_for_repair';

-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "historical" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "purchase_id" DROP NOT NULL;
