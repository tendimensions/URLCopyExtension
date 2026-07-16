# Plan: force-install this extension without developer mode

## Why

Right now this extension is loaded via **Load unpacked**, which requires Edge's
developer mode to stay on. Turning developer mode off disables all unpacked
extensions (they aren't deleted, they just stop running).

`CustomAddBookmark` (sibling repo) solved this already: it's packed into a
signed `.crx`, hosted on the Linode, and installed on Edge via Windows'
`ExtensionInstallForcelist` policy pointing at an update manifest. Policy-
installed extensions don't need developer mode, don't nag, and can't be
casually disabled.

The hosting infrastructure from that project is already live and generic, so
this extension reuses it as-is:

- nginx on the Linode serves `https://mcp.tendimensions.com/extensions/`
  (recursively) from `/var/www/extensions/` — a new extension just needs its
  own subfolder, no nginx/vhost change.
- The signing pattern (RSA key → manifest `key` field → stable extension ID →
  `crx3`-packed CRX → Omaha `update.xml`) is copy-paste identical.

This extension is actually a simpler case than CustomAddBookmark: no
`host_permissions`, no options page, no `chrome.storage.local` settings to
lose, no server calls at all — it's pure `activeTab` + `clipboardWrite`
running entirely client-side. So there's no "settings reset once" caveat and
nothing to re-enter after install.

## Avoiding the "stuck extension" problem from CustomAddBookmark

CustomAddBookmark hit a multi-hour bug (see its `AUTOUPDATE-TROUBLESHOOTING.md`):
its first deployed build didn't have `update_url` in `manifest.json`. The
force-install *policy* string only supplies the update URL for the **initial**
install — every check after that uses `update_url` inside the **installed**
manifest. With that field missing, the installed copy locked onto checking the
web store (which doesn't have an off-store extension) and silently never
updated again, no matter how many correct builds were deployed afterward. The
only recovery was to fully remove the extension and let it reinstall clean
from the policy URL.

Because this extension hasn't been force-installed yet, we're not fixing a
stuck install — we're making sure it's never possible to create one:

- `manifest.json` gets `update_url` in step 3, **before** the first build in
  step 5. There is never a version of this extension in the wild that lacks
  it.
- `scripts/build.js` will **refuse to pack the CRX** if `manifest.json` is
  missing `update_url`, or if it doesn't match `UPDATE_BASE` (typos in the URL
  are the same failure mode as omitting it entirely — a silently-wrong value
  is just as bad as a missing one). This turns the CustomAddBookmark postmortem
  into a build-time error instead of relying on remembering to do it right.
- If you ever do hit a stuck install anyway (e.g. from deploying an older CRX
  by mistake), the recovery steps are already documented in
  `CustomAddBookmark/AUTOUPDATE-TROUBLESHOOTING.md` and apply unchanged — no
  need to duplicate them here.

## Identity for this extension

- **Slug:** `clean-url-copy` (matches the manifest `name`, "Clean URL Copy")
- **Update base:** `https://mcp.tendimensions.com/extensions/clean-url-copy`
- **Extension ID:** generated fresh in step 1 below (from a new `key.pem` —
  this repo has no existing signing key)

## Steps

1. **Add a stable signing key + ID**
   - Copy `scripts/extension-id.js` and `scripts/keygen.js` from
     `CustomAddBookmark` (unchanged — they're generic).
   - Run `npm run keygen` → generates `key.pem` (RSA 2048, gitignored) and
     prints the manifest `key` value and the derived extension ID.
   - Add the printed `key` to `manifest.json`.

2. **Add a build script** (`scripts/build.js`, adapted from
   CustomAddBookmark's):
   - Stage only runtime files into `dist/unpacked/`: `manifest.json`,
     `popup.html`, `popup.css`, `popup.js`, `icons/`. (Never `generate-icons.js`,
     `resize-icons.js`, `scripts/`, `key.pem`, `node_modules/`, `.git/`.)
   - Write `dist/update.xml` (Omaha `gupdate` format) with the extension ID,
     current `manifest.json` version, and
     `codebase = https://mcp.tendimensions.com/extensions/clean-url-copy/clean-url-copy.crx`.
   - Pack `dist/clean-url-copy.crx` signed with `key.pem` via the optional
     `crx3` package (added to `devDependencies`); if `crx3` isn't installed,
     print the manual `edge://extensions` → Pack extension fallback.
   - `UPDATE_BASE` overridable via env var, same as CustomAddBookmark.
   - **New guard (not in CustomAddBookmark's script):** before staging, assert
     `manifest.json` has `update_url` and that it equals
     `${UPDATE_BASE}/update.xml`; exit with an error otherwise. See rationale
     below.

3. **Update `manifest.json`**
   - Add `"key"` (from step 1).
   - Add `"update_url": "https://mcp.tendimensions.com/extensions/clean-url-copy/update.xml"`
     — this is the field that matters for *ongoing* auto-updates (the registry
     policy string only covers the initial install; see
     `CustomAddBookmark/AUTOUPDATE-TROUBLESHOOTING.md` for the postmortem on
     what happens if this is skipped).
   - Bump `"version"` if needed to trigger a first real build.

4. **`package.json` + `.gitignore`**
   - Add a minimal `package.json` (`name`, `version` mirroring the manifest,
     `scripts.keygen`, `scripts.build`, `crx3` devDependency) — this repo
     currently has none.
   - Ensure `.gitignore` covers `key.pem`, `*.pem`, `*.crx`, `dist/`,
     `node_modules/`. `key.pem` must never be committed.

5. **Build**
   ```powershell
   npm install
   npm run build
   ```
   Produces `dist/clean-url-copy.crx` and `dist/update.xml`.

6. **Deploy** (same two-step scp-then-sudo dance as CustomAddBookmark, since
   `/var/www` is root-owned and there's no passwordless sudo):
   ```powershell
   scp dist/clean-url-copy.crx dist/update.xml jason@ssh.tendimensions.com:/tmp/
   ```
   Then on the Linode:
   ```bash
   sudo install -d -m 755 /var/www/extensions/clean-url-copy
   sudo install -m 644 /tmp/clean-url-copy.crx /tmp/update.xml /var/www/extensions/clean-url-copy/
   ```
   Verify:
   ```bash
   curl -fsSI https://mcp.tendimensions.com/extensions/clean-url-copy/clean-url-copy.crx   # 200
   curl -fsS  https://mcp.tendimensions.com/extensions/clean-url-copy/update.xml            # right id/version
   ```

7. **Force-install via Windows registry** — all force-installed extensions
   share one registry key, each on its own numbered value. Use the next free
   number after whatever CustomAddBookmark already occupies (check
   `HKLM\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist` first).
   ```powershell
   $key = "HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist"
   New-Item -Path $key -Force | Out-Null
   New-ItemProperty -Path $key -Name "<next-free-number>" `
     -Value "<EXTENSION_ID>;https://mcp.tendimensions.com/extensions/clean-url-copy/update.xml" `
     -PropertyType String -Force | Out-Null
   ```
   Then:
   - Fully restart Edge (kill all `msedge.exe` processes, not just close windows).
   - Check `edge://policy` shows the updated forcelist.
   - Check `edge://extensions` shows it as "Installed by your organization."
   - Remove the old unpacked copy of this extension to avoid a duplicate.
   - Turn developer mode off.

8. **Write `PACKAGING.md`** in this repo documenting the extension's own ID,
   build/deploy commands, and update flow (bump version → rebuild → redeploy
   both files) — mirroring `CustomAddBookmark/PACKAGING.md` but trimmed since
   there's no settings-reset caveat here.

9. **Verify and commit**
   - `manifest.json` is valid JSON.
   - `npm run build` produces `dist/update.xml` with the right id/version.
   - `key.pem` and `dist/` are gitignored, not committed.
   - Commit the new scripts, manifest changes, `package.json`, `.gitignore`
     updates, and `PACKAGING.md`.

## What I need from you before I execute

- Confirmation to proceed with the plan above (this doc only lays it out —
  nothing has been built, signed, or deployed yet).
- The next free number in the `ExtensionInstallForcelist` registry key, or
  permission to check it live during step 7.
- You'll need to run the `scp`/`sudo` deploy commands yourself (or approve me
  running them), same division of labor as CustomAddBookmark: I stage the
  build, you own the SSH/sudo step onto the Linode.
