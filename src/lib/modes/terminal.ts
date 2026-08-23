/**
 * Shared by the two terminal panes (zsh, herdr): both are a ttyd process
 * serving an xterm.js frontend, so both need the ttyd image layer and the
 * xterm theme. The registry dedupes these exact strings, so each pane
 * declares them and the sandbox image pays once.
 */

// ttyd's last release (1.7.7, 2024) predates xterm.js's clipboard addon, so
// OSC 52 copies — how herdr's copy-on-select reaches the browser clipboard —
// were silently dropped. Master bundles the addon and commits a prebuilt web
// UI (src/html.h), so it builds from source with cmake alone. Pinned commit.
const TTYD_COMMIT = "2922cb89f518bae4d0fcf4d757a7419638fc71fc";

export const ttydImageLayer = `RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends build-essential cmake libjson-c-dev libwebsockets-dev && curl -fsSL https://github.com/tsl0922/ttyd/archive/${TTYD_COMMIT}.tar.gz | tar -xz -C /tmp && cmake -S /tmp/ttyd-${TTYD_COMMIT} -B /tmp/ttyd-build && make -C /tmp/ttyd-build -j"$(nproc)" install && rm -rf /tmp/ttyd-${TTYD_COMMIT} /tmp/ttyd-build /var/lib/apt/lists/*`;

export const ttydThemePrelude =
  String.raw`TTYD_THEME='{"background":"#0a0a0b","foreground":"#c9c9cf","cursor":"#c6f24e","selectionBackground":"#3a3a2e"}'`;
