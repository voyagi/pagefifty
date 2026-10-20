import { cleanup, render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { VERDICT_LABELS } from '$lib/core/verdict';
import type { FigureFile } from '$lib/snapshot/figure';
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

describe('HomeFigure', () => {
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
