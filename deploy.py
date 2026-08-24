# Deploys kitchen on Modal itself: the SvelteKit Node server runs as a Modal
# Server (@app.server), so the control plane lives next to the sandboxes it
# manages. The app stays stateless — browser sessions are encrypted into an
# HttpOnly cookie. Runtime keys, and optional MODAL_TOKEN_ID /
# MODAL_TOKEN_SECRET / MODAL_ENVIRONMENT values for single-tenant mode, come
# from a Modal Secret named "kitchen-deployment-credentials".
#
#   modal deploy apps/kitchen/deploy.py
#
# Custom domain (kitchen.dev): add it to this server in the Modal dashboard
# (Settings → Domains) and point DNS at Modal per the instructions there.

import os
import subprocess

import modal

PORT = 3000
SERVER_REGION = "us-west"
SERVER_CPU = 8.0
SERVER_MEMORY_MIB = 32768

app = modal.App("kitchen")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "ca-certificates")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y --no-install-recommends nodejs",
    )
    .add_local_dir(
        ".",
        "/srv/kitchen",
        copy=True,
        ignore=["node_modules", ".svelte-kit", "build", ".env", "deploy.py"],
    )
    .workdir("/srv/kitchen")
    .run_commands("npm install", "npm run build")
)


# min_containers=1 keeps one container warm, so the console answers immediately
# instead of paying a cold start (image pull + `node build`) on the first request
# after idling. It also means the deployment runs — and bills — continuously.
@app.server(
    image=image,
    port=PORT,
    unauthenticated=True,
    secrets=[modal.Secret.from_name("kitchen-deployment-credentials")],
    # Keep request routing and compute together for predictable west-coast
    # development latency. Explicit resources give the always-warm server
    # headroom for concurrent development traffic.
    routing_region=SERVER_REGION,
    compute_region=SERVER_REGION,
    cpu=SERVER_CPU,
    memory=SERVER_MEMORY_MIB,
    min_containers=1,
    scaledown_window=300,
    startup_timeout=30,
)
class KitchenServer:
    @modal.enter()
    def start(self) -> None:
        server_env = {
            **os.environ,
            "PORT": str(PORT),
            "HOST": "0.0.0.0",
            "PATH": "/usr/bin:/usr/local/bin:/bin",
        }
        # Modal's Python task runtime points MODAL_SERVER_URL at its private
        # Unix socket. The child Node process uses the JavaScript SDK, which
        # must connect to the public control-plane endpoint instead.
        server_env.pop("MODAL_SERVER_URL", None)
        self.process = subprocess.Popen(
            ["node", "build"],
            cwd="/srv/kitchen",
            env=server_env,
        )
