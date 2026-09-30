/**
 * A source could not answer (rate-limited, down, timed out) — as opposed to
 * answering "no such transaction". Telling a reader their real transaction
 * doesn't exist because an upstream was busy is the worse failure.
 */
export class SourceUnavailable extends Error {}
