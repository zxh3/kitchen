
set -u
[ -n "$KITCHEN_SECRET" ] || { echo "KITCHEN_SECRET not set" >&2; exit 1; }
[ -n "$KITCHEN_SANDBOX_NAME" ] || KITCHEN_SANDBOX_NAME=sandbox
# Where installers put things, named on PATH BEFORE they exist.
#
# PATH is frozen per process at exec time: a service started at boot can never
# learn about a directory that appeared an hour later, and no amount of
# sourcing .zshrc in your shell changes the environment of a daemon. Listing
# the directories up front is the only fix that works without a restart — a
# missing entry is skipped, and starts resolving the moment it exists. So
# rustup-installed cargo is found by the herdr server that spawns the build,
# even though rustup ran long after boot.
#
# For anything that lands somewhere else: symlink it into /usr/local/bin,
# which is on every PATH here. Do not kill a service to give it a new
# environment — herdr's daemon inherits from the ttyd that spawns it (so it
# comes back with the same PATH), and the four supervised services fail the
# whole sandbox when they exit.
KITCHEN_TOOL_PATH=/root/.cargo/bin:/root/.local/bin:/root/.bun/bin:/root/.deno/bin:/root/go/bin:/usr/local/go/bin
export PATH="$KITCHEN_TOOL_PATH:$PATH"
export SHELL=/usr/bin/zsh
# Unix sockets are fine on the sandbox's own filesystem now, but /tmp keeps
# the socket out of snapshots, where a stale socket file is meaningless.
export HERDR_SOCKET_PATH=/tmp/herdr.sock
# Modal's runtime (gVisor) hides a pty's foreground process group from
# /proc (tty_nr/tpgid read 0 even for a TUI agent on a real pty), so
# herdr's native foreground-process detection can never identify a pane's
# agent. Hook reports from herdr's own integrations don't rescue it — they
# are suppressed as stale unless the agent process was identified first.
# child-groups makes the herdr server infer each pane's foreground job from
# its shell's child process groups instead; the image pins a herdr build
# that implements it. Only the server reads it, so export it everywhere the
# boot env is seeded (profile.d and zshenv below), like HERDR_SOCKET_PATH.
export HERDR_PROCESS_DETECTION=child-groups

mkdir -p /workspace
# name marker for the in-sandbox kitchen command
printf '%s' "$KITCHEN_SANDBOX_NAME" > /etc/kitchen-name

# herdr installs its agent integrations into each agent's OWN config directory,
# and each agent only creates that directory the first time it runs. On a fresh
# machine the binaries are all present but the directories are not, so herdr
# reports "install claude code first" about an agent that is already installed.
# Creating them is enough for its installer to proceed. In the boot script
# rather than the image so machines restored from older snapshots get it too.
mkdir -p /root/.claude /root/.codex /root/.pi/agent/extensions
# ...then actually install them. The mkdir only unblocks the installer — a
# fresh machine otherwise ships with zero integrations (they are what gave
# one sandbox a working sidebar by hand and made the env var look
# sufficient). Bundled assets written to the config dirs, no server needed.
# pi's hooks own full lifecycle state once detection identifies the pane;
# claude/codex get native session identity for restore.
herdr integration install pi >/dev/null || true
herdr integration install claude >/dev/null || true
herdr integration install codex >/dev/null || true

# herdr: replay recent pane contents after restarts. Seeded once only — the
# config lives in the machine now, so user edits stick.
mkdir -p /root/.config/herdr
if [ ! -f /root/.config/herdr/config.toml ]; then
	# version_check = off: herdr's updater would "upgrade" the pinned preview
	# binary back to stable 0.8.2 (a preview install on the default stable
	# channel always counts as outdated), silently losing child-groups.
	printf '[terminal]\ndefault_shell = "zsh"\n\n[experimental]\npane_history = true\n\n[update]\nversion_check = false\n' > /root/.config/herdr/config.toml
fi

# --- prompt (root's .bashrc would otherwise override profile.d) ---
cat > /etc/profile.d/kitchen.sh <<PROFILE
export PS1='\[\e[38;5;191m\]kitchen@'$KITCHEN_SANDBOX_NAME'\[\e[0m\]:\[\e[38;5;110m\]\w\[\e[0m\]$ '
export PATH="$KITCHEN_TOOL_PATH:\$PATH"
export HERDR_SOCKET_PATH=/tmp/herdr.sock
export HERDR_PROCESS_DETECTION=child-groups # see boot script note
case \$- in *i*)
	if [ -z "\$KITCHEN_MOTD_SHOWN" ]; then
		export KITCHEN_MOTD_SHOWN=1
		printf '\e[90mthe whole machine is saved when you stop $KITCHEN_SANDBOX_NAME - packages, config, /workspace, all of it.\ntype \e[0mkitchen\e[90m for details.\e[0m\n'
	fi
;; esac
PROFILE
echo '[ -f /etc/profile.d/kitchen.sh ] && . /etc/profile.d/kitchen.sh' >> /root/.bashrc

