import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const algorithm = "aes-256-gcm";

export interface ContactDataKeyMaterial {
  readonly keyId: string;
  readonly encryptionKey: Buffer;
  readonly suppressionKey: Buffer;
}

export interface EncryptedContactData {
  readonly keyId: string;
  readonly nonce: Buffer;
  readonly ciphertext: Buffer;
  readonly authenticationTag: Buffer;
}

export class ContactDataCryptoError extends Error {
  readonly code = "CONTACT_DATA_CRYPTO_ERROR";

  constructor() {
    super("Contact data cryptographic operation failed.");
    this.name = "ContactDataCryptoError";
  }
}

export function createContactDataKeyMaterial(input: {
  readonly keyId: string;
  readonly encryptionKeyBase64: string;
  readonly suppressionKey: string;
}): ContactDataKeyMaterial {
  const encryptionKey = Buffer.from(input.encryptionKeyBase64, "base64");
  const suppressionKey = Buffer.from(input.suppressionKey, "utf8");

  if (
    !/^[A-Za-z0-9._-]{1,64}$/.test(input.keyId) ||
    encryptionKey.byteLength !== 32 ||
    encryptionKey.toString("base64") !== input.encryptionKeyBase64 ||
    encryptionKey.equals(Buffer.alloc(32)) ||
    suppressionKey.byteLength < 32
  ) {
    throw new ContactDataCryptoError();
  }

  return { keyId: input.keyId, encryptionKey, suppressionKey };
}

export function encryptContactJson(
  value: unknown,
  associatedData: string,
  keys: ContactDataKeyMaterial,
): EncryptedContactData {
  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(algorithm, keys.encryptionKey, nonce);
    cipher.setAAD(Buffer.from(associatedData, "utf8"));
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
      keyId: keys.keyId,
      nonce,
      ciphertext,
      authenticationTag: cipher.getAuthTag(),
    };
  } catch {
    throw new ContactDataCryptoError();
  }
}

export function decryptContactJson(
  encrypted: EncryptedContactData,
  associatedData: string,
  keys: ContactDataKeyMaterial,
): unknown {
  if (encrypted.keyId !== keys.keyId) {
    throw new ContactDataCryptoError();
  }

  try {
    const decipher = createDecipheriv(
      algorithm,
      keys.encryptionKey,
      encrypted.nonce,
    );
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(encrypted.authenticationTag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(plaintext.toString("utf8")) as unknown;
  } catch {
    throw new ContactDataCryptoError();
  }
}

export function contactSuppressionFingerprint(
  kind: "provider" | "email" | "phone",
  value: string,
  keys: ContactDataKeyMaterial,
): string {
  const normalized = normalizeFingerprintValue(kind, value);

  return createHmac("sha256", keys.suppressionKey)
    .update(`prospecta-contact-v2\n${kind}\n${normalized}`, "utf8")
    .digest("hex");
}

export function safeSecretEqual(
  received: string | null,
  expected: string,
): boolean {
  if (received === null) return false;

  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function normalizeFingerprintValue(
  kind: "provider" | "email" | "phone",
  value: string,
): string {
  const normalized = kind === "email" ? value.toLowerCase() : value;

  if (
    normalized.length === 0 ||
    normalized.length > 320 ||
    normalized.trim() !== normalized ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new ContactDataCryptoError();
  }

  return normalized;
}
