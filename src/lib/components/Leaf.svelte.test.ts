import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import LeafHarness from '../../test/LeafHarness.svelte';
import Button from './Button.svelte';

const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

describe('Leaf', () => {
	it('marks the open leaf tab as current and links it to its leaf', () => {
		render(LeafHarness, { props: { open: true, count: 12 } });
		const tab = screen.getByRole('link', { name: /Open/ });
		expect(tab.getAttribute('aria-current')).toBe('true');
		expect(tab.getAttribute('href')).toBe('#open-group');
		expect(tab.querySelector('.count')?.textContent).toBe('12');
		expect(tab.textContent?.replace(/\s+/g, ' ').trim()).toBe('Open 12');
	});

	it('leaves a closed leaf tab without aria-current and without a count when none is given', () => {
		render(LeafHarness, { props: { open: false } });
		const tab = screen.getByRole('link', { name: 'Open' });
		expect(tab.hasAttribute('aria-current')).toBe(false);
		expect(tab.querySelector('.count')).toBeNull();
	});

	it('labels the section by its heading and puts the tab right after that heading', () => {
		render(LeafHarness, { props: { open: true } });
		const section = screen.getByRole('region', { name: 'Open IT tenders' });
		expect(section.id).toBe('open-group');
		const heading = screen.getByRole('heading', { name: 'Open IT tenders' });
		expect(heading.nextElementSibling).toBe(screen.getByRole('link', { name: 'Open' }));
	});

	it('renders a count of 0 rather than dropping it', () => {
		render(LeafHarness, { props: { open: true, count: 0 } });
		expect(screen.getByRole('link', { name: /Open/ }).querySelector('.count')?.textContent).toBe(
			'0'
		);
	});
});

describe('Button', () => {
	it('renders a link carrying the href when one is given', () => {
		render(Button, { props: { href: '/tenders', children: label('Browse open tenders') } });
		const link = screen.getByRole('link', { name: 'Browse open tenders' });
		expect(link.getAttribute('href')).toBe('/tenders');
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('renders a button of type button without an href', () => {
		render(Button, { props: { variant: 'secondary', children: label('Apply filters') } });
		const button = screen.getByRole('button', { name: 'Apply filters' });
		expect(button.getAttribute('type')).toBe('button');
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('submits a form when asked to', () => {
		render(Button, { props: { type: 'submit', children: label('Apply filters') } });
		expect(screen.getByRole('button', { name: 'Apply filters' }).getAttribute('type')).toBe(
			'submit'
		);
	});
});
