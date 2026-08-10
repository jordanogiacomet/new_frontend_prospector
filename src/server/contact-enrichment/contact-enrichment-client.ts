import "server-only";

import { getServerEnv } from "../env";
import {
  contactEnrichmentN8nRequestSchema,
  contactEnrichmentN8nResponseSchema,
  type ContactEnrichmentN8nRequest,
} from "./contact-enrichment-contract";

const UNKNOWN_RESULT = { kind: "unknown" } as const;

export type ContactEnrichmentIngressResult =
  | { readonly kind: "acknowledged" }
  | typeof UNKNOWN_RESULT;

export type ContactEnrichmentFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "json">>;

export interface ContactEnrichmentClientDependencies {
  readonly fetch: ContactEnrichmentFetch;
}

export async function submitContactEnrichmentToN8n(
  request: ContactEnrichmentN8nRequest,
  dependencies: ContactEnrichmentClientDependencies,
): Promise<ContactEnrichmentIngressResult> {
  const parsedRequest = contactEnrichmentN8nRequestSchema.safeParse(request);

  if (!parsedRequest.success) {
    return UNKNOWN_RESULT;
  }

  const environment = getServerEnv();
  const url = environment.N8N_CONTACT_ENRICHMENT_URL;
  const secret = environment.N8N_CONTACT_ENRICHMENT_SECRET;

  if (url === undefined || secret === undefined) {
    return UNKNOWN_RESULT;
  }

  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof UNKNOWN_RESULT>((resolve) => {
    timeoutId = setTimeout(() => {
      abortController.abort();
      resolve(UNKNOWN_RESULT);
    }, environment.CONTACT_ENRICHMENT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      requestAcknowledgement(
        parsedRequest.data,
        url,
        secret,
        abortController.signal,
        dependencies.fetch,
      ),
      timeout,
    ]);
  } catch {
    return UNKNOWN_RESULT;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function requestAcknowledgement(
  request: ContactEnrichmentN8nRequest,
  url: string,
  secret: string,
  signal: AbortSignal,
  fetch: ContactEnrichmentFetch,
): Promise<ContactEnrichmentIngressResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Prospecta-Contact-Enrichment-Secret": secret,
    },
    body: JSON.stringify(request),
    cache: "no-store",
    signal,
  });

  if (response.status !== 202) {
    return UNKNOWN_RESULT;
  }

  const payload: unknown = await response.json();
  const parsed = contactEnrichmentN8nResponseSchema.safeParse(payload);

  if (!parsed.success || parsed.data.request_id !== request.request_id) {
    return UNKNOWN_RESULT;
  }

  return { kind: "acknowledged" };
}
