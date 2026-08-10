import "server-only";

import {
  contactCompanySearchN8nResponseSchema,
  contactPreviewByCompanyIdN8nResponseSchema,
  contactPreviewN8nResponseSchema,
  contactRevealN8nResponseSchema,
  type contactCompanySearchN8nRequestSchema,
  type contactPreviewByCompanyIdN8nRequestSchema,
  type contactPreviewN8nRequestSchema,
  type contactRevealN8nRequestSchema,
} from "./contact-enrichment-v2-contract";
import type { z } from "zod";

export type ContactPreviewN8nRequest = z.infer<
  typeof contactPreviewN8nRequestSchema
>;
export type ContactPreviewByCompanyIdN8nRequest = z.infer<
  typeof contactPreviewByCompanyIdN8nRequestSchema
>;
export type ContactCompanySearchN8nRequest = z.infer<
  typeof contactCompanySearchN8nRequestSchema
>;
export type ContactRevealN8nRequest = z.infer<
  typeof contactRevealN8nRequestSchema
>;

export type ContactDispatchResult =
  | { readonly kind: "acknowledged" }
  | { readonly kind: "unknown" };

const ingressSecretHeader = "X-Prospecta-Contact-Enrichment-Secret";

export async function dispatchContactPreview(
  request: ContactPreviewN8nRequest,
  configuration: {
    readonly url: string;
    readonly secret: string;
    readonly timeoutMs: number;
  },
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<ContactDispatchResult> {
  return dispatch(
    request,
    configuration,
    contactPreviewN8nResponseSchema,
    fetchImplementation,
  );
}

export async function dispatchContactPreviewByCompanyId(
  request: ContactPreviewByCompanyIdN8nRequest,
  configuration: {
    readonly url: string;
    readonly secret: string;
    readonly timeoutMs: number;
  },
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<ContactDispatchResult> {
  return dispatch(
    request,
    configuration,
    contactPreviewByCompanyIdN8nResponseSchema,
    fetchImplementation,
  );
}

export async function dispatchContactCompanySearch(
  request: ContactCompanySearchN8nRequest,
  configuration: {
    readonly url: string;
    readonly secret: string;
    readonly timeoutMs: number;
  },
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<ContactDispatchResult> {
  return dispatch(
    request,
    configuration,
    contactCompanySearchN8nResponseSchema,
    fetchImplementation,
  );
}

export async function dispatchContactReveal(
  request: ContactRevealN8nRequest,
  configuration: {
    readonly url: string;
    readonly secret: string;
    readonly timeoutMs: number;
  },
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<ContactDispatchResult> {
  return dispatch(
    request,
    configuration,
    contactRevealN8nResponseSchema,
    fetchImplementation,
  );
}

async function dispatch(
  request:
    | ContactCompanySearchN8nRequest
    | ContactPreviewN8nRequest
    | ContactPreviewByCompanyIdN8nRequest
    | ContactRevealN8nRequest,
  configuration: {
    readonly url: string;
    readonly secret: string;
    readonly timeoutMs: number;
  },
  responseSchema:
    | typeof contactCompanySearchN8nResponseSchema
    | typeof contactPreviewByCompanyIdN8nResponseSchema
    | typeof contactPreviewN8nResponseSchema
    | typeof contactRevealN8nResponseSchema,
  fetchImplementation: typeof fetch,
): Promise<ContactDispatchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), configuration.timeoutMs);

  try {
    const response = await fetchImplementation(configuration.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        [ingressSecretHeader]: configuration.secret,
      },
      body: JSON.stringify(request),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    if (response.status !== 202) return { kind: "unknown" };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: "unknown" };
    }

    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) return { kind: "unknown" };

    if (
      (request.action === "PREVIEW" ||
        request.action === "PREVIEW_BY_COMPANY_ID") &&
      (!("request_id" in parsed.data) ||
        parsed.data.request_id !== request.request_id)
    ) {
      return { kind: "unknown" };
    }
    if (
      request.action === "COMPANY_SEARCH" &&
      (!("search_request_id" in parsed.data) ||
        parsed.data.search_request_id !== request.search_request_id)
    ) {
      return { kind: "unknown" };
    }
    if (
      request.action === "REVEAL" &&
      (!("reveal_request_id" in parsed.data) ||
        parsed.data.reveal_request_id !== request.reveal_request_id)
    ) {
      return { kind: "unknown" };
    }

    return { kind: "acknowledged" };
  } catch {
    return { kind: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}
