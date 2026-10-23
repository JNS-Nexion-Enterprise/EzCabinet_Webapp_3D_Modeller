import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One Prisma client for the process, reused across hot reloads in dev — a
 * fresh one per module reload would otherwise exhaust the local Postgres
 * connection limit within a few edits.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma Postgres hands out `sslmode=require`. pg 8 already treats that as
// verify-full, but warns on startup that pg 9 will weaken it to libpq's
// "encrypt, don't verify". Spelling out verify-full keeps today's behaviour
// past that upgrade and silences the warning.
const verifyFull = (url: string | undefined) =>
	url?.replace(
		/([?&]sslmode=)(?:prefer|require|verify-ca)(?=&|$)/,
		"$1verify-full",
	);

// Vercel's Prisma Postgres marketplace integration injects the connection
// string under its own prefix; DATABASE_URL is what .env and the Prisma CLI use.
const adapter = new PrismaPg({
	connectionString: verifyFull(
		process.env.DATABASE_URL ?? process.env.STORAGE_DATABASE_URL,
	),
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}
