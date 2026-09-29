import { describe, expect, it } from 'vitest';
import oneLot from '../../../examples/2026-09-15/xml/609955-2026.xml?raw';
import { toBcp47 } from '../ingest/languages';
import { readNotice } from '../ingest/read-notice';
import { buildTenderPage } from './tender-page';

// The server builds the tender page in workerd, so its ICU data must name each language the reader
// can emit as Node's does, or the labels the Node tests pin would differ from what a visitor is
// served (deadline.worker.test.ts holds the zone names the same way). Names as Node 24 gives them,
// keyed by the TED code the reader maps to a tag.
const NAMES_BY_TED_CODE: Readonly<Record<string, string>> = {
	BUL: 'Bulgarian',
	CES: 'Czech',
	DAN: 'Danish',
	DEU: 'German',
	ELL: 'Greek',
	ENG: 'English',
	EST: 'Estonian',
	FIN: 'Finnish',
	FRA: 'French',
	GLE: 'Irish',
	HRV: 'Croatian',
	HUN: 'Hungarian',
	ITA: 'Italian',
	LAV: 'Latvian',
	LIT: 'Lithuanian',
	MLT: 'Maltese',
	NLD: 'Dutch',
	POL: 'Polish',
	POR: 'Portuguese',
	RON: 'Romanian',
	SLK: 'Slovak',
	SLV: 'Slovenian',
	SPA: 'Spanish',
	SWE: 'Swedish'
};

const BEFORE_DEADLINES = new Date('2026-09-20T10:00:00Z');

function oneLotRecord() {
	const result = readNotice(new TextEncoder().encode(oneLot), { noticeNumber: '609955-2026' });
	if (!result.ok) throw new Error(`609955-2026 did not read in workerd: ${result.detail}`);
	return result.record;
}

describe('tender page language names in workerd', () => {
	it('names the six German descriptions of 609955-2026 in English', () => {
		const page = buildTenderPage(oneLotRecord(), BEFORE_DEADLINES);
		const names = page.lots[0].criteria.flatMap((criterion) =>
			criterion.descriptions.map((description) => description.language)
		);
		expect(names).toEqual(Array(6).fill('German'));
	});

	it('names every language the reader can emit as Node does', () => {
		const record = oneLotRecord();
		const [lot] = record.lots;
		const codes = Object.keys(NAMES_BY_TED_CODE);
		const descriptions = codes.map((code) => ({ text: code, lang: toBcp47(code) }));
		const criteria = [{ ...lot.criteria[0], descriptions }];
		const page = buildTenderPage({ ...record, lots: [{ ...lot, criteria }] }, BEFORE_DEADLINES);
		const named = page.lots[0].criteria[0].descriptions.map((each) => [each.text, each.language]);
		expect(Object.fromEntries(named)).toEqual(NAMES_BY_TED_CODE);
	});
});
