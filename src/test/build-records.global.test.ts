import { describe, expect, it } from 'vitest';
import { describeFailedBuild } from './build-records.global';

describe('describeFailedBuild', () => {
	it('names the exit code and keeps the output of a build that failed', () => {
		const run = { status: 1, signal: null, stdout: 'out\n', stderr: 'err\n' };
		expect(describeFailedBuild(run)).toBe('build-records exited 1:\nout\nerr\n');
	});

	it('names the signal that stopped a build, with no output', () => {
		const run = { status: null, signal: 'SIGTERM' as const, stdout: null, stderr: null };
		expect(describeFailedBuild(run)).toBe('build-records was stopped by SIGTERM:\n');
	});

	it('names why a build did not complete, before any signal', () => {
		const run = {
			status: null,
			signal: 'SIGTERM' as const,
			stdout: '',
			stderr: '',
			error: new Error('spawnSync node ETIMEDOUT')
		};
		expect(describeFailedBuild(run)).toBe(
			'build-records did not complete (spawnSync node ETIMEDOUT):\n'
		);
	});
});
