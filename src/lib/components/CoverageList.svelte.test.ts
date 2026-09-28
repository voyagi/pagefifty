import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { summarizeLot } from '$lib/core/coverage-facts';
import { coverageLines } from '$lib/core/reading';
import { readNotice } from '$lib/ingest/read-notice';
import type { DocumentsLink, NoticeRecord } from '$lib/ingest/record';
import { buildTenderPage } from '$lib/tenders/tender-page';
import CoverageList from './CoverageList.svelte';
import FacedownLeaf from './FacedownLeaf.svelte';
import SourceLinks from './SourceLinks.svelte';
import TenderPage from './TenderPage.svelte';

const NOW = new Date('2026-09-20T10:00:00Z');
const CAPTURE = {
	capturedOn: '15 Sep 2026',
	fetchedAt: '2026-09-15T19:50:49.157Z',
	firstPublished: '1 Sep 2026'
};

const NOT_ASSESSED =
	"Not assessed: exclusion grounds, registration or authorisation, declarations the notice demands, and the buyer's shortlisting.";
const NOT_COMPARED = 'Not compared: your firm profile. This version shows criteria as published.';
const READ_NONE = 'Read: the notice, which publishes no selection criteria for this lot.';
const NOT_READ_DOCUMENTS =
	'Not read: the procurement documents, which the buyer names as a source of criteria.';
const RESTRICTED = 'Request access to the restricted procurement documents';

function recordOf(role: RoleName, which = 0): NoticeRecord {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return result.record;
}

function linesOf(record: NoticeRecord) {
	const [lot] = record.lots;
	return coverageLines(summarizeLot(lot), lot.documents);
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function renderedLines(): string[] {
	const list = screen.getByRole('list', { name: 'What was read and what was not' });
	return within(list)
		.getAllByRole('listitem')
		.map((item) => squash(item.textContent));
}

describe('CoverageList', () => {
	// 609569-2026 is held for its deadline, and its one criterion sits in the notice with no pointer
	// to the documents, so nothing on its lot is left unread. The go-rule notices are no fixture for
	// this: their criteria point to the documents.
	it('lists what was read from a lot whose criteria are all in the notice', () => {
		const record = recordOf('before-dst', 0);
		expect(record.lots[0].criteria).toHaveLength(1);
		render(CoverageList, { props: { lines: linesOf(record) } });
		expect(renderedLines()).toEqual([
			'Read: 1 selection criterion published in the notice for this lot.',
			NOT_ASSESSED,
			NOT_COMPARED
		]);
	});

	it('says the procurement documents were not read for 600367-2026 and links them by name', () => {
		const record = recordOf('documents-only', 0);
		render(CoverageList, { props: { lines: linesOf(record) } });
		expect(renderedLines()).toEqual([READ_NONE, NOT_READ_DOCUMENTS, NOT_ASSESSED, NOT_COMPARED]);
		const link = screen.getByRole('link', { name: 'Open the procurement documents' });
		expect(link.getAttribute('href')).toBe(record.lots[0].documents?.href);
		expect(screen.queryByText(record.lots[0].documents?.published ?? 'none')).toBeNull();
	});

	it('reads a notice-source lot with no criteria without a documents line', () => {
		render(CoverageList, { props: { lines: linesOf(recordOf('notice-source-no-criteria')) } });
		expect(renderedLines()).toEqual([READ_NONE, NOT_ASSESSED, NOT_COMPARED]);
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('sets each status word apart in its own element, in the order given', () => {
		render(CoverageList, { props: { lines: linesOf(recordOf('documents-only', 0)) } });
		const words = [...document.querySelectorAll('[data-status]')].map((each) => each.textContent);
		expect(words).toEqual(['Read:', 'Not read:', 'Not assessed:', 'Not compared:']);
	});

	it('shows a documents address that is not http or https as text, never as a link', () => {
		const documents: DocumentsLink = { published: 'javascript:alert(1)' };
		const lines = coverageLines(
			{ criteriaCount: 0, sources: ['epo-procurement-document'], pointsToDocuments: false },
			documents
		);
		render(CoverageList, { props: { lines } });
		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.getByText('javascript:alert(1)').tagName).not.toBe('A');
	});

	it('words a restricted documents link as access on request, never as the open documents', () => {
		const documents: DocumentsLink = {
			published: 'https://app.tenpu.eu/public/tender/dps/1167',
			href: 'https://app.tenpu.eu/public/tender/dps/1167',
			restricted: true
		};
		const lines = coverageLines(
			{ criteriaCount: 0, sources: ['epo-procurement-document'], pointsToDocuments: false },
			documents
		);
		render(CoverageList, { props: { lines } });
		expect(screen.getByRole('link', { name: RESTRICTED }).getAttribute('href')).toBe(
			documents.href
		);
		expect(screen.queryByRole('link', { name: 'Open the procurement documents' })).toBeNull();
	});

	it('names a restricted address that is not http or https as published, with no link', () => {
		const documents: DocumentsLink = { published: 'ftp://docs.example.test/1', restricted: true };
		const lines = coverageLines(
			{ criteriaCount: 0, sources: ['epo-procurement-document'], pointsToDocuments: false },
			documents
		);
		const { container } = render(CoverageList, { props: { lines } });
		expect(screen.queryByRole('link')).toBeNull();
		expect(squash(container.querySelector('.documents')?.textContent)).toBe(
			'Restricted procurement documents, published as ftp://docs.example.test/1'
		);
	});

	it('renders the lines it is given and computes no coverage of its own', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/CoverageList.svelte'),
			'utf8'
		);
		const imports = [...source.matchAll(/^\s*import\s+(?!type\b)[^;]*;/gm)].map((each) => each[0]);
		expect(imports.join('\n')).not.toMatch(/coverage-facts|core\/reading/);
	});
});

