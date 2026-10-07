-- Step-up for guarded admin actions (lib/auth/stepUp.ts): when a passkey
-- authentication minted this session. `passkeyVerified` cannot say how long
-- ago, and an enrolment sets it with no authentication ceremony at all.
-- Null on every existing session: none of them has passed a step-up.

-- AlterTable
ALTER TABLE "session" ADD COLUMN "passkeyVerifiedAt" TIMESTAMP(3);
