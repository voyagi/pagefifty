import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CaptureLineSchema, NoticeRecordSchema } from '../snapshot/index-row';
import { NoticeSearchSchema, SearchesFileSchema } from '../snapshot/searches';
import { buildTenderPage } from './tender-page';
import { isTenderWebPage } from './tender-web-page';

const titled = (title: string) => ({ title, url: 'https://example.org/page' });

describe('isTenderWebPage', () => {
	it.each([
		['German', 'Ausschreibungen Berlin TXL Management GmbH: 1 offen'],
		['German', 'Zentralbereich Beschaffungen'],
		['German, with an umlaut', 'RIB e-Vergabe und Aufträge für Bieter'],
		['German, ae for the umlaut', 'Zuschlaege der Woche'],
		['German, a framework agreement', 'Rahmenvertrag Transaktionsberatung'],
		['Dutch', 'Aanbesteding ICT-diensten'],
		['Dutch', 'Overheidsopdrachten'],
		['Dutch', 'Opdracht gegund aan een leverancier'],
		['French', "Appel d'offres : logiciel informatique"],
		['French', 'Marchés publics de la commune'],
		['French, a framework agreement', 'Fournitures matériel informatique (accord-cadre)'],
		['English', 'Contract award notice'],
		['English', 'Procurement | ONTRAS Gastransport GmbH'],
		['English', 'Purchasing conditions TenneT Germany']
	])('keeps a %s title: %s', (_language, title) => {
		expect(isTenderWebPage(titled(title))).toBe(true);
	});

	it.each([
		['TED', 'https://ted.europa.eu/de/notice/-/detail/433399-2025'],
		['an e-Vergabe portal', 'https://www.evergabe-online.de/tenderdetails.html?id=1'],
		['DTVP', 'https://www.dtvp.de/Center/company/announcements'],
		['BidFix', 'https://bidfix.ai/organisation/klinikum-der-technischen-universitaet-muenchen'],
		['GovEx', 'https://online.govex.be/govex/control/view_bda?bda.id=1368413'],
		[
			'a French call for tenders',
			'https://www.klekoon.com/JOCE/joue-appel-offre-belgique-materiel-informatique-13320455.htm'
		],
		['an umlaut written as a percent escape', 'https://example.org/auftr%C3%A4ge/it']
	])('keeps a page whose address names %s, whatever its title', (_what, url) => {
		expect(isTenderWebPage({ title: 'Home', url })).toBe(true);
	});

	// Results the 2026-10-22 capture's searches returned, as recorded.
	it.each([
		['Time in Florida - Wikipedia', 'https://en.wikipedia.org/wiki/Time_in_Florida'],
		['Current time in Florida, United States', 'https://24timezones.com/Florida/time'],
		[
			'Baltimore/Washington International Airport - Wikipedia',
			'https://en.wikipedia.org/wiki/Baltimore/Washington_International_Airport'
		],
		[
			'BWI Baltimore/Washington Intl Airport (BWI/KBWI) - FlightAware',
			'https://www.flightaware.com/live/airport/KBWI'
		],
		[
			'Purchased an Item, Now Listing Has Been Removed For Policy Violation',
			'https://community.ebay.com/forum/buying-57914/topic/purchased-an-item-now-listing-has-been-removed-for-policy-violation-164155'
		],
		[
			'Bund Bidding System (BBS)',
			'https://www.bundesbank.de/en/service/banks-and-companies/bbs-bund-bidding-system/bund-bidding-system-bbs--619076'
		],
		[
			'IT outsourcing at TenneT – Arvato Systems',
			'https://us.arvato-systems.com/more/about-arvato-systems/references/tennet'
		]
	])('drops a page about something else: %s', (title, url) => {
		expect(isTenderWebPage({ title, url })).toBe(false);
	});

	it('reads an address with a broken percent escape as written', () => {
		expect(isTenderWebPage({ title: 'Home', url: 'https://example.org/%E0%A4%A' })).toBe(false);
		expect(isTenderWebPage({ title: 'Home', url: 'https://example.org/vergabe/%E0%A4%A' })).toBe(
			true
		);
	});
});

// The 2026-10-22 capture as the records build wrote it: globalSetup ran scripts/build-records.mjs.
const CAPTURE = '2026-10-22';
const BUILT = join('src', 'lib', 'snapshot', 'generated', CAPTURE);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('the buyer search of the 2026-10-22 capture on its tender pages', () => {
	const now = new Date(CaptureLineSchema.parse(readJson(join(BUILT, 'capture.json'))).fetchedAt);
	const builtSearch = (notice: string) =>
		NoticeSearchSchema.parse(readJson(join(BUILT, 'searches', `${notice}.json`)));
	const shown = (notice: string) =>
		buildTenderPage(
			NoticeRecordSchema.parse(readJson(join(BUILT, 'records', `${notice}.json`))),
			now,
			undefined,
			builtSearch(notice)
		).search;
	const returnedTitles = (notice: string) => {
		const search = builtSearch(notice);
		return search.status === 'searched' ? search.results.map(({ title }) => title) : [];
	};

	it('713597-2026, the featured notice, lists none of the five Florida pages its search returned', () => {
		const titles = returnedTitles('713597-2026');
		expect(titles).toHaveLength(5);
		expect(titles.every((title) => title.includes('Florida'))).toBe(true);
		expect(shown('713597-2026')).toEqual({ none: true });
	});

	it('the three BWI GmbH notices list none of the airport pages their searches returned', () => {
		for (const notice of ['706789-2026', '722958-2026', '731743-2026']) {
			expect(
				returnedTitles(notice).some((title) => title.includes('Airport')),
				notice
			).toBe(true);
			expect(shown(notice), notice).toEqual({ none: true });
		}
	});

	it('699958-2026 lists its four tender pages in the order Tavily gave and leaves out the fifth', () => {
		expect(returnedTitles('699958-2026')).toHaveLength(5);
		const view = shown('699958-2026');
		expect(
			view !== undefined && 'results' in view ? view.results.map(({ title }) => title) : []
		).toEqual([
			'433399-2025 - Wettbewerb - TED - Tenders Electronic Daily',
			'Purchasing conditions TenneT Germany',
			'Ökonomische und technische Beratung Bundesbeteiligung TenneT ...',
			'NGIn (Next Generation Infrastructure) für die Erbringung von ...'
		]);
	});

	// Measured on this capture when the filter was written: every searched notice returned five results.
	it('of the 200 notices searched, 27 show the empty line and 658 of the 1,000 results are listed', () => {
		const file = SearchesFileSchema.parse(readJson(join('examples', CAPTURE, 'searches.json')));
		const counts = { searched: 0, returned: 0, listed: 0, none: 0 };
		for (const search of file.notices) {
			if (search.status !== 'searched') continue;
			counts.searched += 1;
			counts.returned += search.results.length;
			const view = shown(search.notice);
			if (view === undefined) throw new Error(`${search.notice} was searched but shows no panel`);
			if ('none' in view) counts.none += 1;
			else counts.listed += view.results.length;
		}
		expect(counts).toEqual({ searched: 200, returned: 1000, listed: 658, none: 27 });
	});
});
