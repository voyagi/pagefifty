import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { loadEnv } from 'vite';
import { describe, expect, it } from 'vitest';

// The root env file holds the real provider keys. Three loaders would hand them to dev and preview:
// wrangler's dotenv step (the variable), a .dev.vars file (skipped once an env file list is given)
// and SvelteKit's own loadEnv into $env/dynamic/private (closed by pointing env.dir at env/). The
// rules read the files that set each closure, so removing one fails here before any key moves.
// loadEnv also returns every variable of the shell that runs Vite, which no env file setting can
// close; the probe below leaves those out, and the no-private-env import rule covers that route.
const EMPTY_ENV = 'env/no-keys.env';
const PREVIEW = 'node scripts/preview.mjs';

interface DevFiles {
	packageJson: string;
	viteConfig: string;
	previewScript: string;
}

function parse(name: string, text: string): ts.SourceFile {
	const kind = name.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
	return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind);
}

function nodesOf<T extends ts.Node>(root: ts.Node, match: (node: ts.Node) => node is T): T[] {
	const found: T[] = [];
	const visit = (node: ts.Node): void => {
		if (match(node)) found.push(node);
		ts.forEachChild(node, visit);
	};
	visit(root);
	return found;
}

function callsTo(root: ts.Node, callee: string): ts.CallExpression[] {
	return nodesOf(root, ts.isCallExpression).filter(
		(call) => ts.isIdentifier(call.expression) && call.expression.text === callee
	);
}

