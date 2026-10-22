/**
 * What the delivery API refuses with, said as the thing to do about it.
 *
 * The codes are the API's vocabulary and belong in it; an admin booking a
 * lorry should never read one. Anything unrecognised falls back to the
 * caller's own sentence rather than surfacing a new code the day it is added.
 */
const MESSAGE: Record<string, string> = {
	already_booked:
		"This job is with a carrier already — change or cancel it with them first.",
	not_found: "This delivery is gone. Someone may have deleted it.",
	invalid_body:
		"Something in the form is not right — check the phone number and the item sizes.",
	carrier_not_configured:
		"That partner has no credentials on this deployment yet.",
	carrier_refused: "The partner refused this booking.",
	invalid_split:
		"A split needs items on both sides — tick some, but not all of them.",
	no_pickup_board: "Only GDEX schedules a collection we can check.",
	pickup_check_failed: "Could not reach GDEX to check the collection.",
	workshop_moved:
		"The workshop has moved since this form was opened. Reload the page to pick up the new address.",
	app_url_not_set:
		"This deployment does not know its own address, so a partner cannot redirect back to it.",
};

export function messageFor(code: unknown, fallback: string): string {
	return typeof code === "string" && Object.hasOwn(MESSAGE, code)
		? MESSAGE[code]
		: fallback;
}
