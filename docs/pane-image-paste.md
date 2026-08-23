# Pane Image Paste — Design Notes

Screenshots from the user's laptop into agents (pi / claude / codex) running
in terminal panes.

## Why the obvious thing can't work

- **Terminals are text.** ttyd's websocket carries keystrokes; there is no
  image *input* protocol (kitty/iTerm graphics are output-only). Even a
  native drag-into-terminal is path transport, not pixel transport.
- **The clipboard lives on the laptop.** Agents' native "paste image"
  features (pi `ctrl+v`, codex `clipboard_paste.rs`) read the clipboard of
  the machine they run on — the sandbox's, which is always empty.
- **The kitchen page can't see pane events.** Panes are cross-origin
  iframes; paste/drop inside them never reaches the parent document. Only
  ttyd's own page can capture them.

Conclusion: capture in ttyd's page, turn the event into an HTTP upload,
save a file, hand the agent its **path** — which is every agent CLI's most
general image flow anyway (read tool / `view_image` / `Read`).

## Architecture

```
laptop clipboard (⌘V in pane)
  → ttyd page (patched index, injected pane-paste/paste.js)
  → POST /kitchen-upload        (same origin, Caddy cookie auth)
  → /etc/kitchen/upload-server.js on 127.0.0.1:17009
      · saves /tmp/kitchen-shots/shot-<ts>-<rand>.png + latest.png symlink
      · herdr lane: `herdr pane current` → `pane send-text <id> <path> `
        → path appears at the focused pane's prompt
      · zsh lane: no send-text target → client copies path to clipboard
```

- **Patched index via `ttyd -I`**: ttyd's frontend is one self-contained
  html; at boot a throwaway instance serves the stock page, an awk splice
  inserts `<script src="/kitchen-paste.js">` before `</body>`, both ttyds
  start with `-I /etc/kitchen/ttyd-index.html`. Any failure removes the
  file, `INDEX_ARG` stays empty, and panes serve the stock page — the
  feature degrades silently, terminals never break. Serving paste.js as a
  separate file (vs inlining it into the html) is deliberate: hot-patching
  client code on a live sandbox is a file write + browser reload, no
  restart.
- **Caddy**: `/kitchen-upload` and `/kitchen-paste.js` routes live in the
  shared `kitchenauth` snippet; a second snippet arg tags the pane type
  (`zsh`/`herdr`/`code`) as `X-Kitchen-Pane` for the daemon.
- **Everything in the boot script**: no image rebuild, no RUNTIME_VERSION
  bump, restored snapshots get the feature on their next start.
- **`/tmp/kitchen-shots` on purpose**: /tmp stays out of snapshots;
  screenshots are transient handoffs, not machine state.

## Hard-won: xterm eats paste events

Symptom was "text paste works, image paste does nothing at all" — because
xterm.js registers `handlePasteEvent` on its hidden textarea AND container
element and calls `ev.stopPropagation()`. Bubble-phase `window` listeners
never run; xterm extracts only `text/plain`, so binary clipboards vanish
without a trace. Fix: the injected listeners use the **capture phase**
(`addEventListener(..., true)`), which runs top-down before the target
phase can stop anything. Guard on `clipboardData.files.length` so text
paste still belongs to xterm.

## Failure modes (all degrade, none fatal)

- index generation fails → stock ttyd page, no paste feature (rest is fine)
- daemon down/crashed → restart loop; upload 502s, paste.js toasts the error
- herdr unreachable / no current pane → `typed:false`, client falls back to
  clipboard copy
- focus moved mid-upload → path typed into the new current pane (harmless
  text, never submitted)

## Security

Uploads ride the same per-sandbox cookie as every pane; the daemon
re-checks it (defence in depth on localhost). 25MB cap. Filenames are
server-generated (no client input in paths).

## Future

- pi extension `/lastshot` attaching `latest.png` without typing the path
- origin-agnostic toast styling nits; per-pane targeting instead of
  "current pane" when herdr exposes it
