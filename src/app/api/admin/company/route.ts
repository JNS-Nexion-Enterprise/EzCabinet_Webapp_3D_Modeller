import { NextResponse } from "next/server";
import { z } from "zod";
import { BYPASS_USER } from "@/lib/auth/requireAuth";
import { withAuth } from "@/lib/auth/route";
import { companyDetailsSchema } from "@/lib/company/details";
import { saveCompany } from "@/lib/company/save";

export const runtime = "nodejs";

const bodySchema = z.object({
	details: companyDetailsSchema,
	confirmMove: z.boolean().default(false),
	// Required, not defaulted: a body that cannot say which version it edits
	// could overwrite anything.
	loadedAt: z.string().nullable(),
});

/**
 * Save the company's details (superadmin, passkey step-up).
 *
 * A save that would move unbooked deliveries answers 409 `confirm_move` with
 * what it would touch; the client asks, then repeats with `confirmMove: true`.
 * A save from a page opened before someone else's answers 409 `stale`.
 *
 * `BYPASS_USER.id` is not a real row, so a local bypass admin is recorded by
 * name only (`savedById` null), as `orders/[id]/paid` does.
 */
export const POST = withAuth(
	"company:manage",
	async (request, _ctx, user) => {
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "invalid_body", issues: parsed.error.issues },
				{ status: 400 },
			);
		}

		const result = await saveCompany(
			parsed.data.details,
			{ id: user.id === BYPASS_USER.id ? null : user.id, name: user.name },
			parsed.data.confirmMove,
			parsed.data.loadedAt,
		);
		if (!result.ok) {
			const { ok: _ok, ...body } = result;
			return NextResponse.json(body, { status: 409 });
		}
		return NextResponse.json(result);
	},
	{ stepUp: true },
);
