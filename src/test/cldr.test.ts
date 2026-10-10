import { describe, expect, it } from 'vitest';
import { CHECKED_CLDR, cldrLabel, labelUnder } from './cldr';

describe('labelUnder', () => {
	it('is the bare code under the CLDR release the names were checked against', () => {
		expect(labelUnder('NL', CHECKED_CLDR)).toBe('NL');
	});

	it('names both releases when the run has another CLDR', () => {
		const label = labelUnder('NL', '49.0');
		expect(label.startsWith('NL ')).toBe(true);
		expect(label).toContain('this run has CLDR 49.0');
		expect(label).toContain(`checked against CLDR ${CHECKED_CLDR}`);
	});

	it('says the release is unknown when the runtime reports none', () => {
		expect(labelUnder('NL', undefined)).toContain('this run has CLDR unknown');
	});
});

describe('cldrLabel', () => {
	it("labels a code under this runtime's own CLDR release", () => {
		expect(cldrLabel('NL')).toBe(labelUnder('NL', process.versions.cldr));
	});
});
