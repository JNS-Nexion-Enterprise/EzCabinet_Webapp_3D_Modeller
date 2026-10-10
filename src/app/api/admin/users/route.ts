import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inviteSchema } from "@/lib/auth/invite";
import { sendStaffInvite } from "@/lib/auth/inviteMail";
import { BYPASS_USER } from "@/lib/auth/requireAuth";
import { withAuth } from "@/lib/auth/route";
import { toUserRow, USER_ROW_SELECT } from "@/lib/auth/userRow";
import { prisma } from "@/lib/catalogue/db";

export const runtime = "nodejs";

export const GET = withAuth("users:manage", async (request) => {
	const url = new URL(request.url);
	const staffOnly = url.searchParams.get("staff") === "1";
	const search = url.searchParams.get("q")?.trim() ?? "";

	const users = await prisma.user.findMany({
		where: {
			...(staffOnly ? { NOT: { role: "CUSTOMER" } } : {}),
			...(search
				? {
						OR: [
							{ email: { contains: search, mode: "insensitive" as const } },
							{ name: { contains: search, mode: "insensitive" as const } },
						],
					}
				: {}),
		},
		select: USER_ROW_SELECT,
		orderBy: [{ role: "asc" }, { createdAt: "desc" }],
		take: 200,
	});
	return NextResponse.json({ users: users.map(toUserRow) });
});

/**
 * Invite: the superadmin creates the account and sets its first password,
 * handed over in person. The invitee is mailed the sign-in link, never the
 * password; `emailed` tells the form whether that mail went out.
 *
 * Step-up: it grants a role. Without it a held superadmin session could
 * promote an account it controls and pass every other guard as that account.
 */
