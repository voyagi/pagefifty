// The fetch-only-network rule in .dependency-cruiser.cjs sees imports only, so the network
// channels that are globals are refused by lint instead. Proven on planted text through ESLint's
// own API with the repository's config, in an app path and in a test path.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function networkRules(code: string, filePath: string): Promise<string[]> {
	const [result] = await eslint.lintText(code, { filePath });
	return result.messages
		.filter(
			(message) =>
				message.ruleId === 'no-restricted-globals' || message.ruleId === 'no-restricted-properties'
		)
		.map((message) => message.ruleId as string);
}

describe('lint keeps app code on fetch', () => {
	it.each([
		['a WebSocket', "export const open = () => new WebSocket('wss://example.invalid');\n"],
		['an EventSource', "export const open = () => new EventSource('https://example.invalid');\n"],
		['an XMLHttpRequest', 'export const open = () => new XMLHttpRequest();\n'],
		['a beacon', "export const send = () => navigator.sendBeacon('https://example.invalid');\n"],
		// Reached through a global object, which ESLint checks only when told to.
		[
			'a WebSocket through globalThis',
			"export const open = () => new globalThis.WebSocket('wss://example.invalid');\n"
		],
		[
			'an EventSource through self',
			"export const open = () => new self.EventSource('https://example.invalid');\n"
		],
		[
			'an XMLHttpRequest through window',
			'export const open = () => new window.XMLHttpRequest();\n'
		],
		[
			'a beacon through window.navigator',
			"export const send = () => window.navigator.sendBeacon('https://example.invalid');\n"
		]
	])(
		'refuses %s in an app module',
		async (_channel, code) => {
			expect(await networkRules(code, 'src/lib/planted.ts')).toHaveLength(1);
		},
		60_000
	);

	it('allows fetch in an app module', async () => {
		expect(
			await networkRules(
				"export const get = () => fetch('https://example.invalid');\n",
				'src/lib/planted.ts'
			)
		).toEqual([]);
	}, 60_000);

	it('allows the same channels in a test file', async () => {
		expect(
			await networkRules(
				"export const open = () => new WebSocket('ws://127.0.0.1');\n",
				'src/lib/planted.test.ts'
			)
		).toEqual([]);
	}, 60_000);
});