# --- the in-sandbox reference: how persistence actually works here ---
cat > /usr/local/bin/kitchen <<'KITCHENCMD'
#!/bin/sh
NAME=$(cat /etc/kitchen-name 2>/dev/null || echo sandbox)
printf '\033[1mkitchen\033[0m - sandbox \033[1m%s\033[0m\n\n' "$NAME"
printf 'this sandbox IS its filesystem. stopping it saves a snapshot of the whole\n'
printf 'machine; starting %s again restores it:\n\n' "$NAME"
printf '  /workspace                      your files\n'
printf '  apt / pip / npm -g installs     wherever they normally land\n'
printf '  uv / rustup / nvm, any toolchain no special setup needed\n'
printf '  agent + gh logins, herdr        claude / codex / pi / gh, ~/.config\n'
printf '  vscode settings + extensions    dotfiles, /etc, shell history\n\n'
printf 'so install things normally - nothing needs to live in a special path.\n\n'
if [ -n "$KITCHEN_VOLUMES" ]; then
	printf 'mounted volumes (saved continuously, NOT part of snapshots):\n'
	printf '  %s\n\n' "$KITCHEN_VOLUMES"
fi
printf 'what is not saved:\n'
printf '  running processes - a restored sandbox boots its services fresh\n'
printf '  /etc/hosts, /etc/resolv.conf - the container rewrites these at boot\n'
printf '  work done after the last snapshot, if this sandbox is killed\n'
printf '  without being stopped (it has a 24h lifetime). stop it when you are\n'
printf '  done, or mount a volume for anything you cannot lose.\n\n'
printf 'browser tab:\n'
printf '  proxies to port 3000 in this sandbox - start any dev server there\n\n'
printf 'tools you install later:\n'
printf '  herdr and vscode keep the PATH they booted with, so a tool installed\n'
printf '  after boot has to land somewhere already on it. these are:\n'
printf '    ~/.cargo/bin  ~/.local/bin  ~/go/bin  ~/.bun/bin  ~/.deno/bin\n'
printf '    /usr/local/go/bin  /usr/local/bin  (rustup, uv, go, bun, deno)\n'
printf '  anything elsewhere: ln -s <dir>/<tool> /usr/local/bin/ - takes\n'
printf '  effect immediately, no restart. restarting a service does NOT pick\n'
printf '  up a new PATH, and stopping one fails the sandbox.\n'
KITCHENCMD
chmod +x /usr/local/bin/kitchen

# --- zsh: env for every invocation, plus the kitchen prompt + MOTD ---
cat > /etc/zsh/zshenv <<ZSHENV
typeset -U path PATH
export PATH="$KITCHEN_TOOL_PATH:\$PATH"
export HERDR_SOCKET_PATH=/tmp/herdr.sock
export HERDR_PROCESS_DETECTION=child-groups # see boot script note
export SHELL=/usr/bin/zsh
ZSHENV

cat > /etc/kitchen-zshrc <<KITCHENZSH
export HISTFILE=/root/.zsh_history
export HISTSIZE=10000
export SAVEHIST=10000
setopt share_history
if [ -z "\$KITCHEN_MOTD_SHOWN" ]; then
	export KITCHEN_MOTD_SHOWN=1
	printf '\e[90mthe whole machine is saved when you stop $KITCHEN_SANDBOX_NAME - packages, config, /workspace, all of it.\ntype \e[0mkitchen\e[90m for details.\e[0m\n'
fi
KITCHENZSH

# --- auth proxy: cookie exchange in front of every service ---
cat > /tmp/Caddyfile <<CADDYEOF
{
	admin off
	auto_https off
}
(kitchenauth) {
	@login {
		path /kitchen-auth
		query token=$KITCHEN_SECRET
	}
	handle @login {
		header Set-Cookie "kitchen=$KITCHEN_SECRET; Path=/; Secure; HttpOnly; SameSite=None"
		redir * / 302
	}
	@authed {
		header Cookie *kitchen=$KITCHEN_SECRET*
	}
	handle @authed {
		reverse_proxy 127.0.0.1:{args[0]}
	}
	handle {
		respond "kitchen: authentication required" 403
	}
}
:7681 {
	import kitchenauth 17681
}
:7683 {
	import kitchenauth 17683
}
:8443 {
	import kitchenauth 18443
}
:8080 {
	@login {
		path /kitchen-auth
		query token=$KITCHEN_SECRET
	}
	handle @login {
		header Set-Cookie "kitchen=$KITCHEN_SECRET; Path=/; Secure; HttpOnly; SameSite=None"
		redir * / 302
	}
	@authed {
		header Cookie *kitchen=$KITCHEN_SECRET*
	}
	handle @authed {
		reverse_proxy 127.0.0.1:3000 {
			header_up Host {upstream_hostport}
			header_down -X-Frame-Options
			header_down -Content-Security-Policy
		}
	}
	handle {
		respond "kitchen: authentication required" 403
	}
	handle_errors {
		respond "kitchen: nothing is listening on port 3000 in this sandbox yet. start your app on port 3000 and reload this tab." 502
	}
}
CADDYEOF

cd /workspace
TTYD_THEME='{"background":"#0a0a0b","foreground":"#c9c9cf","cursor":"#c6f24e","selectionBackground":"#3a3a2e"}'
ttyd -p 17681 -i 127.0.0.1 -W -t "theme=$TTYD_THEME" -t fontSize=13 zsh &
ttyd -p 17683 -i 127.0.0.1 -W -t "theme=$TTYD_THEME" -t fontSize=13 herdr &
code-server --bind-addr 127.0.0.1:18443 --auth none --disable-telemetry /workspace &
caddy run --config /tmp/Caddyfile --adapter caddyfile &

# fail the sandbox loudly if any service dies
wait -n
echo "kitchen boot: a service exited" >&2
exit 1
