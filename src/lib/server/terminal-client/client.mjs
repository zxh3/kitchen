// Injected into ttyd's page (via --index, see bootScript). Adds the small
// pieces of browser-terminal behavior that ttyd's bundled xterm.js lacks:
// modified Enter reporting, plus image paste/drop support.
//
// Listeners MUST use the capture phase (the true argument): xterm's own
// paste handler (xterm.js Clipboard.ts, handlePasteEvent) runs on its
// hidden textarea and calls stopPropagation(), so bubble-phase listeners
// up here never see a paste at all. Capture runs top-down, before that.
(function () {
  "use strict";

  // xterm.js 5.5 collapses Enter and Shift+Enter to the same CR byte. Agent
  // TUIs therefore see both as submit. Forward the standard CSI-u sequence
  // ourselves so Codex, pi, and any other compatible TUI can distinguish it.
  // ttyd publishes its Terminal as window.term, but this script can execute
  // before the React terminal component mounts, hence the short-lived poll.
  function installShiftEnter() {
    var term = window.term;
    if (!term || typeof term.attachCustomKeyEventHandler !== "function") {
      return false;
    }
    term.attachCustomKeyEventHandler(function (event) {
      if (
        event.type === "keydown" &&
        event.key === "Enter" &&
        event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        // Returning false stops xterm's keydown handler, but xterm returns
        // before cancelling the DOM event. Without this, the browser can emit
        // a follow-up keypress that xterm sends as a plain Enter, immediately
        // submitting the prompt after the newline was inserted.
        event.preventDefault();
        term.input("\x1b[13;2u", false);
        return false;
      }
      return true;
    });
    return true;
  }

  if (!installShiftEnter()) {
    var shiftEnterTimer = setInterval(function () {
      if (installShiftEnter()) clearInterval(shiftEnterTimer);
    }, 50);
  }

  function toast(msg) {
    var d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:99999;background:#1c1c1e;color:#c6f24e;border:1px solid #3a3a2e;padding:8px 12px;border-radius:6px;font:13px monospace;opacity:.95";
    document.body.appendChild(d);
    setTimeout(function () {
      d.remove();
    }, 4000);
  }
  function upload(file) {
    var headers = {};
    if (file.type) headers["x-shot-type"] = file.type;
    fetch("/kitchen-upload", { method: "POST", headers: headers, body: file })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res.path) {
          toast("upload failed: " + (res.error || "unknown"));
          return;
        }
        if (res.typed) {
          toast("> " + res.path);
          return;
        }
        // Non-herdr panes (plain zsh ttyd): no send-text exists there, so
        // put the path on the clipboard instead.
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(res.path).then(
            function () {
              toast("copied " + res.path);
            },
            function () {
              toast(res.path);
            },
          );
        } else {
          toast(res.path);
        }
      })
      .catch(function (e) {
        toast("upload failed: " + e);
      });
  }
  // capture=true: xterm stopPropagation()s paste at its textarea; without
  // capture we never run at all (this file's whole reason to exist).
  window.addEventListener(
    "paste",
    function (e) {
      var files = e.clipboardData && e.clipboardData.files;
      if (!files || !files.length) return; // text paste: xterm's business
      e.preventDefault();
      e.stopImmediatePropagation();
      upload(files[0]);
    },
    true,
  );
  window.addEventListener(
    "dragover",
    function (e) {
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      if (e.dataTransfer.types.indexOf("Files") >= 0) e.preventDefault();
    },
    true,
  );
  window.addEventListener(
    "drop",
    function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      upload(files[0]);
    },
    true,
  );
})();
