import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ContactDataCryptoError,
  contactSuppressionFingerprint,
  createContactDataKeyMaterial,
  decryptContactJson,
  encryptContactJson,
} from "./contact-data-crypto";

const keys = createContactDataKeyMaterial({
  keyId: "synthetic-key-v1",
  encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64"),
  suppressionKey: "synthetic-suppression-secret-value-0001",
});

describe("contact data cryptography", () => {
  it("round-trips normalized JSON only with matching associated data", () => {
    const encrypted = encryptContactJson(
      { fullName: "Pessoa Sintética", channels: ["work"] },
      "candidate-profile:org:req:contact",
      keys,
    );

    expect(encrypted.ciphertext.toString("utf8")).not.toContain(
      "Pessoa Sintética",
    );
    expect(
      decryptContactJson(
        encrypted,
        "candidate-profile:org:req:contact",
        keys,
      ),
    ).toEqual({ fullName: "Pessoa Sintética", channels: ["work"] });
    expect(() =>
      decryptContactJson(encrypted, "candidate-profile:other", keys),
    ).toThrow(ContactDataCryptoError);
  });

  it("uses a distinct keyed fingerprint and normalizes email case", () => {
    const first = contactSuppressionFingerprint(
      "email",
      "PERSON@EXAMPLE.TEST",
      keys,
    );
    const second = contactSuppressionFingerprint(
      "email",
      "person@example.test",
      keys,
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(
      "person@example.test",
    );
  });
});

