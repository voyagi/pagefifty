// Setup file for the jsdom project. TenderPage and FirmSlot load the profile store with a dynamic
// import once mounted, and a test can end before that import and its chain have loaded. A load still
// running when the file's environment is torn down throws outside any test, so a run fails with every
// test passed; coverage instrumentation slows module loading, which is why CI saw it first. Waiting
// after each test for every pending import leaves none loading at teardown.
import { afterEach, vi } from 'vitest';

afterEach(async () => {
	await vi.dynamicImportSettled();
});
