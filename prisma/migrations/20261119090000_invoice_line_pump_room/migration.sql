-- AlterTable
ALTER TABLE "billing_invoice_lines" ADD COLUMN     "pump_meter_id" TEXT;

-- AddForeignKey
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_pump_meter_id_fkey" FOREIGN KEY ("pump_meter_id") REFERENCES "ems_pump_meters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

