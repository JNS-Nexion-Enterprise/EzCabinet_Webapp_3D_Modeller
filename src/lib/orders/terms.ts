/**
 * Which wording of the terms of sale and refund policy an order was placed
 * under — stamped on every order beside the time it was accepted.
 *
 * Bump this, by hand, whenever the text of `terms` or `refunds` in
 * `lib/copy/en.ts` changes in meaning. It is what lets a disputed order be
 * matched to the text that customer agreed to; `git log -S` on the old value
 * finds that text. A date, because "which version" is really "as of when".
 *
 * Written by the server only. A request never supplies it.
 */
export const TERMS_VERSION = "2026-10-07";
