// kitchen screenshot upload daemon. The patched ttyd index POSTs
// clipboard/dropped images here from the browser; we save them and, for
// the herdr pane, type the path where it belongs.
//
// Auxiliary service: started under a restart loop, must never fail the
// sandbox, and anything it cannot do degrades to a plain file save.
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// /tmp stays out of kitchen snapshots on purpose: screenshots are
// transient handoffs to an agent, not machine state.
const DIR = "/tmp/kitchen-shots";
const PORT = 17009;
const MAX_BYTES = 25 * 1024 * 1024;
const EXTS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

fs.mkdirSync(DIR, { recursive: true });

// ctrl+v means "here": herdr's current pane is the one the user just
// pasted in. Deliberately not gated on a pi agent — a path typed at a
// shell prompt is just as useful. Race: if focus moved mid-upload, the
// text follows the new focus; it is only text, nothing is submitted.
function typeIntoPane(text) {
  const cur = JSON.parse(
    execFileSync("herdr", ["pane", "current"], { encoding: "utf8" }),
  );
  const pane = cur.result && cur.result.pane;
  if (!pane || !pane.pane_id) return false;
  execFileSync("herdr", ["pane", "send-text", pane.pane_id, text]);
  return true;
}

http
  .createServer((req, res) => {
    const end = (code, obj) => {
      if (!res.headersSent)
        res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const url = (req.url || "").split("?")[0];
    if (req.method !== "POST" || url !== "/kitchen-upload") {
      return end(404, { error: "POST /kitchen-upload only" });
    }
    // Defence in depth: Caddy only routes here inside @authed, but the
    // daemon answers on localhost for every process in the sandbox.
    const secret = process.env.KITCHEN_SECRET || "";
    const cookie = req.headers.cookie || "";
    if (!secret || !cookie.includes("kitchen=" + secret)) {
      return end(403, { error: "authentication required" });
    }
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        tooBig = true;
        end(413, { error: "file too large" });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("error", () => {});
    req.on("end", () => {
      if (tooBig) return;
      if (!chunks.length) return end(400, { error: "empty body" });
      const ext = EXTS[req.headers["x-shot-type"]] || ".png";
      const stamp = new Date()
        .toISOString()
        .replace(/[:T.-]/g, "")
        .slice(0, 14);
      const file = path.join(
        DIR,
        "shot-" + stamp + "-" + Math.random().toString(36).slice(2, 6) + ext,
      );
      fs.writeFileSync(file, Buffer.concat(chunks));
      // The magic words to an agent never change: "look at latest.png".
      const latest = path.join(DIR, "latest" + ext);
      try {
        fs.rmSync(latest, { force: true });
        fs.symlinkSync(file, latest);
      } catch {}
      let typed = false;
      if (req.headers["x-kitchen-pane"] === "herdr") {
        try {
          typed = typeIntoPane(file + " ");
        } catch {}
      }
      end(200, { path: file, typed });
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log("kitchen-upload listening on 127.0.0.1:" + PORT);
  });
