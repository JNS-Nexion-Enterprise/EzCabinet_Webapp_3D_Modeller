-- A deleted staff account must not blank "who marked this paid": the name is
-- kept on the order itself (lib/auth/deleteUser.ts). The foreign key is
-- already ON DELETE SET NULL (20260920020643_auth).

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paidByName" TEXT;

-- Backfill from the accounts that still exist.
UPDATE "Order" o SET "paidByName" = u."name" FROM "user" u WHERE u."id" = o."paidByUserId";
