-- Cancelling a paid order: who, when and why, and the record that its refund
-- was paid back outside the app. All nullable — existing orders have none.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByName" TEXT,
ADD COLUMN "cancelReason" TEXT,
ADD COLUMN "refundedAt" TIMESTAMP(3),
ADD COLUMN "refundedByName" TEXT,
ADD COLUMN "refundRef" TEXT;
