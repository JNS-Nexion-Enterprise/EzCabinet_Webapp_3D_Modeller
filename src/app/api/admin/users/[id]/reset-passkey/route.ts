import { NextResponse } from "next/server";
import { resetPasskeys } from "@/lib/auth/resetPasskeys";
import { withAuth } from "@/lib/auth/route";
import { prisma } from "@/lib/catalogue/db";

export const runtime = "nodejs";

/** The only way back in for a customer who lost every passkey — see `resetPasskeys`. */
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
		// Ids only. The one action that removes a customer's second step leaves a trace.
		console.info("Passkeys reset", { actor: actor.id, target: target.id });
		return NextResponse.json({ ok: true });
	},
);
