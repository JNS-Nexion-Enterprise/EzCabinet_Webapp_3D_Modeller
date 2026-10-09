-- Order updates by email as well as WhatsApp. Every existing row is a
-- WhatsApp message, which is the default.
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL');

ALTER TABLE "Notification" ADD COLUMN "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP';
