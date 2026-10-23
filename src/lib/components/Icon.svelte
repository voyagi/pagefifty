<script lang="ts" module>
	type Shape =
		| { kind: 'path'; d: string }
		| { kind: 'circle'; cx: number; cy: number; r: number; dash?: string }
		| { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number };

	const path = (d: string): Shape => ({ kind: 'path', d });
	// Most state marks draw on the same ring, so it is written once.
	const RING: Shape = { kind: 'circle', cx: 8, cy: 8, r: 6.2 };

	// One line set on a 16px grid, drawn at one stroke, so every mark on a page reads as one family.
	// The states are told apart by shape as well as by the word beside them, never by colour.
	const ICONS = {
		met: [RING, path('m5.4 8.2 1.8 1.8 3.5-3.8')],
		short: [RING, path('m6 6 4 4m0-4-4 4')],
		partner: [RING, path('M8 5.4v5.2M5.4 8h5.2')],
		unread: [{ kind: 'circle', cx: 8, cy: 8, r: 6.2, dash: '2.3 2.1' }],
		info: [RING, path('M8 7.4v3.6M8 5.1h.01')],
		clock: [RING, path('M8 4.6V8l2.3 1.5')],
		doc: [
			path('M4 1.8h5.4L12.6 5v8.4a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V2.6a.8.8 0 0 1 .8-.8Z'),
			path('M9.2 1.8V5.2h3.4')
		],
		out: [
			path(
				'M9.5 2.5h4v4M13.5 2.5 7.8 8.2M12 9.5v3.2a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8V4.8a.8.8 0 0 1 .8-.8h3.2'
			)
		],
		euro: [path('M11.8 4.4a4.6 4.6 0 1 0 0 7.2M2.6 6.8h6.2M2.6 9.2h6.2')],
		pin: [
			path('M8 14.2s4.6-4.1 4.6-7.6a4.6 4.6 0 0 0-9.2 0c0 3.5 4.6 7.6 4.6 7.6Z'),
			{ kind: 'circle', cx: 8, cy: 6.6, r: 1.6 }
		],
		cal: [
			{ kind: 'rect', x: 2.2, y: 3.2, width: 11.6, height: 10.6, rx: 1.6 },
			path('M2.2 6.6h11.6M5.4 1.8v2.6M10.6 1.8v2.6')
		],
		sort: [path('M5 3v10M2.6 10.6 5 13l2.4-2.4M11 13V3M8.6 5.4 11 3l2.4 2.4')],
		hash: [path('M6 2.5 5 13.5M11 2.5 10 13.5M2.8 5.8h10.6M2.6 10.2h10.6')],
		users: [
			{ kind: 'circle', cx: 6, cy: 5.4, r: 2.4 },
			path(
				'M1.8 13.2c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6M10.6 3.2a2.4 2.4 0 0 1 0 4.5M12.1 9.8c1 .6 1.8 1.7 2.1 3.4'
			)
		],
		arrow: [path('M3 8h10M9 4l4 4-4 4')],
		chev: [path('m4.5 6.2 3.5 3.5 3.5-3.5')],
		link: [
			path(
				'M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.6.6M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.5 8.8a2.6 2.6 0 0 0 3.7 3.7l.6-.6'
			)
		],
		lines: [path('M3.5 5h9M3.5 8h9M3.5 11h5.5')],
		device: [
			{ kind: 'rect', x: 1.8, y: 2.8, width: 12.4, height: 8.4, rx: 1 },
			path('M5.6 13.6h4.8M8 11.2v2.4')
		]
	} satisfies Record<string, readonly Shape[]>;
</script>

<script lang="ts">
	// Always decorative: the word beside an icon carries its meaning, so the icon is hidden from
	// assistive technology and never the only label of a control.
	let { name }: { name: keyof typeof ICONS } = $props();

	const shapes: readonly Shape[] = $derived(ICONS[name]);
</script>

<svg
	class="icon"
	viewBox="0 0 16 16"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#each shapes as shape, index (index)}
		{#if shape.kind === 'path'}
			<path d={shape.d} />
		{:else if shape.kind === 'circle'}
			<circle cx={shape.cx} cy={shape.cy} r={shape.r} stroke-dasharray={shape.dash} />
		{:else}
			<rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />
		{/if}
	{/each}
</svg>

<style>
	.icon {
		flex: none;
		width: 16px;
		height: 16px;
	}
</style>
