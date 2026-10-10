import { NextResponse } from "next/server";
import { parseCustomerName } from "@/lib/auth/customerName";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/catalogue/db";

export const runtime = "nodejs";

/**
 * The name step after a first code sign-in (`/[lang]/welcome`). A code
 * sign-in asks for the address only and the sign-in request is held to
 * `email` and `otp`, so the name arrives here, by itself.
 *
 * It writes `name` on the caller's own row and nothing else, and only while
 * that row has none. There is no rename: nothing in the app offers one, and
 * a session that has signed in but not passed the passkey step must not be
 * able to relabel an account that already has a name.
 *
 * The write carries that condition itself, on the name this request read:
 * of two requests that both saw no name, the first one's stands and the
 * second is told the name is set.
 *
 * `currentUser()` only: with AUTH_ENABLED off there is no demo-customer
 * fallback here, because the demo customer is already named.
 */
export async function POST(request: Request) {
	const user = await currentUser();
	if (!user) {
		return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
	}
	if (user.role !== "CUSTOMER") {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}
	if (!user.mustSetName) {
		return NextResponse.json({ error: "name_set" }, { status: 409 });
	}
	const body: unknown = await request.json().catch(() => null);
	const parsed = parseCustomerName((body as { name?: unknown } | null)?.name);
	if ("error" in parsed) {
		return NextResponse.json({ error: parsed.error }, { status: 400 });
	}
	const { count } = await prisma.user.updateMany({
		where: { id: user.id, role: "CUSTOMER", name: user.name },
		data: { name: parsed.name },
	});
	if (count === 0) {
		return NextResponse.json({ error: "name_set" }, { status: 409 });
	}
	return NextResponse.json({ ok: true });
}
