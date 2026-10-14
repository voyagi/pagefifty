// TED's notice XML exactly as served, kept across runs under .capture-cache/xml/ (D-13): a later
// scrub fix is applied again from these bytes. Imported under Node type stripping: erasable syntax.
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { NOTICE_NUMBER } from '../snapshot/index-row.ts';

const XML = '.xml';
const TEMP = '.tmp';

export function createXmlCache(dir: string, pid: number) {
	const xmlDir = join(dir, 'xml');

	// The number becomes a file name, so only TED's shape gets that far.
	const pathOf = (number: string): string => {
		if (!NOTICE_NUMBER.test(number)) {
			throw new Error(`xml cache: ${JSON.stringify(number)} is not a TED notice number`);
		}
		return join(xmlDir, `${number}${XML}`);
	};

	return {
		has: (number: string): boolean => existsSync(pathOf(number)),
		read: (number: string): Uint8Array<ArrayBuffer> => new Uint8Array(readFileSync(pathOf(number))),
		// An interrupted write leaves only a .tmp name, which no reader takes for a notice.
		write(number: string, bytes: Uint8Array): void {
			const path = pathOf(number);
			const temp = `${path}.${pid}${TEMP}`;
			mkdirSync(xmlDir, { recursive: true });
			rmSync(temp, { force: true });
			writeFileSync(temp, bytes, { flag: 'wx' });
			renameSync(temp, path);
		},
		removeTemp(): number {
			if (!existsSync(xmlDir)) return 0;
			const temps = readdirSync(xmlDir).filter((name) => name.endsWith(TEMP));
			for (const name of temps) rmSync(join(xmlDir, name), { force: true });
			return temps.length;
		},
		prune(keep: ReadonlySet<string>): string[] {
			if (!existsSync(xmlDir)) return [];
			const deleted: string[] = [];
			for (const name of readdirSync(xmlDir)) {
				const number = name.slice(0, -XML.length);
				if (!name.endsWith(XML) || !NOTICE_NUMBER.test(number) || keep.has(number)) continue;
				rmSync(join(xmlDir, name), { force: true });
				deleted.push(number);
			}
			return deleted.sort();
		}
	};
}
