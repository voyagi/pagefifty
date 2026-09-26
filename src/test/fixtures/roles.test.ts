import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMAIL_PATTERN } from '../../lib/snapshot/scrub';
import { capturePath, readFixture } from './node';
import { CAPTURE_ID, FIXTURE_ROLES, buildSynthetic, type SyntheticRoleName } from './roles';

// Named here, not derived from the manifest, so a role cannot disappear without this list changing.
const REQUIRED_ROLES = [
	'after-dst',
	'before-dst',
	'bom-crlf',
	'both-deadlines',
	'cancel-notice',
	'change-notice',
	'decimal-in-text',
	'doctype-entity',
	'documents-only',
	'dutch-classifier',
	'english-classifier',
	'escaped-link',
	'escaped-text',
	'espd-only',
	'french-classifier',
	'german-classifier',
	'go-rule',
	'group-legal-form',
	'joint-buyers',
	'largest',
	'lots-differ',
	'multi-lot',
	'multilingual-criterion',
	'neither-deadline',
	'notice-source-no-criteria',
	'one-lot',
	'other-legal-basis',
	'oversize',
	'request-deadline-only',
	'reserved-participation',
	'restricted-documents',
	'same-code-in-two-lots',
	'sdk-1.13',
	'sdk-1.14',
	'truncated',
	'value-under-floor'
];

const OVERSIZE_BYTES = 2_097_153;
const roles = Object.entries(FIXTURE_ROLES);
const captureRoles = roles.flatMap(([name, role]) =>
	role.kind === 'capture' ? [[name, role] as const] : []
);
const syntheticNames = roles.flatMap(([name, role]) =>
	role.kind === 'synthetic' ? [name as SyntheticRoleName] : []
);

const read = (notice: string) => readFileSync(capturePath(notice), 'utf8');
const criteria = (text: string) =>
	text.match(/<efac:SelectionCriteria>[\s\S]*?<\/efac:SelectionCriteria>/g) ?? [];
const lotCount = (text: string) => text.split('<cac:ProcurementProjectLot>').length - 1;

function synthetic(name: SyntheticRoleName): { source: string; output: string } {
	const role = FIXTURE_ROLES[name];
	const source = read(role.derivedFrom);
	return { source, output: buildSynthetic(name, source) };
}

