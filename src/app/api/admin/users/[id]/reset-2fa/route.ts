import { NextResponse } from "next/server";
import { resetTwoFactor } from "@/lib/auth/resetTwoFactor";
import { withAuth } from "@/lib/auth/route";
import { prisma } from "@/lib/catalogue/db";

export const runtime = "nodejs";

/**
 * A colleague lost their phone and their backup codes. There is no
 * self-service path by design — whoever could trigger one alone would not
 * need the second factor in the first place.
 */
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
	"users:manage",
	async (_request, { params }) => {
		const { id } = await params;
		const target = await prisma.user.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!target) {
			return NextResponse.json({ error: "not_found" }, { status: 404 });
		}
		await resetTwoFactor(target.id);
		return NextResponse.json({ ok: true });
	},
);
