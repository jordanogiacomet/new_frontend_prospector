import "server-only";

import { SafeApiError } from "../api/errors";
import type { AuthorizedActor } from "./authorization";
import { getServerAuthorization } from "./index";
import {
  isPermission,
  type Permission,
} from "./permissions";

export interface ApiAuthorizationContext {
  readonly status: "authorized";
  readonly actor: AuthorizedActor;
}

export async function requireApiSession(): Promise<ApiAuthorizationContext> {
  const authorization = await getServerAuthorization();

  switch (authorization.status) {
    case "missing":
    case "expired":
      throw new SafeApiError("AUTHENTICATION_REQUIRED");
    case "unauthorized":
      throw new SafeApiError("ACCESS_DENIED");
    case "authorized":
      return {
        status: "authorized",
        actor: authorization.actor,
      };
  }
}

export async function requirePermission(
  permission: Permission,
): Promise<ApiAuthorizationContext> {
  const context = await requireApiSession();

  if (
    !isPermission(permission) ||
    !context.actor.permissions.includes(permission)
  ) {
    throw new SafeApiError("ACCESS_DENIED");
  }

  return context;
}

type OriginRequest = Pick<Request, "headers" | "url">;

export function requireSameOrigin(request: OriginRequest): void {
  const suppliedOrigin = request.headers.get("origin");

  if (suppliedOrigin === null) {
    throw new SafeApiError("ACCESS_DENIED");
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    const parsedOrigin = new URL(suppliedOrigin);
    const headerOrigin = requestHeaderOrigin(request);

    if (
      suppliedOrigin !== parsedOrigin.origin ||
      parsedOrigin.username ||
      parsedOrigin.password ||
      parsedOrigin.pathname !== "/" ||
      parsedOrigin.search ||
      parsedOrigin.hash ||
      (parsedOrigin.origin !== requestOrigin &&
        parsedOrigin.origin !== headerOrigin)
    ) {
      throw new SafeApiError("ACCESS_DENIED");
    }
  } catch {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

function requestHeaderOrigin(request: OriginRequest): string | null {
  const host = request.headers.get("host");

  if (host === null) {
    return null;
  }

  const requestProtocol = new URL(request.url).protocol.replace(/:$/, "");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? requestProtocol;

  if (protocol !== "http" && protocol !== "https") {
    return null;
  }

  const parsed = new URL(`${protocol}://${host}`);

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  return parsed.origin;
}