function nameOf(name: ts.PropertyName): string | undefined {
	return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

function property(node: ts.Node | undefined, name: string): ts.Expression | undefined {
	if (node === undefined || !ts.isObjectLiteralExpression(node)) return undefined;
	const found = node.properties.find(
		(prop) => ts.isPropertyAssignment(prop) && nameOf(prop.name) === name
	);
	return found && ts.isPropertyAssignment(found) ? found.initializer : undefined;
}

function isText(node: ts.Node | undefined, value: string): boolean {
	return node !== undefined && ts.isStringLiteralLike(node) && node.text === value;
}

// One shell command per segment between line breaks, &&, ||, ;, | and & (cmd.exe's separator),
// split into words, each stripped of the shell's grouping and quoting at its ends, so a subshell, a
// command substitution or a quoted word reads as the bare word. A wrangler run is a segment holding
// a wrangler binary (any of the package's three names, by name or path, as its .js file or npm's
// Windows .cmd and .ps1 launchers, with or without an @version) and a dev or types word anywhere
// after it, so a flag before the command or a second run on the same line is still a run.
const WRANGLER_BIN = /(^|[/\\])(cf-wrangler|wrangler2?)(\.js|\.cmd|\.ps1)?(@\S*)?$/i;
const SHELL_WRAPPING = /^(\$\(|[("'`])+|[)"'`]+$/g;

// With this variable set to anything but false, wrangler adds the whole shell environment to the
// env files it loads, so a run that names only the empty file still hands the Worker every exported
// key. No script may set it anywhere, whether it runs wrangler itself or through another script
// (npm run build): a prefix, env, cross-env, export or cmd.exe's set, which can sit in an earlier
// segment than the run.
const INCLUDES_SHELL = /CLOUDFLARE_INCLUDE_PROCESS_ENV=(?!false\b)/i;

function wranglerRuns(command: string): string[][] {
	return command
		.split(/\r?\n|&&|\|\||[;|&]/)
		.map((segment) =>
			segment
				.trim()
				.split(/\s+/)
				.map((word) => word.replace(SHELL_WRAPPING, ''))
		)
		.filter((words) => {
			const at = words.findIndex((word) => WRANGLER_BIN.test(word));
			return at >= 0 && words.slice(at + 1).some((word) => word === 'dev' || word === 'types');
		});
}

function envFilesOf(words: readonly string[]): string[] {
	return words.flatMap((word, at) => {
		if (word === '--env-file') return [words[at + 1] ?? ''];
		return word.startsWith('--env-file=')
			? [word.slice('--env-file='.length).replace(SHELL_WRAPPING, '')]
			: [];
	});
}

function scriptProblems(packageJson: string): string[] {
	const scripts = (JSON.parse(packageJson) as { scripts: Record<string, string> }).scripts;
	const problems: string[] = [];
	if (scripts.preview !== PREVIEW) {
		problems.push(`preview: scripts.preview is ${JSON.stringify(scripts.preview)}, not ${PREVIEW}`);
	}
	// scripts.preview has its own exact rule above, so a planted wrangler dev there is one problem.
	for (const [name, command] of Object.entries(scripts)) {
		if (name === 'preview') continue;
		const runs = wranglerRuns(command);
		const loose = runs.filter((words) => {
			const files = envFilesOf(words);
			return files.length !== 1 || files[0] !== EMPTY_ENV;
		});
		if (loose.length > 0 || INCLUDES_SHELL.test(command)) {
			problems.push(
				`wrangler-env-file: scripts.${name} can run wrangler with more than the empty env file`
			);
		}
	}
	return problems;
}

function setsVariableDirectly(source: ts.SourceFile): boolean {
	const callback = callsTo(source, 'defineConfig')[0]?.arguments[0];
	if (callback === undefined || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) {
		return false;
	}
	return callback.body.statements.some((statement) => {
		if (!ts.isExpressionStatement(statement)) return false;
		const expression = statement.expression;
		return (
			ts.isBinaryExpression(expression) &&
			expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			expression.left.getText() === 'process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV' &&
			isText(expression.right, 'false')
		);
	});
}

function namesOnlyTheEmptyFile(node: ts.Expression | undefined): boolean {
	return (
		node !== undefined &&
		ts.isArrayLiteralExpression(node) &&
		node.elements.length === 1 &&
		isText(node.elements[0], EMPTY_ENV)
	);
}

function viteProblems(viteConfig: string): string[] {
	const source = parse('vite.config.ts', viteConfig);
	const problems: string[] = [];
	if (!setsVariableDirectly(source)) {
		problems.push(
			"vite-variable: the defineConfig callback does not set CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV to 'false' as a direct statement"
		);
	}
	const platformProxy = property(callsTo(source, 'adapter')[0]?.arguments[0], 'platformProxy');
	if (!namesOnlyTheEmptyFile(property(platformProxy, 'envFiles'))) {
		problems.push(`platform-proxy: adapter() is not given platformProxy.envFiles ['${EMPTY_ENV}']`);
	}
	const kitEnv = property(callsTo(source, 'sveltekit')[0]?.arguments[0], 'env');
	if (!isText(property(kitEnv, 'dir'), 'env')) {
		problems.push("kit-env-dir: sveltekit() is not given env.dir 'env'");
	}
	return problems;
}

function assignsFalse(source: ts.SourceFile, name: string): boolean {
	return nodesOf(source, ts.isPropertyAssignment).some(
		(prop) => nameOf(prop.name) === name && isText(prop.initializer, 'false')
	);
}

// The envFile value itself must name the empty file; the name elsewhere (a comment) proves nothing.
function namesEmptyFile(node: ts.Expression | undefined): boolean {
	return (
		node !== undefined &&
		(isText(node, EMPTY_ENV) ||
			nodesOf(node, ts.isStringLiteralLike).some((literal) => literal.text === EMPTY_ENV))
	);
}

function previewScriptProblems(previewScript: string): string[] {
	const source = parse('preview.mjs', previewScript);
	const passesEnvFile = callsTo(source, 'wranglerDevArgs').some((call) =>
		namesEmptyFile(property(call.arguments[0], 'envFile'))
	);
	const closed =
		passesEnvFile &&
		assignsFalse(source, 'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV') &&
		assignsFalse(source, 'CLOUDFLARE_INCLUDE_PROCESS_ENV');
	return closed
		? []
		: [
				`preview-script: scripts/preview.mjs does not pass ${EMPTY_ENV} to wranglerDevArgs with both Cloudflare env variables 'false'`
			];
}

function devEnvProblems({ packageJson, viteConfig, previewScript }: DevFiles): string[] {
	return [
		...scriptProblems(packageJson),
		...viteProblems(viteConfig),
		...previewScriptProblems(previewScript)
	];
}

function envFolderProblems(tracked: readonly string[], bytes: number | undefined): string[] {
	if (tracked.length === 1 && tracked[0] === EMPTY_ENV && bytes === 0) return [];
	return [
		`env-folder: env/ tracks ${JSON.stringify(tracked)} and ${EMPTY_ENV} holds ${bytes} bytes`
	];
}

const ruleOf = (problem: string) => problem.slice(0, problem.indexOf(':'));

function realFiles(): DevFiles {
	const preview = join('scripts', 'preview.mjs');
	return {
		packageJson: readFileSync('package.json', 'utf8'),
		viteConfig: readFileSync('vite.config.ts', 'utf8'),
		previewScript: existsSync(preview) ? readFileSync(preview, 'utf8') : ''
	};
}

function plant(text: string, from: RegExp | string, to: string): string {
	const planted = text.replace(from, to);
	if (planted === text) throw new Error(`the plant ${String(from)} did not apply`);
	return planted;
}

function withScript(packageJson: string, name: string, command: string): string {
	const parsed = JSON.parse(packageJson) as { scripts: Record<string, string> };
	parsed.scripts[name] = command;
	return JSON.stringify(parsed);
}

describe('dev and preview start without the root env file keys', () => {
	it('finds no problem in package.json, vite.config.ts and scripts/preview.mjs', () => {
		expect(devEnvProblems(realFiles())).toEqual([]);
	});

	it('finds exactly the empty env file tracked under env/', () => {
		const tracked = execFileSync('git', ['ls-files', '--', 'env'], { encoding: 'utf8' })
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		const bytes = existsSync(EMPTY_ENV) ? statSync(EMPTY_ENV).size : undefined;
		expect(envFolderProblems(tracked, bytes)).toEqual([]);
	});

	it('names a second file or a non-empty one under env/', () => {
		expect(envFolderProblems([EMPTY_ENV, 'env/.env'], 0).map(ruleOf)).toEqual(['env-folder']);
		expect(envFolderProblems([EMPTY_ENV], 12).map(ruleOf)).toEqual(['env-folder']);
	});
});

describe('each planted defect fails only its own rule', () => {
	const real = realFiles();
	const rulesWith = (changed: Partial<DevFiles>) =>
		devEnvProblems({ ...real, ...changed }).map(ruleOf);

	it('preview back to a bare wrangler dev', () => {
		const packageJson = withScript(
			real.packageJson,
			'preview',
			'wrangler dev .svelte-kit/cloudflare/_worker.js --port 4173'
		);
		expect(rulesWith({ packageJson })).toEqual(['preview']);
	});

	it('a wrangler types script without the empty env file', () => {
		const packageJson = withScript(real.packageJson, 'gen', 'wrangler types');
		expect(rulesWith({ packageJson })).toEqual(['wrangler-env-file']);
	});

	// Each spelling runs a wrangler dev or types that loads more than the empty file.
	it.each([
		['a second run after ;', 'wrangler types --env-file env/no-keys.env; wrangler types'],
		['a second run after ||', 'wrangler types --env-file env/no-keys.env || wrangler types'],
		['a second run after a pipe', 'wrangler types --env-file env/no-keys.env | wrangler dev'],
		['two spaces before the command', 'wrangler  types'],
		['a flag before the command', 'wrangler --cwd . types'],
		['the root file named beside it', 'wrangler types --env-file env/no-keys.env --env-file .env'],
		['another file in the = form', 'wrangler dev --env-file=.env'],
		['a file that only starts with the name', 'wrangler types --env-file env/no-keys.env.bak'],
		['the binary by path', 'node node_modules/wrangler/bin/wrangler.js types'],
		['a second run after a single &', 'wrangler types --env-file env/no-keys.env & wrangler types'],
		['the wrangler2 alias', 'wrangler2 types'],
		['the cf-wrangler alias', 'npx cf-wrangler dev'],
		['a pinned version', 'npx wrangler@4.131.1 types'],
		['the npm Windows launcher', 'node_modules\\.bin\\wrangler.cmd types'],
		['the npm PowerShell launcher', 'node_modules/.bin/wrangler.ps1 dev'],
		[
			'the shell added by a prefix',
			'CLOUDFLARE_INCLUDE_PROCESS_ENV=true wrangler dev --env-file env/no-keys.env'
		],
		[
			"the shell added by cmd.exe's set in an earlier segment",
			'set CLOUDFLARE_INCLUDE_PROCESS_ENV=1&& wrangler types --env-file env/no-keys.env'
		],
		[
			'the shell added before another script that runs wrangler',
			'CLOUDFLARE_INCLUDE_PROCESS_ENV=true npm run build'
		],
		['the shell added before vite', 'cross-env CLOUDFLARE_INCLUDE_PROCESS_ENV=1 vite dev'],
		['a second run on its own line', 'wrangler types --env-file env/no-keys.env\nwrangler types'],
		['a run in a subshell', '(wrangler types)'],
		['a quoted binary', '"wrangler" dev'],
		['a run in a command substitution', 'echo $(wrangler types)']
	])('%s', (_label, command) => {
		const packageJson = withScript(real.packageJson, 'gen', command);
		expect(rulesWith({ packageJson })).toEqual(['wrangler-env-file']);
	});

	it.each([
		['the = form of the empty file', 'wrangler types --env-file=env/no-keys.env && vite build'],
		['a wrangler command that reads no env file', 'wrangler deploy --dry-run'],
		[
			'the shell variable set to false',
			'CLOUDFLARE_INCLUDE_PROCESS_ENV=false wrangler types --env-file env/no-keys.env'
		],
		['a quoted empty file', 'wrangler types --env-file "env/no-keys.env"'],
		['a quoted empty file in the = form', 'wrangler types --env-file="env/no-keys.env"']
	])('accepts %s', (_label, command) => {
		const packageJson = withScript(real.packageJson, 'gen', command);
		expect(rulesWith({ packageJson })).toEqual([]);
	});

	it('the vite variable set only inside an if block', () => {
		const viteConfig = plant(
			real.viteConfig,
			"process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';",
			"if (mode === 'test') {\n\t\tprocess.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';\n\t}"
		);
		expect(rulesWith({ viteConfig })).toEqual(['vite-variable']);
	});

	it('the envFiles option removed', () => {
		const viteConfig = plant(real.viteConfig, /envFiles:\s*\[[^\]]*\]/, '');
		expect(rulesWith({ viteConfig })).toEqual(['platform-proxy']);
	});

	it('the env dir option removed', () => {
		const viteConfig = plant(real.viteConfig, /\benv:\s*\{\s*dir:\s*'env'\s*\},?/, '');
		expect(rulesWith({ viteConfig })).toEqual(['kit-env-dir']);
	});

	it('preview.mjs naming another env file while a comment names the empty one', () => {
		const previewScript = plant(
			`// ${EMPTY_ENV}\n${real.previewScript}`,
			/envFile: join\(repository, '[^']+'\)/,
			"envFile: join(repository, '.dev.vars')"
		);
		expect(rulesWith({ previewScript })).toEqual(['preview-script']);
	});

	it('preview.mjs without CLOUDFLARE_INCLUDE_PROCESS_ENV', () => {
		const lines = real.previewScript.split('\n');
		const kept = lines.filter((line) => !line.includes('CLOUDFLARE_INCLUDE_PROCESS_ENV:'));
		expect(kept.length).toBe(lines.length - 1);
		expect(rulesWith({ previewScript: kept.join('\n') })).toEqual(['preview-script']);
	});
});

describe("SvelteKit's loadEnv over env/", () => {
	const fromFiles = (dir: string, mode: string) =>
		Object.keys(loadEnv(mode, dir, '')).filter((name) => !(name in process.env));

	it.each(['development', 'production', 'test'])('adds no key in mode %s', (mode) => {
		expect(fromFiles('env', mode)).toEqual([]);
	});

	it('returns a key a planted env file holds', () => {
		const folder = mkdtempSync(join(tmpdir(), 'pagefifty-loadenv-'));
		try {
			writeFileSync(join(folder, '.env'), 'PAGEFIFTY_PROBE_ONLY_IN_FILE=x\n');
			expect(fromFiles(folder, 'development')).toEqual(['PAGEFIFTY_PROBE_ONLY_IN_FILE']);
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	});
});
