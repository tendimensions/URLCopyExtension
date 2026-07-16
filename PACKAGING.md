# Packaging & Force-Install (no developer mode)

By default this extension is loaded via **Load unpacked**, which requires Edge's
developer mode to stay on - and Edge nags you to turn it off. Turning developer
mode off **disables** all unpacked extensions (they aren't deleted, but they
stop running).

To run the extension permanently **without** developer mode, install it through
Windows policy (`ExtensionInstallForcelist`). Policy-installed extensions don't
need developer mode, don't show the nag, and can't be casually disabled. This
requires a **stable extension ID**, a **signed CRX**, and an **update manifest**
hosted somewhere over HTTPS.

This reuses the same hosting infrastructure and signing pattern as the
`CustomAddBookmark` extension - see that repo's `PACKAGING.md` and
`AUTOUPDATE-TROUBLESHOOTING.md` for the full background.

## This extension's identity

- **Extension ID:** `ihdekpgchlilbjboecfaemcllaadhaol`
- The ID is derived from `key.pem` (the signing key) and pinned in
  `manifest.json` via the `key` field, so the unpacked build and the CRX build
  share the same ID.

> `key.pem` is the private signing key. It is **gitignored** and must be kept
> secret and **backed up** (e.g. alongside the GitHub PAT in the vault's
> gitignored `claude-config/`). If you lose it you can't ship updates under the
> same ID. To recreate the values from an existing key, run `npm run keygen`.

This extension has no `host_permissions`, no options page, and no
`chrome.storage.local` settings - it's pure `activeTab` + `clipboardWrite`,
entirely client-side. There is nothing to re-enter after install (unlike
CustomAddBookmark's bearer token).

## One-time: build the CRX and update manifest

```powershell
npm install          # installs crx3 (the packer)
npm run build         # -> dist/clean-url-copy.crx and dist/update.xml
```

`npm run build` stages only the runtime files (manifest, popup files, icons),
writes `dist/update.xml`, and - if `crx3` is installed - packs
`dist/clean-url-copy.crx` signed with `key.pem`.

The build **refuses to run** if `manifest.json`'s `update_url` is missing or
doesn't match `UPDATE_BASE` - this is a deliberate guard against the exact bug
that got CustomAddBookmark's install stuck (see
[Auto-update requires `update_url`](#auto-update-requires-update_url-in-the-manifest)
below).

The hosting base URL defaults to `https://mcp.tendimensions.com/extensions/clean-url-copy`.
Override it if you host elsewhere:

```powershell
$env:UPDATE_BASE = "https://example.com/ext/clean-url-copy"; npm run build
```

### Manual packing (if you skip crx3)

`edge://extensions` -> **Pack extension**:
- **Extension root directory:** `dist/unpacked`
- **Private key file:** `key.pem`

This produces `dist/unpacked.crx`; rename it to `clean-url-copy.crx`.

## Host the files

nginx on the Linode serves `/extensions/` as static files from
`/var/www/extensions/` (shared with CustomAddBookmark). This extension gets
its own subfolder - no nginx config change needed:

```
https://mcp.tendimensions.com/extensions/clean-url-copy/clean-url-copy.crx
https://mcp.tendimensions.com/extensions/clean-url-copy/update.xml
```

### (Re)deploy

`/var/www` is root-owned and `jason` has no passwordless sudo, so upload to `/tmp`
then move into place with sudo. From a machine with the build output:

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

## Force-install on each machine (Windows registry)

You don't open or drag the `.crx` in - Edge blocks off-store CRX installs. Instead
the policy tells Edge to fetch and install it itself from the update URL. So
"installing" = applying the registry entry and restarting Edge.

Add the extension to Edge's force-install list. The value data is
`<extension-id>;<update-manifest-url>`. All force-installed extensions share
this one registry key, each on its own numbered value - check
`HKLM\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist` first for the
next free number (CustomAddBookmark already occupies one).

Via an elevated PowerShell:

```powershell
$key = "HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist"
New-Item -Path $key -Force | Out-Null
New-ItemProperty -Path $key -Name "<next-free-number>" `
  -Value "ihdekpgchlilbjboecfaemcllaadhaol;https://mcp.tendimensions.com/extensions/clean-url-copy/update.xml" `
  -PropertyType String -Force | Out-Null
```

Then:

1. Fully restart Edge (kill all `msedge.exe` processes, not just close windows).
2. Visit `edge://policy` and confirm `ExtensionInstallForcelist` is listed.
3. Visit `edge://extensions` - the extension appears as **Installed by your
   organization** and can't be toggled off. You can now turn developer mode off.
4. Remove the old unpacked copy if it's still loaded (to avoid a duplicate).

## Updating to a new version

1. Bump `version` in `manifest.json` (and `package.json`).
2. `npm run build`.
3. Re-deploy **both** files (see [(Re)deploy](#redeploy)) - `update.xml` must
   advertise the new version or Edge won't update.
4. Edge picks up the new version automatically (within a few hours, or
   immediately via `edge://extensions` -> **Update**).

## Auto-update requires `update_url` in the manifest

The force-install policy string (`<id>;<update-url>`) is only used for the
**initial** install. For ongoing update checks, Edge/Chrome use the `update_url`
field inside the installed extension's own `manifest.json`. If that field is
missing, the browser checks the **web stores** instead - which don't have this
off-store extension, so it silently never updates past the first install.

`manifest.json` therefore sets:

```json
"update_url": "https://mcp.tendimensions.com/extensions/clean-url-copy/update.xml"
```

This was baked in **before the very first build**, so there is no version of
this extension in the wild that lacks it - unlike CustomAddBookmark, which
shipped an early build without it and got stuck (see its
`AUTOUPDATE-TROUBLESHOOTING.md`). `scripts/build.js` also refuses to pack a CRX
if this field is missing or wrong, as a permanent guard against repeating that
mistake.

## Notes / gotchas

- The same ID is used for the unpacked dev build and the force-installed build,
  so you can develop unpacked and ship via policy without ID drift.
- Force-install via a self-hosted update URL is supported by Edge policy; it does
  not require the Edge Add-ons store.
- No settings to lose on reinstall: this extension has no `chrome.storage.local`
  usage, so a clean reinstall (if ever needed) requires no re-configuration.

## Reusing this for other custom extensions

See `CustomAddBookmark/PACKAGING-PROMPT.md` for the general reusable process -
this extension followed it exactly.
