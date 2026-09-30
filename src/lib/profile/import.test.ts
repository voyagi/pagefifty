import { fc, test } from '@fast-check/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadProfile, exportFileName, exportProfileJson } from './export';
import {
	IMPORT_MAX_BYTES,
	createImportQueue,
	importProfileFile,
	type ImportRefusal,
	type ImportResult,
	type ProfileFile
} from './import';
import { StoredProfileSchema, emptyProfile, type StoredProfile } from './schema';

const SAVED_AT = '2026-09-20T09:00:00.000Z';
const EXPORTED_AT = '2026-09-21T16:45:00.000Z';

function sampleStored(lastExportedAt: string | null = null): StoredProfile {
	return {
		schemaVersion: 1,
		savedAt: SAVED_AT,
		lastExportedAt,
		profile: {
			...emptyProfile(),
			registration: { country: 'NL', register: 'KvK' },
			completedFinancialYears: 4,
			turnover: [
				{ year: 2024, generalNet: 1210000, specific: [] },
				{ year: 2025, generalNet: 0, specific: [{ businessLine: 'Hosting', net: 90000 }] }
			],
			staff: { total: 19, byRole: [{ role: 'Developers', count: 9 }], yearlyAverages: [] },
			certificates: [{ standard: 'NEN 7510', validUntil: '2027-03-01' }, { standard: 'ISO 27001' }],
			countries: ['NL', 'DE'],
			languages: ['nl', 'en']
		}
	};
}

