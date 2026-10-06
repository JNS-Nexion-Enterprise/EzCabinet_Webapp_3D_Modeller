-- Which terms of sale and refund policy an order was placed under
-- (docs/superpowers/specs/2026-10-07-legal-pages-design.md). Nullable:
-- existing orders predate the terms and agreed to nothing.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "termsVersion" TEXT,
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
