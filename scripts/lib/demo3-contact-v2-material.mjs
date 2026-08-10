import { createHmac } from "node:crypto";

export const demo3ContactV2BaseUrl = "https://192.168.0.20:30443";
export const demo3ContactV2IngressUrl =
  `${demo3ContactV2BaseUrl}/webhook/prospecta/lusha/contact-enrichment-v2`;
export const demo3ContactV2Actor = "demo3-preproduction-user";

export function deriveDemo3ContactV2Material(authSecret) {
  const derive = (purpose, encoding = "base64url") =>
    createHmac("sha256", authSecret)
      .update(`prospecta-demo3-contact-v2:${purpose}`)
      .digest(encoding);

  return {
    contactV2Url: demo3ContactV2IngressUrl,
    contactV2IngressSecret: derive("ingress"),
    contactV2CallbackSecret: derive("callback"),
    contactDataEncryptionKey: derive("encryption", "base64"),
    contactDataEncryptionKeyId: "demo3-contact-v2-derived-v1",
    contactSuppressionHmacKey: derive("suppression"),
    contactDataReadSubjects: demo3ContactV2Actor,
    contactDataGovernSubjects: demo3ContactV2Actor,
  };
}