// The text is decoded from UTF-8, so the byte size is measured the same way a File reports it.
function fileOf(
	name: string,
	text: string,
	size?: number
): ProfileFile & { text: () => Promise<string> } {
	return {
		name,
		size: size ?? new TextEncoder().encode(text).length,
		text: vi.fn(async () => text)
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

function refusal(result: ImportResult): ImportRefusal {
	if (result.ok) throw new Error('expected the import to be refused');
	return result;
}

const envelopeText = (patch: Record<string, unknown>, profilePatch: Record<string, unknown> = {}) =>
	JSON.stringify({
		schemaVersion: 1,
		savedAt: SAVED_AT,
		lastExportedAt: null,
		...patch,
		profile: { ...emptyProfile(), ...profilePatch }
	});

describe('exportFileName', () => {
	it('names the file by the local date', () => {
		expect(exportFileName(new Date(2026, 8, 20, 23, 59))).toBe('pagefifty-profile-2026-09-20.json');
	});

	it('pads month and day to two digits', () => {
		expect(exportFileName(new Date(2027, 0, 5, 0, 1))).toBe('pagefifty-profile-2027-01-05.json');
	});
});

describe('exportProfileJson', () => {
	it('gives the same bytes for two exports of one profile', () => {
		expect(exportProfileJson(sampleStored())).toBe(exportProfileJson(sampleStored()));
	});

	it('gives the same bytes whatever order the object was built in', () => {
		const stored = sampleStored();
		const reversed = Object.fromEntries(Object.entries(stored).reverse()) as StoredProfile;
		reversed.profile = Object.fromEntries(
			Object.entries(stored.profile).reverse()
		) as StoredProfile['profile'];
		expect(exportProfileJson(reversed)).toBe(exportProfileJson(stored));
	});

	it('writes lastExportedAt as null, so an export stamp does not change the next file', () => {
		const before = exportProfileJson(sampleStored(null));
		const after = exportProfileJson(sampleStored(EXPORTED_AT));
		expect(after).toBe(before);
		expect(JSON.parse(after).lastExportedAt).toBeNull();
	});
});

describe('importProfileFile', () => {
	it('reads an exported file back to the same stored profile, lastExportedAt null', async () => {
		const original = sampleStored(EXPORTED_AT);
		const result = await importProfileFile(fileOf('a.json', exportProfileJson(original)));
		expect(result).toEqual({ ok: true, stored: { ...original, lastExportedAt: null } });
	});

	it('keeps certificate and language entry order through export and import', async () => {
		const result = await importProfileFile(fileOf('a.json', exportProfileJson(sampleStored())));
		if (!result.ok) throw new Error('expected the import to pass');
		expect(result.stored.profile.certificates.map((entry) => entry.standard)).toEqual([
			'NEN 7510',
			'ISO 27001'
		]);
		expect(result.stored.profile.languages).toEqual(['nl', 'en']);
	});

	it.each([
		['an empty file', ''],
		['text', 'not json'],
		['cut-off JSON', '[1']
	])('refuses %s as not-json, naming the file', async (_what, text) => {
		const result = refusal(await importProfileFile(fileOf('broken.json', text)));
		expect(result.reason).toBe('not-json');
		expect(result.fileName).toBe('broken.json');
	});

	it.each([
		['no schemaVersion', '{"profile":{}}'],
		['a schemaVersion written as text', '{"schemaVersion":"1"}'],
		['a fractional schemaVersion', '{"schemaVersion":1.5}'],
		['schemaVersion 0', '{"schemaVersion":0}'],
		['JSON null', 'null'],
		['a list', '[1]']
	])('refuses %s as no-version', async (_what, text) => {
		const result = refusal(await importProfileFile(fileOf('old.json', text)));
		expect(result.reason).toBe('no-version');
		expect(result.fileName).toBe('old.json');
	});

	it('refuses a newer schemaVersion as newer-version, naming the version', async () => {
		const result = refusal(
			await importProfileFile(fileOf('future.json', envelopeText({ schemaVersion: 2 })))
		);
		expect(result.reason).toBe('newer-version');
		expect(result.version).toBe(2);
	});

	it('refuses a schema-invalid file with one entry per problem, each with the value found', async () => {
		const text = envelopeText(
			{},
			{
				staff: { total: -3, byRole: [], yearlyAverages: [] },
				turnover: [{ year: 2024, generalNet: '1,24 mln', specific: [] }]
			}
		);
		const result = refusal(await importProfileFile(fileOf('bad.json', text)));
		expect(result.reason).toBe('invalid');
		expect(result.fields).toHaveLength(2);
		expect(result.fields).toContainEqual({
			path: ['profile', 'staff', 'total'],
			problem: 'too_small',
			found: -3
		});
		expect(result.fields).toContainEqual({
			path: ['profile', 'turnover', 0, 'generalNet'],
			problem: 'invalid_type',
			found: '1,24 mln'
		});
	});

	it('refuses a file carrying an unknown key, naming the key', async () => {
		const text = envelopeText({}, { nickname: 'Brinky' });
		const result = refusal(await importProfileFile(fileOf('extra.json', text)));
		expect(result.reason).toBe('invalid');
		expect(result.fields).toEqual([
			{ path: ['profile', 'nickname'], problem: 'unrecognized_keys', found: 'Brinky' }
		]);
	});

	it('refuses a file with two figures for one year, naming each repeated year', async () => {
		const text = envelopeText(
			{},
			{
				turnover: [
					{ year: 2024, generalNet: 100000, specific: [] },
					{ year: 2024, generalNet: 5000000, specific: [] }
				],
				staff: {
					byRole: [],
					yearlyAverages: [
						{ year: 2025, average: 17.5 },
						{ year: 2025, average: 3 }
					]
				}
			}
		);
		const result = refusal(await importProfileFile(fileOf('twice.json', text)));
		expect(result.reason).toBe('invalid');
		expect(result.fields).toEqual([
			{ path: ['profile', 'turnover', 1, 'year'], problem: 'custom', found: 2024 },
			{ path: ['profile', 'staff', 'yearlyAverages', 1, 'year'], problem: 'custom', found: 2025 }
		]);
	});

	// The profile page lists certificates by name, and a name listed twice would stop it drawing.
	it('refuses a file holding one certificate twice, naming the repeated row', async () => {
		const text = envelopeText(
			{},
			{
				certificates: [
					{ standard: 'ISO 27001', validUntil: '2027-05-31' },
					{ standard: 'NEN 7510' },
					{ standard: ' ISO 27001 ' }
				]
			}
		);
		const result = refusal(await importProfileFile(fileOf('twice.json', text)));
		expect(result.reason).toBe('invalid');
		expect(result.fields).toEqual([
			{ path: ['profile', 'certificates', 2, 'standard'], problem: 'custom', found: ' ISO 27001 ' }
		]);
	});

	it('refuses a file carrying a __proto__ key, naming it, and pollutes nothing', async () => {
		const text = `{"__proto__":{"polluted":"yes"},${envelopeText({}).slice(1)}`;
		const result = refusal(await importProfileFile(fileOf('proto.json', text)));
		expect(result.reason).toBe('invalid');
		expect(result.fields).toEqual([
			{ path: ['__proto__'], problem: 'unrecognized_keys', found: { polluted: 'yes' } }
		]);
		expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
	});

	it('refuses a file over 256 KB without reading its text', async () => {
		const file = fileOf('huge.json', '{}', IMPORT_MAX_BYTES + 1);
		const result = refusal(await importProfileFile(file));
		expect(IMPORT_MAX_BYTES).toBe(262144);
		expect(result.reason).toBe('too-large');
		expect(file.text).not.toHaveBeenCalled();
	});

	it('reads a file of exactly 256 KB', async () => {
		const file = fileOf('edge.json', 'not json', IMPORT_MAX_BYTES);
		expect(refusal(await importProfileFile(file)).reason).toBe('not-json');
		expect(file.text).toHaveBeenCalledTimes(1);
	});

	it('refuses a file the browser cannot read as unreadable', async () => {
		const file: ProfileFile = {
			name: 'gone.json',
			size: 10,
			text: () => Promise.reject(new DOMException('gone', 'NotReadableError'))
		};
		expect(refusal(await importProfileFile(file)).reason).toBe('unreadable');
	});

	it('refuses a file a migration step cannot read as invalid, and never rejects', async () => {
		const throwing = vi.fn(() => {
			throw new TypeError('turnover is not a list');
		});
		const result = refusal(await importProfileFile(fileOf('old.json', envelopeText({})), throwing));
		expect(throwing).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ ok: false, reason: 'invalid', fileName: 'old.json' });
	});
});

