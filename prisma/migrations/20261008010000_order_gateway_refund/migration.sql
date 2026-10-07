-- A refund sent back through the payment gateway. Nullable, no backfill: an
-- existing cancelled order was refunded by hand or is still owed.
ALTER TABLE "Order" ADD COLUMN "refundRequestedAt" TIMESTAMP(3),
ADD COLUMN "refundError" TEXT;

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'ORDER_REFUNDED';
