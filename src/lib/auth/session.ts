import "server-only";
import { headers } from "next/headers";
import type { $Enums } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { owesName } from "@/lib/auth/customerName";
import { needsPasskeyCheck } from "@/lib/auth/passkeyRules";
import type { Role } from "@/lib/auth/permissions";
import { needsTwoFactorSetup } from "@/lib/auth/twoFactor";
import { prisma } from "@/lib/catalogue/db";

export type AuthUser = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	role: Role;
	disabled: boolean;
	mustChangePassword: boolean;
	/** Derived on every read, never stored — see `needsTwoFactorSetup`. */
	mustSetupTwoFactor: boolean;
	/** Derived on every read from the session row — see `needsPasskeyCheck`. */
	mustVerifyPasskey: boolean;
	/**
	 * A customer who signed in with a code and has not given a name yet —
	 * derived on every read, see `owesName`. Absent means not owed.
	 */
	mustSetName?: boolean;
	/**
	 * When this session passed a passkey authentication, if it ever did —
	 * what `withAuth`'s `stepUp` reads. Absent means never.
	 */
	passkeyVerifiedAt?: Date | null;
};

/** Compile-time proof that our Role union and Prisma's generated enum agree.
 *  If either gains a role the other lacks, this stops compiling — which is
 *  the point: the alternative is ROLE_PERMISSIONS[role] being undefined
 *  inside a permission check at runtime. */
type RoleParity = Role extends $Enums.Role
	? $Enums.Role extends Role
		? true
		: never
	: never;
const _roleParity: RoleParity = true;
void _roleParity;

/**
 * The signed-in user, read fresh from the database on every call.
 *
 * The session token carries no role. Reading the row is what makes a role
 * change, or an offboarding, take effect on the next request rather than
 * whenever a week-long session happens to expire.
 */
export async function currentUser(): Promise<AuthUser | null> {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) return null;

	const row = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: {
			id: true,
			email: true,
			name: true,
			image: true,
			role: true,
			disabled: true,
			mustChangePassword: true,
			twoFactorEnabled: true,
			// "Has a password" is "has a credential account". One row is enough.
			accounts: {
				where: { providerId: "credential" },
				select: { id: true },
				take: 1,
			},
		},
	});
	if (!row || row.disabled) return null;
	const { accounts, twoFactorEnabled, ...user } = row;
	// `additionalFields` types these on the built instance only.
	const sessionRow = session.session as {
		passkeyVerified?: boolean | null;
		passkeyVerifiedAt?: Date | string | null;
	};
	return {
		...user,
		passkeyVerifiedAt: sessionRow.passkeyVerifiedAt
			? new Date(sessionRow.passkeyVerifiedAt)
			: null,
		mustSetupTwoFactor: needsTwoFactorSetup({
			role: user.role,
			hasPassword: accounts.length > 0,
			twoFactorEnabled: twoFactorEnabled === true,
		}),
		mustSetName: owesName(user),
		mustVerifyPasskey: needsPasskeyCheck({
			role: user.role,
			sessionVerified: sessionRow.passkeyVerified === true,
		}),
	};
}