describe('importProfileFile on hostile text', () => {
	const profileKeys = [...Object.keys(emptyProfile()), 'completedFinancialYears', 'nickname'];
	const hostile = fc.oneof(
		fc.string(),
		fc.json(),
		fc
			.dictionary(fc.constantFrom(...profileKeys), fc.jsonValue())
			.map((patch) => envelopeText({}, patch))
	);

	test.prop([hostile])(
		'never rejects, and passes only what the stored schema accepts',
		async (text) => {
			const result = await importProfileFile(fileOf('any.json', text));
			if (result.ok) {
				expect(StoredProfileSchema.safeParse(result.stored).success).toBe(true);
			} else {
				for (const field of result.fields ?? []) expect(Array.isArray(field.path)).toBe(true);
			}
		}
	);

	it('refuses a deeply nested file inside the size cap without throwing', async () => {
		const depth = 120_000;
		const text = '['.repeat(depth) + ']'.repeat(depth);
		expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(IMPORT_MAX_BYTES);
		const result = refusal(await importProfileFile(fileOf('deep.json', text)));
		expect(['not-json', 'no-version']).toContain(result.reason);
	});
});

describe('createImportQueue', () => {
	it('rejects only the import whose apply threw, and still applies the next file', async () => {
		let calls = 0;
		const enqueue = createImportQueue(() => {
			calls += 1;
			if (calls === 1) throw new Error('store broke');
			return 'saved' as const;
		});
		const first = enqueue(fileOf('a.json', exportProfileJson(sampleStored())));
		const second = enqueue(fileOf('b.json', exportProfileJson(sampleStored())));
		await expect(first).rejects.toThrow('store broke');
		await expect(second).resolves.toMatchObject({ ok: true, applied: 'saved' });
	});

	function queueOverStorage() {
		let stored: StoredProfile | null = null;
		const apply = vi.fn((next: StoredProfile) => {
			stored = next;
		});
		return { enqueue: createImportQueue(apply), apply, current: () => stored };
	}

	it('starts every read at once and stores the last file started, even when its read ends first', async () => {
		const readA = deferred<string>();
		const readB = deferred<string>();
		const fileA: ProfileFile = { name: 'a.json', size: 10, text: vi.fn(() => readA.promise) };
		const fileB: ProfileFile = { name: 'b.json', size: 10, text: vi.fn(() => readB.promise) };
		const { enqueue, apply, current } = queueOverStorage();
		const doneA = enqueue(fileA);
		const doneB = enqueue(fileB);
		expect(fileA.text).toHaveBeenCalledTimes(1);
		expect(fileB.text).toHaveBeenCalledTimes(1);
		readB.resolve(exportProfileJson({ ...sampleStored(), savedAt: EXPORTED_AT }));
		await Promise.resolve();
		await Promise.resolve();
		expect(apply).not.toHaveBeenCalled();
		readA.resolve(exportProfileJson(sampleStored()));
		await Promise.all([doneA, doneB]);
		expect(apply.mock.calls.map(([stored]) => stored.savedAt)).toEqual([SAVED_AT, EXPORTED_AT]);
		expect(current()?.savedAt).toBe(EXPORTED_AT);
	});

	it('keeps the earlier valid file when the later one is refused, never a merge', async () => {
		const { enqueue, apply, current } = queueOverStorage();
		const doneA = enqueue(fileOf('a.json', exportProfileJson(sampleStored())));
		const doneB = enqueue(fileOf('b.json', envelopeText({}, { nickname: 'x' })));
		const [resultA, resultB] = await Promise.all([doneA, doneB]);
		expect(resultA.ok).toBe(true);
		expect(refusal(resultB).reason).toBe('invalid');
		expect(apply).toHaveBeenCalledTimes(1);
		expect(current()).toEqual(sampleStored());
	});

	it('carries what apply answered, so a file the store refused is never reported as stored', async () => {
		const enqueue = createImportQueue(() => 'failed' as const);
		const result = await enqueue(fileOf('a.json', exportProfileJson(sampleStored())));
		expect(result).toMatchObject({ ok: true, applied: 'failed' });
	});

	it('keeps applying later files after an earlier import fails to run', async () => {
		const { enqueue, current } = queueOverStorage();
		const failing: ProfileFile = {
			name: 'x.json',
			size: 10,
			text: () => {
				throw new TypeError('not a file');
			}
		};
		await expect(enqueue(failing)).resolves.toMatchObject({ ok: false, reason: 'unreadable' });
		await enqueue(fileOf('a.json', exportProfileJson(sampleStored())));
		expect(current()).toEqual(sampleStored());
	});
});

describe('downloadProfile', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('downloads the canonical export under the dated name, then releases the URL', async () => {
		vi.useFakeTimers();
		const blobs: Blob[] = [];
		vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
			blobs.push(blob as Blob);
			return 'blob:pagefifty-test';
		});
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
		const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
		const appendChild = vi.fn();
		const doc = { createElement: vi.fn(() => link), body: { appendChild } } as unknown as Document;

		const name = downloadProfile(sampleStored(EXPORTED_AT), new Date(2026, 8, 20, 12), doc);

		expect(name).toBe('pagefifty-profile-2026-09-20.json');
		expect(doc.createElement).toHaveBeenCalledWith('a');
		expect(link.href).toBe('blob:pagefifty-test');
		expect(link.download).toBe(name);
		expect(appendChild).toHaveBeenCalledWith(link);
		expect(link.click).toHaveBeenCalledTimes(1);
		expect(link.remove).toHaveBeenCalledTimes(1);
		expect(blobs).toHaveLength(1);
		expect(blobs[0].type).toBe('application/json');
		expect(await blobs[0].text()).toBe(exportProfileJson(sampleStored()));
		expect(revoke).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(revoke).toHaveBeenCalledWith('blob:pagefifty-test');
	});
});
