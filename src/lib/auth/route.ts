import "server-only";
import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth/enabled";
import type { Permission } from "@/lib/auth/permissions";
import { AuthError, requireAuth } from "@/lib/auth/requireAuth";
import type { AuthUser } from "@/lib/auth/session";
import { recentStepUp } from "@/lib/auth/stepUp";

/**
 * Wraps a route handler in its permission check, so the check cannot be
 * forgotten halfway down a handler that already started writing.
 *
 * The second argument is whatever Next passes through — `{ params }` on a
 * dynamic route, nothing on a static one — and is handed on untouched.
 *
 * `stepUp` is for actions that move money or change who can get in: the
 * session must have passed a passkey ceremony in the last few minutes
 * (`lib/auth/stepUp.ts`). Skipped with auth off, where there is no session
 * to have passed one.
 */
export function withAuth<Ctx>(
	permission: Permission,
	handler: (
		request: Request,
		context: Ctx,
		user: AuthUser,
	) => Promise<Response> | Response,
	options?: { stepUp?: boolean },
) {
	return async (request: Request, context: Ctx): Promise<Response> => {
		let user: AuthUser;
		try {
			user = await requireAuth(permission);
		} catch (error) {
			if (error instanceof AuthError) {
				return NextResponse.json(
					{ error: error.message },
					{ status: error.status },
				);
			}
			throw error;
		}
		// A staff member mid-forced-change must not be able to drive the admin
		// API from a stale tab. The change-password flow itself does not run
		// through `withAuth`, so this cannot lock it out.
		if (user.mustChangePassword) {
			return NextResponse.json(
				{ error: "password_change_required" },
				{ status: 403 },
			);
		}
		// Same reasoning, second gate. Enrolment itself talks to /api/auth, not
		// to anything behind `withAuth`, so this cannot lock it out either.
		if (user.mustSetupTwoFactor) {
			return NextResponse.json(
				{ error: "two_factor_setup_required" },
				{ status: 403 },
			);
		}
		if (
			options?.stepUp &&
			authEnabled() &&
			!recentStepUp(user.passkeyVerifiedAt, new Date())
		) {
			return NextResponse.json({ error: "step_up_required" }, { status: 403 });
		}
		return handler(request, context, user);
	};
}
