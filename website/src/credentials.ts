// Wire-compatible with ProviderCredentialCrypto.android.kt. Keep credentials in
// memory, never analytics, URLs, console logs or plaintext exports.
async function credentialKey(userId: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId + "anivio_provider_credential_v1"),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptCredential(plain: string, userId: string) {
  if (!plain.trim()) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await credentialKey(userId),
      new TextEncoder().encode(plain),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...encrypted))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export async function decryptCredential(value: string, userId: string) {
  if (!value) return "";
  try {
    const bytes = Uint8Array.from(
      atob(value.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(0, 12) },
        await credentialKey(userId),
        bytes.slice(12),
      ),
    );
  } catch {
    return value;
  } // Legacy plaintext values match the app's fallback.
}
