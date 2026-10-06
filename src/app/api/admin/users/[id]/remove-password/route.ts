import { NextResponse } from "next/server";
import { removePassword } from "@/lib/auth/removePassword";
import { withAuth } from "@/lib/auth/route";
import { prisma } from "@/lib/catalogue/db";

export const runtime = "nodejs";

/**
 * Makes a Google-linked staff account Google-only — the way out for someone
 * who never uses their invite password and so cannot enrol 2FA. Nobody can
 * set another person's password, so removal is all there is.
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
		if ((await removePassword(target.id)) === "no_other_sign_in") {
			return NextResponse.json({ error: "no_other_sign_in" }, { status: 409 });
		}
		// Ids only, no emails.
		console.info("Password removed", { actor: actor.id, target: target.id });
		return NextResponse.json({ ok: true });
	},
);
