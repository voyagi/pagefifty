// close-pages.devbrowser.js - closes every named page left open in the test browser. A driver stopped
// at its time limit never reaches the closePage in its finally, and a page left open that way made
// the next page on the same site crash on its first goto (plan 01-16), so scripts/e2e.mjs runs this
// after any driver that did not finish. It sits in a subfolder, which no run reads for drivers.
// Runs in the dev-browser QuickJS sandbox.

const closed = [];
for (const open of await browser.listPages()) {
	if (!open.name) continue;
	await browser.closePage(open.name);
	closed.push(open.name);
}
const left = (await browser.listPages()).filter((open) => open.name).map((open) => open.name);
console.log(
	`closed ${closed.length} named pages (${closed.join(', ') || 'none'}), ${left.length} left`
);
