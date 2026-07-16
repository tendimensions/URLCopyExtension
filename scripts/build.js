import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveKeyAndId } from "./extension-id.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const staged = join(dist, "unpacked");
const keyPath = join(root, "key.pem");
const crxPath = join(dist, "clean-url-copy.crx");

// Where the CRX + update.xml will be hosted. Override with UPDATE_BASE.
const UPDATE_BASE = process.env.UPDATE_BASE || "https://mcp.tendimensions.com/extensions/clean-url-copy";

// Only these are shipped in the CRX - no scripts, key, git, node_modules.
const RUNTIME = ["manifest.json", "popup.html", "popup.css", "popup.js", "icons"];

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const { version, update_url } = manifest;

// Guard: never pack a build that would silently break auto-update once
// installed. A missing or mismatched update_url is exactly what caused the
// CustomAddBookmark extension to get stuck on an old version.
const expectedUpdateUrl = `${UPDATE_BASE}/update.xml`;
if (update_url !== expectedUpdateUrl) {
  console.error(
    `manifest.json "update_url" is ${update_url ? `"${update_url}"` : "missing"}, ` +
    `expected "${expectedUpdateUrl}".\n` +
    `Fix manifest.json before building - an off-store extension without the ` +
    `correct update_url can never auto-update again once installed.`
  );
  process.exit(1);
}

if (!existsSync(keyPath)) {
  console.error("Missing key.pem - run `npm run keygen` first.");
  process.exit(1);
}
const { id } = deriveKeyAndId(readFileSync(keyPath, "utf8"));

// 1. Stage a clean copy of the runtime files.
rmSync(staged, { recursive: true, force: true });
mkdirSync(staged, { recursive: true });
for (const item of RUNTIME) {
  cpSync(join(root, item), join(staged, item), { recursive: true });
}
console.log(`Staged runtime files -> ${staged}`);

// 2. Write the Omaha update manifest used by the force-install policy.
const updateXml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${id}'>
    <updatecheck codebase='${UPDATE_BASE}/clean-url-copy.crx' version='${version}' />
  </app>
</gupdate>
`;
writeFileSync(join(dist, "update.xml"), updateXml);
console.log(`Wrote update.xml (id=${id}, version=${version})`);

// 3. Pack the CRX if the optional `crx3` package is installed; otherwise tell
//    the user how to pack with Edge's built-in packer.
let crx3;
try {
  crx3 = (await import("crx3")).default;
} catch {
  console.log("\ncrx3 not installed - skipping CRX packing.");
  console.log("Either run `npm install` (adds crx3) and re-run `npm run build`,");
  console.log("or pack manually: edge://extensions -> Pack extension ->");
  console.log(`  Extension root: ${staged}`);
  console.log(`  Private key:    ${keyPath}`);
  process.exit(0);
}

await crx3([join(staged, "manifest.json")], {
  keyPath,
  crxPath,
  zipPath: join(dist, "clean-url-copy.zip"),
});
console.log(`Packed CRX -> ${crxPath}`);
