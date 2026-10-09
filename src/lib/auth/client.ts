"use client";
import { passkeyClient } from "@better-auth/passkey/client";
import {
	emailOTPClient,
	inferAdditionalFields,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Same origin, so no baseURL: the handler is mounted at /api/auth. */
export const authClient = createAuthClient({
	plugins: [
		twoFactorClient(),
		passkeyClient(),
		emailOTPClient(),
		// Types `user.role` on the session, as declared in `lib/auth.ts`.
		inferAdditionalFields({
			user: { role: { type: "string", input: false } },
		}),
	],
});
