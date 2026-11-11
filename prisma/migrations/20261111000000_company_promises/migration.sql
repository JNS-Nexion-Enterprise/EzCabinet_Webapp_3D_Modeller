-- Hand-written (CLAUDE.md Known issue 12). Additive only: every existing row
-- takes the defaults, which claim no warranty and no installation until a
-- superadmin states the maker's own.

-- AlterTable
ALTER TABLE "CompanyDetails" ADD COLUMN     "warrantyYears" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "installationOffered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryWeeksMin" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "deliveryWeeksMax" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "damageReportDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "refundWorkingDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "dpoName" TEXT,
ADD COLUMN     "dpoEmail" TEXT,
ADD COLUMN     "policiesApproved" BOOLEAN NOT NULL DEFAULT false;
