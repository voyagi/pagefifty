import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codePeriodOf, familyOf, type CriterionFamily } from './families';

// Written out here, not read from the module, so a code moved to another family fails a row.
const EXPECTED: Readonly<Record<string, CriterionFamily>> = {
	'slc-abil-facil-res': 'not-compared',
	'slc-abil-facil-tools': 'not-compared',
	'slc-abil-mgmt-env': 'not-compared',
	'slc-abil-mgmt-qual': 'not-compared',
	'slc-abil-mgmt-supply': 'not-compared',
	'slc-abil-qual-inst': 'certificate',
	'slc-abil-qual-smp-w-autent': 'not-compared',
	'slc-abil-qual-smp-wo-autent': 'not-compared',
	'slc-abil-ref-services': 'firm-judges',
	'slc-abil-ref-supply': 'firm-judges',
	'slc-abil-ref-work': 'firm-judges',
	'slc-abil-staff-qual': 'firm-judges',
	'slc-abil-staff-tech-ctrl': 'firm-judges',
	'slc-abil-staff-tech-work': 'firm-judges',
	'slc-abil-staff-yrly-avg-mp': 'staff-average',
	'slc-abil-staff-yrly-no-mgmt': 'firm-judges',
	'slc-abil-subc': 'not-compared',
	'slc-sche-env-cert-indep': 'certificate',
	'slc-sche-qu-cert-indep': 'certificate',
	'slc-sec-inf': 'not-compared',
	'slc-sec-proc': 'not-compared',
	'slc-sec-supply': 'not-compared',
	'slc-stand-ins': 'insurance',
	'slc-stand-other': 'not-compared',
	'slc-stand-ratio': 'not-compared',
	'slc-stand-to-avg': 'turnover-general',
	'slc-stand-to-gen': 'turnover-general',
	'slc-stand-to-spec': 'turnover-specific',
	'slc-stand-to-spec-avg': 'turnover-specific',
	'slc-suit-auth-mbrshp': 'not-assessed',
	'slc-suit-reg-prof': 'not-assessed',
	'slc-suit-reg-trade': 'not-assessed'
};

const TRACKED_CODES: string[] = (
	JSON.parse(readFileSync('src/lib/codelists/selection-criterion.json', 'utf8')) as {
		codes: { code: string }[];
	}
).codes.map((entry) => entry.code);

describe('familyOf', () => {
	it('names a family for each of the 32 tracked selection criterion codes', () => {
		expect(TRACKED_CODES).toHaveLength(32);
		expect([...TRACKED_CODES].sort()).toEqual(Object.keys(EXPECTED).sort());
	});

	it.each(TRACKED_CODES)('maps %s to the family the plan names', (code) => {
		expect(familyOf(code)).toBe(EXPECTED[code]);
	});

	it.each(['slc-unknown', '', 'constructor', 'toString', 'SLC-STAND-TO-GEN'])(
		'maps the unknown code %j to not-compared',
		(code) => {
			expect(familyOf(code)).toBe('not-compared');
		}
	);
});

describe('codePeriodOf', () => {
	it.each([
		['slc-stand-to-gen', 'yearly'],
		['slc-stand-to-spec', 'yearly'],
		['slc-stand-to-avg', 'average'],
		['slc-stand-to-spec-avg', 'average']
	] as const)('reads %s as %s', (code, period) => {
		expect(codePeriodOf(code)).toBe(period);
	});

	it('gives no period for any other code, known or not', () => {
		const others = [...TRACKED_CODES.filter((code) => !code.startsWith('slc-stand-to')), 'x'];
		for (const code of [...others, 'constructor']) expect(codePeriodOf(code), code).toBeUndefined();
	});
});