describe('SourceLinks', () => {
	it('links the notice on TED and the documents exactly as published, in the same tab', () => {
		const record = recordOf('documents-only', 0);
		const tender = buildTenderPage(record, NOW);
		render(SourceLinks, { props: { tedUrl: tender.tedUrl, documents: tender.documents } });
		const ted = screen.getByRole('link', { name: 'Open notice on TED' });
		const documents = screen.getByRole('link', { name: 'Open the procurement documents' });
		expect(ted.getAttribute('href')).toBe('https://ted.europa.eu/en/notice/-/detail/600367-2026');
		expect(documents.getAttribute('href')).toBe(record.lots[0].documents?.href);
		expect([ted.getAttribute('target'), documents.getAttribute('target')]).toEqual([null, null]);
	});

	it('words the restricted link of 600954-2026 as access on request', () => {
		const tender = buildTenderPage(recordOf('restricted-documents'), NOW);
		expect(tender.documents?.restricted).toBe(true);
		render(SourceLinks, { props: { tedUrl: tender.tedUrl, documents: tender.documents } });
		expect(screen.getByRole('link', { name: RESTRICTED }).getAttribute('href')).toBe(
			tender.documents?.href
		);
		expect(screen.queryByRole('link', { name: 'Open the procurement documents' })).toBeNull();
	});

	it('shows a documents address that is not http or https as text only', () => {
		render(SourceLinks, {
			props: {
				tedUrl: 'https://ted.europa.eu/en/notice/-/detail/1-2026',
				documents: { published: 'data:text/html,x' }
			}
		});
		expect(screen.getAllByRole('link').map((link) => squash(link.textContent))).toEqual([
			'Open notice on TED'
		]);
		expect(screen.getByText('data:text/html,x')).toBeTruthy();
	});
});

describe('FacedownLeaf and the tender page around it', () => {
	it('lies face down with the documents unread and their link', () => {
		const documents = recordOf('documents-only', 0).lots[0].documents;
		render(FacedownLeaf, { props: { documents } });
		const leaf = screen.getByRole('region', { name: 'Documents not read yet' });
		expect(leaf.id).toBe('documents');
		expect(squash(leaf.textContent)).toContain(
			'The procurement documents have not been read. The criteria shown above come from the notice alone, and the documents can add more.'
		);
		expect(within(leaf).getByRole('link', { name: 'Open the procurement documents' })).toBeTruthy();
	});

	it('shows the Documents leaf for 609955-2026, whose criteria point to the documents', () => {
		const tender = buildTenderPage(recordOf('one-lot'), NOW);
		render(TenderPage, { props: { data: { tender, capture: CAPTURE } } });
		expect(screen.getByRole('region', { name: 'Documents not read yet' })).toBeTruthy();
		expect(renderedLines()).toContain('Not read: the documents a criterion refers to.');
	});

	it('shows no Documents leaf when every lot is read from the notice alone', () => {
		const tender = buildTenderPage(recordOf('notice-source-no-criteria'), NOW);
		render(TenderPage, { props: { data: { tender, capture: CAPTURE } } });
		expect(screen.queryByRole('region', { name: 'Documents not read yet' })).toBeNull();
	});

	it('states the page shows the notice as published and ends with the leaf foot', () => {
		const tender = buildTenderPage(recordOf('one-lot'), NOW);
		const { container } = render(TenderPage, { props: { data: { tender, capture: CAPTURE } } });
		const text = squash(container.textContent);
		expect(text).toContain(
			'Shown as published in the notice. Nothing on this page has been compared with your firm profile.'
		);
		expect(text).toContain(
			"Criteria as published in TED notice 609955-2026. Source: TED, the EU's Tenders Electronic Daily, snapshot captured 15 Sep 2026. Not legal advice."
		);
	});

	it('takes the capture day in the leaf foot from the capture it is given', () => {
		const tender = buildTenderPage(recordOf('one-lot'), NOW);
		const capture = { ...CAPTURE, capturedOn: '27 Oct 2026' };
		const { container } = render(TenderPage, { props: { data: { tender, capture } } });
		expect(squash(container.textContent)).toContain('snapshot captured 27 Oct 2026.');
	});
});
