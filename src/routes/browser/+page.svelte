<script lang="ts">
	/**
	 * 方案B prototype: the shared browser, in a kitchen tab.
	 *
	 * Frames arrive over /browser/ws (CDP screencast); pointer + keyboard events
	 * go back over the same socket and are dispatched into the page. The agent
	 * drives the same Chromium over CDP — both audiences share one browser.
	 */
	import { onMount } from "svelte";

	let imgSrc = $state("");
	let pageUrl = $state("");
	let pageTitle = $state("");
	let address = $state("");
	let connected = $state(false);
	let focused = $state(false);

	let ws: WebSocket | null = null;
	// The shared browser's real viewport. Frames are scaled to fit; coords map back.
	const VW = 1280;
	const VH = 800;

	const VKEYS: Record<string, number> = {
		Enter: 13, Escape: 27, Backspace: 8, Tab: 9, Delete: 46,
		ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
		Home: 36, End: 35, PageUp: 33, PageDown: 34,
	};

	onMount(() => {
		connect();
		return () => ws?.close();
	});

	function connect() {
		const proto = location.protocol === "https:" ? "wss" : "ws";
		ws = new WebSocket(`${proto}://${location.host}/browser/ws`);
		ws.onopen = () => (connected = true);
		ws.onclose = () => {
			connected = false;
			setTimeout(connect, 1000);
		};
		ws.onmessage = (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.type === "frame") imgSrc = `data:image/jpeg;base64,${msg.data}`;
			else if (msg.type === "meta") {
				pageUrl = msg.url;
				pageTitle = msg.title;
				if (document.activeElement !== addrEl) address = msg.url;
			}
		};
	}

	function send(msg: Record<string, unknown>) {
		if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}

	let addrEl: HTMLInputElement;
	function submitAddress(e: SubmitEvent) {
		e.preventDefault();
		send({ type: "goto", url: address });
		addrEl.blur();
	}

	function coords(e: PointerEvent | WheelEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return {
			x: Math.round(((e.clientX - r.left) / r.width) * VW),
			y: Math.round(((e.clientY - r.top) / r.height) * VH),
		};
	}
	const buttonName = (b: number) => (b === 0 ? "left" : b === 1 ? "middle" : "right");

	let lastMove = 0;
	function onPointerMove(e: PointerEvent) {
		const now = Date.now();
		if (now - lastMove < 80) return;
		lastMove = now;
		send({ type: "mouse", kind: "mouseMoved", ...coords(e) });
	}
	function onPointerDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).focus();
		send({ type: "mouse", kind: "mousePressed", ...coords(e), button: buttonName(e.button), clickCount: e.detail || 1 });
	}
	function onPointerUp(e: PointerEvent) {
		send({ type: "mouse", kind: "mouseReleased", ...coords(e), button: buttonName(e.button), clickCount: 1 });
	}
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		send({ type: "mouse", kind: "mouseWheel", ...coords(e), deltaX: e.deltaX, deltaY: e.deltaY });
	}
	function onKeyDown(e: KeyboardEvent) {
		e.preventDefault();
		const modifiers = (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
		if (e.key.length === 1) {
			send({ type: "key", key: e.key, code: e.code, text: e.key, modifiers });
		} else {
			send({ type: "key", key: e.key, code: e.code, vkey: VKEYS[e.key] ?? 0, modifiers });
		}
	}
</script>

<svelte:head>
	<title>browser · kitchen</title>
</svelte:head>

<div class="fixed inset-0 z-40 flex flex-col bg-black text-neutral-300">
	<!-- faux chrome toolbar -->
	<div class="flex items-center gap-1 border-b border-neutral-800 bg-neutral-950 px-2 py-1.5">
		<button class="px-2 py-1 hover:bg-neutral-800 rounded" title="Back" onclick={() => send({ type: "back" })}>←</button>
		<button class="px-2 py-1 hover:bg-neutral-800 rounded" title="Forward" onclick={() => send({ type: "forward" })}>→</button>
		<button class="px-2 py-1 hover:bg-neutral-800 rounded" title="Reload" onclick={() => send({ type: "reload" })}>↻</button>
		<form onsubmit={submitAddress} class="flex-1">
			<input
				bind:this={addrEl}
				bind:value={address}
				class="w-full rounded-full bg-neutral-900 px-3 py-1 font-mono text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-neutral-600"
				placeholder="Enter a URL"
				spellcheck="false"
			/>
		</form>
		<span class="ml-2 font-mono text-[11px]" class:text-emerald-400={connected} class:text-neutral-600={!connected}>
			{connected ? "● live — shared with agent" : "○ reconnecting…"}
		</span>
	</div>

	<!-- the shared screen -->
	<div class="grid min-h-0 flex-1 place-items-center overflow-hidden">
		<div
			class="relative outline-none ring-0"
			class:cursor-text={false}
			style:aspect-ratio="{VW}/{VH}"
			style:max-width="100%"
			style:max-height="100%"
			style:width="min(100%, calc((100vh - 76px) * {VW / VH}))"
			tabindex="0"
			role="application"
			aria-label="Shared browser screen; the agent controls this browser too"
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			onpointermove={onPointerMove}
			onpointerdown={onPointerDown}
			onpointerup={onPointerUp}
			onwheel={onWheel}
			onkeydown={onKeyDown}
		>
			{#if imgSrc}
				<img src={imgSrc} alt="shared browser" class="h-full w-full select-none" draggable="false" />
			{:else}
				<p class="p-6 font-mono text-sm text-neutral-600">connecting to the shared browser…</p>
			{/if}
			{#if !focused}
				<div class="absolute inset-x-0 bottom-0 bg-neutral-950/80 py-1 text-center font-mono text-[11px] text-neutral-500">
					click the screen to give it your keyboard — the agent still sees everything you do
				</div>
			{/if}
		</div>
	</div>

	<div class="truncate border-t border-neutral-800 bg-neutral-950 px-3 py-1 font-mono text-[11px] text-neutral-500">
		{pageTitle || "—"} · {pageUrl}
	</div>
</div>
