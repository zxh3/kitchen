// Injected into ttyd's page (via --index, see bootScript). Turns image
// pastes and file drops in any terminal pane into files in the sandbox:
// the upload daemon saves them and types the path into the herdr pane.
// Text pastes are untouched - they belong to xterm.
//
// Listeners MUST use the capture phase (the true argument): xterm's own
// paste handler (xterm.js Clipboard.ts, handlePasteEvent) runs on its
// hidden textarea and calls stopPropagation(), so bubble-phase listeners
// up here never see a paste at all. Capture runs top-down, before that.
(function () {
  "use strict";
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
