import { chromium } from "playwright-core";
import { WebSocketServer } from "ws";

/**
 * Shared-browser bridge (方案B prototype): the agent drives a real Chromium over
 * CDP; humans watch AND control the same browser through the kitchen tab.
 *
 * A Vite dev-server plugin that owns WS /browser/ws:
 *   down: CDP Page.startScreencast → jpeg frames broadcast to all clients
 *   up:   JSON commands (goto/back/reload/mouse/keys) → Input.* CDP dispatch
 *
 * In production this bridge moves into the sandbox "cast daemon" behind the
 * tunnel; the seam is identical, only the CDP URL changes.
 */
const CDP_URL = process.env.BROWSER_CDP_URL ?? "http://127.0.0.1:9222";
const WS_PATH = "/browser/ws";

/** @type {import("playwright-core").Browser | null} */
let browser = null;
/** @type {import("playwright-core").Page | null} */
let page = null;
/** @type {import("playwright-core").CDPSession | null} */
let cdp = null;
/** @type {Set<import("ws").WebSocket>} */
const clients = new Set();

/** @param {Record<string, unknown>} msg */
function broadcast(msg) {
	const s = JSON.stringify(msg);
	for (const ws of clients) if (ws.readyState === 1) ws.send(s);
}

async function meta() {
	if (!page) return { type: "error", message: "browser unreachable" };
	return { type: "meta", url: page.url(), title: await page.title().catch(() => "") };
}

async function ensureBrowser() {
	if (!browser || !browser.isConnected()) {
		browser = await chromium.connectOverCDP(CDP_URL);
		cdp = null;
		const ctx = browser.contexts()[0] ?? (await browser.newContext());
		page = ctx.pages()[0] ?? (await ctx.newPage());
		page.on("framenavigated", async (frame) => {
			if (page && frame === page.mainFrame()) broadcast(await meta());
		});
	}
	return page;
}

async function startCast() {
	if (cdp || !page) return;
	cdp = await page.context().newCDPSession(page);
	cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
		broadcast({ type: "frame", data });
		try {
			await cdp?.send("Page.screencastFrameAck", { sessionId });
		} catch {}
	});
	// Note: devicePixelRatio is owned by the actor browser itself (playwright
	// sets it at page creation); we only choose frame compression here.
	await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
}

async function stopCast() {
	try {
		await cdp?.send("Page.stopScreencast");
	} catch {}
	cdp = null;
}

/** @param {unknown} raw */
function normalizeUrl(raw) {
	const u = String(raw).trim();
	if (/^(https?|data|about|file):/.test(u)) return u;
	if (/^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(:\d+)?(\/|$)/.test(u)) return `http://${u}`;
	return `https://${u}`;
}

/** @param {Record<string, any>} msg */
async function handleCommand(msg) {
	if (!page) return;
	const mods = msg.modifiers ?? 0;
	switch (msg.type) {
		case "goto":
			await page.goto(normalizeUrl(msg.url), { waitUntil: "domcontentloaded" }).catch(() => {});
			break;
		case "back":
			await page.goBack().catch(() => {});
			break;
		case "forward":
			await page.goForward().catch(() => {});
			break;
		case "reload":
			await page.reload().catch(() => {});
			break;
		case "mouse":
			await cdp
				?.send("Input.dispatchMouseEvent", {
					type: msg.kind,
					x: msg.x,
					y: msg.y,
					button: msg.button ?? "none",
					buttons: msg.buttons ?? 0,
					clickCount: msg.clickCount ?? 0,
					deltaX: msg.deltaX ?? 0,
					deltaY: msg.deltaY ?? 0,
					modifiers: mods,
				})
				.catch(() => {});
			break;
		case "key": {
			const base = { key: msg.key, code: msg.code, modifiers: mods };
			if (typeof msg.text === "string" && msg.text.length === 1) {
				await cdp?.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, text: msg.text }).catch(() => {});
				await cdp?.send("Input.dispatchKeyEvent", { type: "keyUp", ...base }).catch(() => {});
			} else {
				const vkey = msg.vkey ?? 0;
				await cdp?.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base, windowsVirtualKeyCode: vkey }).catch(() => {});
				await cdp?.send("Input.dispatchKeyEvent", { type: "keyUp", ...base, windowsVirtualKeyCode: vkey }).catch(() => {});
			}
			break;
		}
		case "insertText":
			await cdp?.send("Input.insertText", { text: String(msg.text) }).catch(() => {});
			break;
	}
}

export function browserStream() {
	const wss = new WebSocketServer({ noServer: true });
	return {
		name: "kitchen-browser-stream",
		/** @param {import("vite").ViteDevServer} server */
		configureServer(server) {
			server.httpServer?.on("upgrade", (req, socket, head) => {
				if (!req.url?.startsWith(WS_PATH)) return; // leave HMR and friends to Vite
				wss.handleUpgrade(req, socket, head, async (/** @type {import("ws").WebSocket} */ ws) => {
					clients.add(ws);
					try {
						await ensureBrowser();
						await startCast();
						ws.send(JSON.stringify(await meta()));
					} catch (e) {
						ws.send(JSON.stringify({ type: "error", message: `actor browser unreachable: ${e}` }));
					}
					ws.on("message", /** @param {import("ws").RawData} raw */ async (raw) => {
						try {
							await handleCommand(JSON.parse(String(raw)));
						} catch {}
					});
					ws.on("close", async () => {
						clients.delete(ws);
						if (clients.size === 0) await stopCast();
					});
				});
			});
		},
	};
}
