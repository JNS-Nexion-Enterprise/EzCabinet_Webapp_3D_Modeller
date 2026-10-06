"use client";
import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Same origin, so no baseURL: the handler is mounted at /api/auth. */
export const authClient = createAuthClient({
	plugins: [twoFactorClient(), passkeyClient()],
});
