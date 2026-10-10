// The CLDR release whose English names the hand-typed country and language lists were last checked
// against (Node 24.21). .nvmrc takes the newest Node 24, so CI can run a newer CLDR than this one. A
// name test that then fails with no change in the repo is a CLDR rename: the list follows it, or keeps
// its own name on purpose. The label puts that in the failure itself, not only in a source comment.
export const CHECKED_CLDR = '48.0';

export function labelUnder(code: string, running: string | undefined): string {
	if (running === CHECKED_CLDR) return code;
	return `${code} (this run has CLDR ${running ?? 'unknown'}, the names were checked against CLDR ${CHECKED_CLDR}: a CLDR rename may be the cause)`;
}

export function cldrLabel(code: string): string {
	return labelUnder(code, process.versions.cldr);
}
