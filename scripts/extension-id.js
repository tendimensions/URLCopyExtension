import { createPublicKey, createHash } from "node:crypto";

/**
 * Given an RSA private key in PEM form, return the values Chromium derives from
 * it: the base64 SPKI public key for manifest.json "key", and the 32-char
 * extension ID (first 128 bits of SHA-256 over the DER public key, hex digits
 * mapped 0-f -> a-p). The ID is identical whether the extension is loaded
 * unpacked (with the "key" field) or installed from a CRX signed with this key.
 */
export function deriveKeyAndId(privatePem) {
  const der = createPublicKey(privatePem).export({ type: "spki", format: "der" });
  const key = der.toString("base64");
  const id = [...createHash("sha256").update(der).digest().subarray(0, 16)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .split("")
    .map(c => "abcdefghijklmnop"[parseInt(c, 16)])
    .join("");
  return { key, id };
}
