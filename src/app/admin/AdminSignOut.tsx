"use client";

import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { useAction } from "@/components/useAction";
import { authClient } from "@/lib/auth/client";

export function AdminSignOut({ name }: { name: string }) {
	const router = useRouter();
	const signOut = useAction(async () => {
		await authClient.signOut();
		router.push("/admin/login");
	});
	// Keeps spinning once signed out: the redirect is still on its way.
	const working = signOut.busy || signOut.done;
	return (
		<button
			type="button"
			disabled={working}
			onClick={() => signOut.run()}
			className="text-neutral-500 text-xs hover:text-neutral-900 disabled:opacity-60"
		>
			{working && <Spinner />}
			{working ? "Signing out…" : `${name} · Sign out`}
		</button>
	);
}
