import "server-only";
import { redirect } from "next/navigation";
import { authEnabled } from "@/lib/auth/enabled";
import { can } from "@/lib/auth/permissions";
import { BYPASS_USER } from "@/lib/auth/requireAuth";
import { type AuthUser, currentUser } from "@/lib/auth/session";

/**
 * Who may see an order: the account that placed it, or staff who can read
 * orders. Nobody else — holding the order's link is not enough, since that
 * link travels over WhatsApp and gets forwarded.
 *
 * Ownership is the account id, never the email: a checkout email is typed,
 * not verified. A caller that refuses must answer `notFound()`, so a
 * stranger cannot tell a real order from a made-up token.
 */
export function canViewOrder(
	viewer: Pick<AuthUser, "id" | "role"> | null,
	order: { userId: string },
): boolean {
	if (viewer === null) return false;
	return viewer.id === order.userId || can(viewer.role, "orders:read");
}

/**
 * The signed-in viewer of a customer page, or a trip through sign-in
 * that lands back on `path`, or to the name step for a customer who has not
 * given one, or to the passkey step for a customer whose session has not
 * passed one. With AUTH_ENABLED off (local only) the viewer is
 * the signed-in account if there is one, else the bypass superadmin.
 */
export async function viewerOf(lang: string, path: string): Promise<AuthUser> {
	const user = await currentUser();
	// Local only. A real session still wins: checkout always needs one, so
	// that is whose orders these are.
	if (!authEnabled()) return user ?? BYPASS_USER;
	if (user === null) {
		redirect(`/${lang}/sign-in?next=${encodeURIComponent(path)}`);
	}
	// The name comes first: it is what the device's passkey prompt will show.
	if (user.mustSetName) {
		redirect(`/${lang}/welcome?next=${encodeURIComponent(path)}`);
	}
	// A session alone is not a signed-in customer: the order's link
	// travels over WhatsApp, and so, sometimes, does a phone. The verify page
	// reads `currentUser()` directly, so this cannot loop.
	if (user.mustVerifyPasskey) {
		redirect(`/${lang}/verify?next=${encodeURIComponent(path)}`);
	}
	return user;
}
