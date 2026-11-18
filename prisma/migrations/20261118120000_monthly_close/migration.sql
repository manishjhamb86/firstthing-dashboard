-- CreateTable
CREATE TABLE "message_templates" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "monthly_close_emails" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "recipients" TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" TEXT[],
    "billing_invoice_id" TEXT,
    "report_ids" TEXT[],
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_by_id" TEXT NOT NULL,

    CONSTRAINT "monthly_close_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_close_emails_society_id_period_idx" ON "monthly_close_emails"("society_id", "period");

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_close_emails" ADD CONSTRAINT "monthly_close_emails_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_close_emails" ADD CONSTRAINT "monthly_close_emails_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

