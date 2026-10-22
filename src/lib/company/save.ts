import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/catalogue/db";
import { workshopColumns } from "@/lib/logistics/carriers";
import { queueBankChangeMail } from "./bankMail";
import { bankChanged, type CompanyDetails, workshopMoved } from "./details";
import { COMPANY_CACHE_TAG, readCompany } from "./store";

export type MoveJob = {
	id: string;
	number: number;
	status: string;
	customerName: string;
};
export type MovePlan = { repoint: MoveJob[]; booked: MoveJob[] };
export type SaveResult =
	| { ok: true; repointed: number }
	| { ok: false; error: "confirm_move"; move: MovePlan };

const UNBOOKED = ["DRAFT", "QUOTED"] as const;
const BOOKED = ["BOOKED", "DRIVER_ASSIGNED"] as const;

/**
 * Save the company's details, and take the open deliveries with the workshop.
 *
 * Two things this protects. A job that leaves from the workshop must not be
 * quoted from one place while showing another, so an unbooked one (DRAFT,
 * QUOTED) is re-pointed to the new pin and place in the same transaction as
 * the save. A booked one (BOOKED, DRIVER_ASSIGNED) is left alone: the carrier
 * already has a pickup, and rewriting our copy would hide a real mismatch.
 *
 * The admin is asked first when a move touches any of them; the answer is
 * `confirmMove`. The re-point acts on what is unbooked at commit, not on what
 * the question showed, and each write is conditional, so a booking that has
 * finished in between is skipped rather than overwritten. One still in flight
 * at the carrier is not seen: its status has not changed yet.
 *
 * A changed bank account is announced to every superadmin once the save has
 * committed.
 */
export async function saveCompany(
	next: CompanyDetails,
	actor: { id: string | null; name: string },
	confirmMove: boolean,
): Promise<SaveResult> {
	const previous = (await readCompany()).details;
	const moved = workshopMoved(previous, next);

	if (moved && !confirmMove) {
		const jobs: MoveJob[] = await prisma.delivery.findMany({
			where: { fromWorkshop: true, status: { in: [...UNBOOKED, ...BOOKED] } },
			select: { id: true, number: true, status: true, customerName: true },
			orderBy: { number: "asc" },
		});
		if (jobs.length > 0) {
			return {
				ok: false,
				error: "confirm_move",
				move: {
					repoint: jobs.filter((j) =>
						(UNBOOKED as readonly string[]).includes(j.status),
					),
					booked: jobs.filter((j) =>
						(BOOKED as readonly string[]).includes(j.status),
					),
				},
			};
		}
	}

	// The loop costs two round trips a delivery; a far database would time out
	// the default 5 s on every retry.
	const repointed = await prisma.$transaction(
		async (tx) => {
			await tx.companyDetails.create({
				data: { ...next, savedById: actor.id, savedByName: actor.name },
			});
			if (!moved) return 0;

			const open = await tx.delivery.findMany({
				where: { fromWorkshop: true, status: { in: [...UNBOOKED] } },
				select: { id: true },
			});
			let count = 0;
			for (const { id } of open) {
				const done = await tx.delivery.updateMany({
					where: { id, fromWorkshop: true, status: { in: [...UNBOOKED] } },
					data: workshopColumns(next),
				});
				if (done.count !== 1) continue;
				count++;
				await tx.deliveryEvent.create({
					data: {
						deliveryId: id,
						source: "ADMIN",
						actor: actor.name,
						message: `Pickup moved with the workshop: ${previous.address} → ${next.address}`,
					},
				});
			}
			return count;
		},
		{ timeout: 25_000 },
	);

	revalidateTag(COMPANY_CACHE_TAG, { expire: 0 });
	// The tag covers `getCompany` readers; the landing and terms pages are
	// statically rendered, so only a path revalidation refreshes them.
	revalidatePath("/", "layout");

	if (bankChanged(previous, next)) {
		queueBankChangeMail(previous, next, actor.name);
	}

	return { ok: true, repointed };
}
