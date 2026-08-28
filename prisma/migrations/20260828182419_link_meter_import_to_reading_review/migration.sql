-- AlterTable
ALTER TABLE "meter_csv_imports" ADD COLUMN     "raw_reading_file_id" TEXT;

-- AddForeignKey
ALTER TABLE "meter_csv_imports" ADD CONSTRAINT "meter_csv_imports_raw_reading_file_id_fkey" FOREIGN KEY ("raw_reading_file_id") REFERENCES "raw_reading_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

