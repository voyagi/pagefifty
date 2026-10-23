import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Button from './Button.svelte';

const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

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
