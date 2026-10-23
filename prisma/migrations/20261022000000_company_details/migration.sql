-- Hand-written (CLAUDE.md Known issue 12), checked with `prisma migrate diff`.
--
-- The two UPDATEs at the end are both here on purpose. Each database holds
-- only its own seed address (EzCabinet's, or the demo's), so one of them
-- matches nothing wherever this runs. A delivery whose pickup is neither is an
-- admin-typed address and stays `fromWorkshop = false`.

-- CreateTable
CREATE TABLE "CompanyDetails" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "ssmNumber" TEXT,
    "contactEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "closeTime" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankAccountName" TEXT NOT NULL,
    "bankAccountNumber" TEXT NOT NULL,
    "orderPrefix" TEXT NOT NULL,
    "savedById" TEXT,
    "savedByName" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyDetails_savedAt_idx" ON "CompanyDetails"("savedAt");

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "refPrefix" TEXT;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN "refPrefix" TEXT,
ADD COLUMN "fromWorkshop" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: EzCabinet's seed workshop.
UPDATE "Delivery" SET
    "fromWorkshop" = true,
    "pickupLat" = COALESCE("pickupLat", 2.9848868),
    "pickupLng" = COALESCE("pickupLng", 101.861807),
    "pickupGeocodedFor" = COALESCE("pickupGeocodedFor", "pickupAddress"),
    "pickupPostcode" = COALESCE("pickupPostcode", '43800'),
    "pickupCity" = COALESCE("pickupCity", 'Dengkil'),
    "pickupState" = COALESCE("pickupState", 'MY-10')
WHERE btrim("pickupAddress") = 'EzCabinet Sdn Bhd, Klang Valley, Selangor';

-- Backfill: the demo tenant's seed workshop.
UPDATE "Delivery" SET
    "fromWorkshop" = true,
    "pickupLat" = COALESCE("pickupLat", 3.0757),
    "pickupLng" = COALESCE("pickupLng", 101.5951),
    "pickupGeocodedFor" = COALESCE("pickupGeocodedFor", "pickupAddress"),
    "pickupPostcode" = COALESCE("pickupPostcode", '47500'),
    "pickupCity" = COALESCE("pickupCity", 'Subang Jaya'),
    "pickupState" = COALESCE("pickupState", 'MY-10')
WHERE btrim("pickupAddress") = 'JNS Nexion Enterprise, Subang Jaya Industrial Park, 47500 Subang Jaya, Selangor';