export const POST = withAuth(
	"users:manage",
	async (request, _ctx, actor) => {
		const parsed = inviteSchema.safeParse(
			await request.json().catch(() => null),
		);
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "invalid_body", issues: parsed.error.issues },
				{ status: 400 },
			);
		}
		const { name, role, password } = parsed.data;
		// Better Auth stores every address lower-case, whichever way in made the
		// row, so a typed capital must not miss the customer it means.
		const email = parsed.data.email.toLowerCase();
		const invitedById = actor.id === BYPASS_USER.id ? null : actor.id;
		const mail = {
			to: email,
			inviterName: actor.name,
			role,
			base: process.env.BETTER_AUTH_URL ?? new URL(request.url).origin,
		};

		const existing = await prisma.user.findUnique({ where: { email } });
		if (existing) {
			// Not self-service escalation: this is a superadmin deliberately
			// granting a role on /admin/users, gated by users:manage. A row with a
			// Google sign-in keeps it and the `password` field of this form is
			// ignored. A row without one — an emailed-code customer — would be
			// left with no way in, since staff cannot use a code, so it gets the
			// invite's password exactly as a fresh invite does.
			if (existing.role !== "CUSTOMER") {
				return NextResponse.json({ error: "already_staff" }, { status: 409 });
			}
			const google = await prisma.account.findFirst({
				where: { userId: existing.id, providerId: "google" },
				select: { id: true },
			});
			// Hashed by Better Auth, so sign-in verifies it like any other.
			const passwordHash = google
				? null
				: await (await auth.$context).password.hash(password);
			// A customer row should carry no password — customers sign in with a
			// provider or a code. One that does was made by someone other than the address's
			// owner (public password sign-up was open until it was closed), so the
			// password and any session it opened go before the row gains a role.
			// `emailVerified` then follows the invite's own reasoning below: the
			// superadmin typing the address is the assertion that it is theirs, and
			// Better Auth will not link Google to an unverified row.
			await prisma.$transaction([
				prisma.account.deleteMany({
					where: { userId: existing.id, providerId: "credential" },
				}),
				prisma.session.deleteMany({ where: { userId: existing.id } }),
				...(passwordHash
					? [
							prisma.account.create({
								data: {
									id: randomUUID(),
									// Better Auth's own shape for a password sign-in.
									accountId: existing.id,
									providerId: "credential",
									userId: existing.id,
									password: passwordHash,
								},
							}),
						]
					: []),
				prisma.user.update({
					where: { id: existing.id },
					data: {
						role,
						invitedById,
						emailVerified: true,
						// Empty if they left before the name step.
						name: existing.name || name,
						...(passwordHash ? { mustChangePassword: true } : {}),
					},
				}),
			]);
			// Once more, now that the role is committed. A code sign-in could land
			// between the delete above and the commit, while the row was still a
			// customer's, and leave a customer-made session on a staff row. From
			// here `refuseStaffCodeSession` refuses any new one, and one already
			// past that check is deleted by `dropCodeSessionIfNotCustomer`.
			await prisma.session.deleteMany({ where: { userId: existing.id } });
			const passwordSet = passwordHash !== null;
			const emailed = await sendStaffInvite({
				...mail,
				name: existing.name || name,
				hasPassword: passwordSet,
			});
			return NextResponse.json({
				ok: true,
				id: existing.id,
				promoted: true,
				passwordSet,
				emailed,
			});
		}

		// Better Auth owns password hashing and the credential Account row, so the
		// invite goes through its own sign-up rather than writing a hash by hand.
		// `asResponse: true` keeps the caller from reading a session out of the
		// return value; `autoSignIn: false` on `auth` (src/lib/auth.ts) is what
		// actually stops the superadmin pressing "Invite" from being signed in as
		// the person they just invited — see that file's comment for why
		// `asResponse` alone does not.
		const signUp = await auth.api.signUpEmail({
			body: { email, name, password },
			asResponse: true,
		});
		const made: { user?: { id?: string } } | null = await signUp
			.json()
			.catch(() => null);

		const created = await prisma.user.findUnique({ where: { email } });
		if (!created) {
			return NextResponse.json({ error: "create_failed" }, { status: 500 });
		}

		// Two superadmins inviting the same address at once both pass the
		// `existing` check above. The loser's sign-up is swallowed as a generic
		// duplicate response (Better Auth's `shouldReturnGenericDuplicateResponse`,
		// which `autoSignIn: false` also enables), and this read then finds the
		// winner's row — which must not be re-roled as if we had created it. A
		// row we just created sits at the CUSTOMER database default, so the
		// legitimate path is unaffected.
		if (created.role !== "CUSTOMER") {
			return NextResponse.json({ error: "already_staff" }, { status: 409 });
		}

		// A sign-up for an address that exists by now is swallowed the same way,
		// and answers with a made-up row whose id is nobody's. So a row that is
		// not the one this sign-up made is someone else's: the invitee's own
		// first code sign-in, which has no password — and staff cannot use a
		// code, so given the role it would have no way in — or a second
		// superadmin's invite, whose password is not the one typed here.
		// Refused rather than promoted: pressing Invite again finds the row and
		// takes the promotion branch above, or is told it is already staff.
		const meanwhile = NextResponse.json(
			{ error: "signed_in_meanwhile" },
			{ status: 409 },
		);
		if (made?.user?.id !== created.id) return meanwhile;

		// The role is set here, never by the sign-up body — `input: false` in the
		// auth config is what makes that the only possible path. `emailVerified`
		// is set true because staff sign in with Google, and Better Auth refuses
		// to link a Google account to an unverified row; we send no verification
		// mail, so this is the only way it is ever true. Typing a colleague's work
		// email here is the assertion that the address is theirs.
		//
		// The write carries its own conditions, because the row is unverified
		// until it lands: a code sign-in in flight can wipe its password (the
		// plugin does that to an unverified row), and a role must not be granted
		// to a row that no longer has one. Known limit: a wipe that lands after
		// this write still leaves staff with no password; the way out is Delete
		// and invite again.
		const granted = await prisma.user.updateMany({
			where: {
				id: created.id,
				role: "CUSTOMER",
				accounts: { some: { providerId: "credential" } },
			},
			data: {
				role,
				emailVerified: true,
				mustChangePassword: true,
				invitedById,
			},
		});
		if (granted.count === 0) return meanwhile;
		// A code sign-in could land between the sign-up and the grant, while the
		// row was still a customer's, and both session hooks would let it by.
		// From here `refuseStaffCodeSession` refuses any new one.
		await prisma.session.deleteMany({ where: { userId: created.id } });

		const emailed = await sendStaffInvite({ ...mail, name, hasPassword: true });
		return NextResponse.json(
			{ ok: true, id: created.id, emailed },
			{ status: 201 },
		);
	},
	{ stepUp: true },
);
