import { cleanup, render } from '@testing-library/svelte';
import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { VERDICT_LABELS } from '$lib/core/verdict';
import { captureDay } from '$lib/snapshot/capture-id';
import { FigureFileSchema, type FigureFile } from '$lib/snapshot/figure';
import { COUNT_KEYS, EXAMPLE_FIGURE, SPREAD_FIGURE } from '../../test/home-figure';
import HomeFigure from './HomeFigure.svelte';

const LABEL_OF = {
	go: VERDICT_LABELS.GO,
	partnerNeeded: VERDICT_LABELS['PARTNER NEEDED'],
	noGo: VERDICT_LABELS['NO-GO'],
	askFirst: VERDICT_LABELS['ASK FIRST']
} as const;

const LOT_RULE = `Each notice counts once, under its most lenient lot: ${VERDICT_LABELS.GO}, then ${VERDICT_LABELS['ASK FIRST']}, then ${VERDICT_LABELS['PARTNER NEEDED']}, then ${VERDICT_LABELS['NO-GO']}.`;

const textOf = (element: Element | null | undefined) =>
	(element?.textContent ?? '').replace(/\s+/g, ' ').trim();

function figureRegion(figure: FigureFile): Element {
	const { container } = render(HomeFigure, { props: { figure } });
	const region = container.querySelector('[data-figure]');
	if (region === null) throw new Error('HomeFigure rendered no [data-figure] element');
	return region;
}

// Every number the figure shows, read off the page; the command is the file's own text and is
// compared whole instead, since it may carry digits of its own (--cap 400).
function numbersShown(region: Element): string[] {
	const copy = region.cloneNode(true) as Element;
	for (const command of copy.querySelectorAll('[data-command]')) command.remove();
	return textOf(copy).match(/\d+(?:[.,]\d+)*/g) ?? [];
}

// P7: the population, the capture date and "one run" are part of every figure shown.
function frameMissing(region: Element, figure: FigureFile): string[] {
	const text = textOf(region);
	return [
		...(textOf(region.querySelector('[data-population]')) === String(figure.population)
			? []
			: ['population']),
		...(text.includes(figure.capturedOn) ? [] : ['capture date']),
		...(text.includes('one run') ? [] : ['one run'])
	];
}

// The rendered figure with one part of its frame taken out of every text node.
function blanked(
	region: Element,
	part: 'population' | 'capture date' | 'one run',
	figure: FigureFile
) {
	const copy = region.cloneNode(true) as Element;
	if (part === 'population') copy.querySelector('[data-population]')?.remove();
	const cut = part === 'capture date' ? figure.capturedOn : part === 'one run' ? 'one run' : null;
	const walker = copy.ownerDocument.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node !== null && cut !== null; node = walker.nextNode()) {
		node.nodeValue = (node.nodeValue ?? '').replaceAll(cut, '');
	}
	return copy;
}

const figureArbitrary = fc
	.record({
		counts: fc.record({
			go: fc.nat({ max: 400 }),
			partnerNeeded: fc.nat({ max: 400 }),
			noGo: fc.nat({ max: 400 }),
			askFirst: fc.nat({ max: 400 })
		}),
		day: fc.date({
			min: new Date('2026-01-01T00:00:00Z'),
			max: new Date('2027-12-31T00:00:00Z'),
			noInvalidDate: true
		}),
		cost: fc.nat({ max: 99_999_999 }),
		command: fc.option(
			fc.constantFrom('node scripts/capture.mjs --live --cap 400', 'node scripts/capture.mjs'),
			{ nil: null }
		)
	})
	.map(({ counts, day, cost, command }) =>
		FigureFileSchema.parse({
			...SPREAD_FIGURE,
			population: counts.go + counts.partnerNeeded + counts.noGo + counts.askFirst,
			counts,
			capturedOn: captureDay(day.toISOString()),
			costUsd: (cost / 1_000_000).toFixed(6),
			command
		})
	);

describe('HomeFigure', () => {
	it('every number on the home page equals the figure file', () => {
		for (const figure of [EXAMPLE_FIGURE, SPREAD_FIGURE]) {
			const region = figureRegion(figure);
			const allowed = new Set([
				String(figure.population),
				...COUNT_KEYS.map((key) => String(figure.counts[key])),
				figure.costUsd,
				...(figure.capturedOn.match(/\d+/g) ?? [])
			]);
			const shown = numbersShown(region);
			expect(shown.filter((number) => !allowed.has(number))).toEqual([]);
			expect(shown).toContain(figure.costUsd);
			expect(textOf(region.querySelector('[data-population]'))).toBe(String(figure.population));
			for (const key of COUNT_KEYS) {
				expect(textOf(region.querySelector(`[data-count="${key}"] [data-number]`))).toBe(
					String(figure.counts[key])
				);
			}
			cleanup();
		}
	});

	test.prop([figureArbitrary], { numRuns: 30 })(
		'the figure never shows without its population, date and one run',
		(figure) => {
			const region = figureRegion(figure);
			expect(frameMissing(region, figure)).toEqual([]);
			expect(frameMissing(blanked(region, 'population', figure), figure)).toEqual(['population']);
			expect(frameMissing(blanked(region, 'capture date', figure), figure)).toEqual([
				'capture date'
			]);
			expect(frameMissing(blanked(region, 'one run', figure), figure)).toEqual(['one run']);
			cleanup();
		}
	);

	it('the home page shows every number of the latest figure', () => {
		for (const figure of [EXAMPLE_FIGURE, SPREAD_FIGURE]) {
			const region = figureRegion(figure);
			const text = textOf(region);
			expect(text.split(' ')).toContain(String(figure.population));
			for (const key of COUNT_KEYS) {
				const row = region.querySelector(`[data-count="${key}"]`);
				expect(textOf(row)).toContain(LABEL_OF[key]);
				expect(textOf(row?.querySelector('[data-number]'))).toBe(String(figure.counts[key]));
			}
			expect(text).toContain(figure.capturedOn);
			expect(text).toContain(`USD ${figure.costUsd}`);
			expect(text).toContain(LOT_RULE);
			expect(text).toContain('one run');
			if (figure.command === null) {
				expect(region.querySelector('[data-command]')).toBeNull();
				expect(text).toContain('one-off');
			} else {
				expect(textOf(region.querySelector('[data-command]'))).toBe(figure.command);
			}
			expect(region.closest('[data-ai-generated]')).toBeNull();
			expect(region.querySelector('[data-ai-generated]')).toBeNull();
			cleanup();
		}
	});
});
