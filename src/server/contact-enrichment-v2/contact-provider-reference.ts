import "server-only";

import { z } from "zod";

export const contactProviderSourceSchema = z.enum(["LUSHA", "APOLLO"]);
export type ContactProviderSource = z.infer<typeof contactProviderSourceSchema>;

const providerContactIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value)
  .refine((value) => !/[\u0000-\u001f\u007f<>]/.test(value));

const storedProviderReferenceSchema = z.strictObject({
  source: contactProviderSourceSchema,
  providerContactId: providerContactIdSchema,
});

export type ContactProviderReference = z.infer<
  typeof storedProviderReferenceSchema
>;

export function createProviderReference(
  source: ContactProviderSource,
  providerContactId: string,
): ContactProviderReference {
  return storedProviderReferenceSchema.parse({ source, providerContactId });
}

export function parseProviderReference(value: unknown): ContactProviderReference {
  if (typeof value === "string") {
    return createProviderReference("LUSHA", providerContactIdSchema.parse(value));
  }

  return storedProviderReferenceSchema.parse(value);
}

export function providerIdentityValue(
  reference: ContactProviderReference,
): string {
  return reference.source === "LUSHA"
    ? reference.providerContactId
    : `${reference.source}:${reference.providerContactId}`;
}
