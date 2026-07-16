import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveKeyAndId } from "./extension-id.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keyPath = join(root, "key.pem");

if (existsSync(keyPath)) {
  console.log("key.pem already exists - reusing it.");
} else {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  console.log("Generated key.pem - keep this private and back it up.");
}

const { key, id } = deriveKeyAndId(readFileSync(keyPath, "utf8"));
console.log('\nmanifest.json "key":\n' + key);
console.log("\nExtension ID:\n" + id);
