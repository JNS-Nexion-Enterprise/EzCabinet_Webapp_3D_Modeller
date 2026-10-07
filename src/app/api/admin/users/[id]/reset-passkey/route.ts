import { NextResponse } from "next/server";
import { resetPasskeys } from "@/lib/auth/resetPasskeys";
import { withAuth } from "@/lib/auth/route";
import { prisma } from "@/lib/catalogue/db";

export const runtime = "nodejs";

/**
 * The only way back for someone who lost every passkey — see `resetPasskeys`.
 * A customer cannot get in without one; a staff member can, but cannot
 * confirm a guarded action (`lib/auth/stepUp.ts`) until they enrol again.
 */
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
	"users:manage",
	async (_request, { params }, actor) => {
		const { id } = await params;
		const target = await prisma.user.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!target) {
			return NextResponse.json({ error: "not_found" }, { status: 404 });
		}
		await resetPasskeys(target.id);
		// Ids only. The one action that removes someone's passkeys leaves a trace.
		console.info("Passkeys reset", { actor: actor.id, target: target.id });
		return NextResponse.json({ ok: true });
	},
	{ stepUp: true },
);