describe('the fixture role manifest', () => {
	it('names exactly the required roles', () => {
		expect(Object.keys(FIXTURE_ROLES).sort()).toEqual(REQUIRED_ROLES);
	});

	it('points into the tracked capture of 2026-09-15', () => {
		expect(CAPTURE_ID).toBe('2026-09-15');
		expect(dirname(capturePath('609955-2026')).replaceAll('\\', '/')).toBe(
			'examples/2026-09-15/xml'
		);
	});

	it('keeps the manifest free of file system imports so the workerd project can load it', () => {
		const source = readFileSync(join('src', 'test', 'fixtures', 'roles.ts'), 'utf8');
		expect(source).not.toMatch(/from ['"](node:)?(fs|path)['"]/);
		expect(source).not.toMatch(/import\s*\(/);
	});
});

describe('capture roles', () => {
	it('has at least one capture role and one synthetic role', () => {
		expect(captureRoles.length).toBeGreaterThan(0);
		expect(syntheticNames.length).toBeGreaterThan(0);
	});

	it.each(captureRoles)('%s resolves to existing notices that show the role', (_name, role) => {
		expect(role.notices.length).toBeGreaterThan(0);
		for (const ref of role.notices) {
			expect(existsSync(capturePath(ref.notice)), ref.notice).toBe(true);
			const text = read(ref.notice);
			if (ref.evidence !== undefined) expect(text, ref.notice).toContain(ref.evidence);
			if (ref.lots !== undefined) expect(lotCount(text), ref.notice).toBe(ref.lots);
		}
	});

	it('names the largest notice in the capture as largest', () => {
		const dir = join('examples', CAPTURE_ID, 'xml');
		const [largest] = readdirSync(dir)
			.map((name) => ({ name, size: statSync(join(dir, name)).size }))
			.sort((a, b) => b.size - a.size);
		expect(FIXTURE_ROLES.largest.notices.map((ref) => `${ref.notice}.xml`)).toEqual([largest.name]);
	});

	it.each([
		['german-classifier', 'DEU'],
		['dutch-classifier', 'NLD'],
		['french-classifier', 'FRA']
	] as const)(
		'%s holds one criterion that points to the documents and one that does not, in %s',
		(name, language) => {
			const refs = FIXTURE_ROLES[name].notices;
			expect(refs.map((ref) => ref.pointsToDocuments).sort()).toEqual([false, true]);
			for (const ref of refs) {
				const criterion = criteria(read(ref.notice))[ref.criterion ?? -1];
				expect(criterion, `${ref.notice} criterion ${ref.criterion}`).toContain(ref.evidence);
				expect(criterion).toContain(`languageID="${language}"`);
			}
		}
	);
});

describe('synthetic roles', () => {
	it.each(syntheticNames)('%s derives from a tracked notice and changes it', (name) => {
		const role = FIXTURE_ROLES[name];
		expect(existsSync(capturePath(role.derivedFrom))).toBe(true);
		expect(role.change.length).toBeGreaterThan(0);
		const { source, output } = synthetic(name);
		expect(output).not.toBe(source);
		expect(buildSynthetic(name, source)).toBe(output);
		expect(EMAIL_PATTERN.test(output)).toBe(false);
	});

	it('refuses a source that lacks the anchor its edit needs', () => {
		expect(() => buildSynthetic('cancel-notice', '<ContractNotice/>')).toThrow(/cancel-notice/);
	});

	it('both-deadlines carries a request and a tender deadline', () => {
		const { output } = synthetic('both-deadlines');
		expect(output).toContain('<cac:ParticipationRequestReceptionPeriod>');
		expect(output).toContain('<cac:TenderSubmissionDeadlinePeriod>');
	});

	it('neither-deadline carries no deadline period at all', () => {
		const { source, output } = synthetic('neither-deadline');
		expect(source).toContain('<cac:TenderSubmissionDeadlinePeriod>');
		expect(output).not.toMatch(
			/<cac:(TenderSubmissionDeadlinePeriod|ParticipationRequestReceptionPeriod)>/
		);
	});

	it('lots-differ gives its two lots different tender deadlines', () => {
		const { source, output } = synthetic('lots-differ');
		const deadlines = (text: string) =>
			[...text.matchAll(/<cac:TenderSubmissionDeadlinePeriod>[\s\S]*?<cbc:EndDate>([^<]*)</g)].map(
				(match) => match[1]
			);
		expect(new Set(deadlines(source)).size).toBe(1);
		expect(deadlines(output)).toHaveLength(2);
		expect(new Set(deadlines(output)).size).toBe(2);
	});

	it('multilingual-criterion gives the first criterion a French and a Dutch description', () => {
		const [first] = criteria(synthetic('multilingual-criterion').output);
		expect(first).toContain('languageID="FRA"');
		expect(first).toContain('languageID="NLD"');
	});

	it('cancel-notice carries the cancel change reason', () => {
		const { output } = synthetic('cancel-notice');
		expect(output).toContain('listName="change-corrig-justification">cancel</cbc:ReasonCode>');
		expect(output).not.toContain('>update-add<');
	});

	it('reserved-participation reserves the lot for sheltered workshops', () => {
		const { output } = synthetic('reserved-participation');
		expect(output).toContain('listName="reserved-procurement">res-ws<');
		expect(output).not.toContain('listName="reserved-procurement">none<');
	});

	it('notice-source-no-criteria keeps BT-821 epo-notice and drops every criterion', () => {
		const { source, output } = synthetic('notice-source-no-criteria');
		expect(criteria(source).length).toBeGreaterThan(0);
		expect(criteria(output)).toEqual([]);
		expect(output).toContain('listName="selection-criteria-source">epo-notice<');
	});

	it('doctype-entity declares an entity in a DOCTYPE after the XML declaration', () => {
		const { output } = synthetic('doctype-entity');
		expect(output.startsWith('<?xml')).toBe(true);
		expect(output).toMatch(/^<\?xml[^>]*\?><!DOCTYPE [^>]*\[<!ENTITY /);
	});

	it('truncated stops inside an element of the notice', () => {
		const { source, output } = synthetic('truncated');
		expect(source.startsWith(output)).toBe(true);
		expect(output.length).toBeLessThan(source.length);
		expect(output.lastIndexOf('<')).toBeGreaterThan(output.lastIndexOf('>'));
	});

	it('bom-crlf starts with a byte order mark and ends every line with CRLF', () => {
		const { source, output } = synthetic('bom-crlf');
		expect(output.codePointAt(0)).toBe(0xfeff);
		expect(output).not.toMatch(/[^\r]\n/);
		expect(output.slice(1).replaceAll('\r\n', '\n')).toBe(source);
	});

	it(`oversize is exactly ${OVERSIZE_BYTES} bytes and only grows by one comment`, () => {
		const { source, output } = synthetic('oversize');
		expect(new TextEncoder().encode(output).length).toBe(OVERSIZE_BYTES);
		expect(output.replace(/<!--x+-->/, '')).toBe(source);
	});

	it('english-classifier adds one English criterion that points to the documents and one that does not', () => {
		const { source, output } = synthetic('english-classifier');
		expect(criteria(source)).toEqual([]);
		const added = criteria(output);
		expect(added).toHaveLength(2);
		expect(added.every((criterion) => criterion.includes('languageID="ENG"'))).toBe(true);
		expect(added[0]).toContain('procurement documents');
		expect(added[1]).not.toContain('document');
	});
});

describe('readFixture', () => {
	it('returns the tracked file for a capture role and the builder output for a synthetic role', () => {
		expect(readFixture('one-lot')).toBe(read('609955-2026'));
		expect(readFixture('go-rule', 2)).toBe(read(FIXTURE_ROLES['go-rule'].notices[2].notice));
		expect(readFixture('cancel-notice')).toBe(synthetic('cancel-notice').output);
	});

	it('refuses a notice index the role does not have', () => {
		expect(() => readFixture('one-lot', 1)).toThrow(/one-lot/);
	});
});
