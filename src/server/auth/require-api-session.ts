import "server-only";

import { SafeApiError } from "../api/errors";
import { getServerAuthorization } from "./index";

export interface ApiAuthorizationContext {
  readonly status: "authorized";
}

const authorizedContext: ApiAuthorizationContext = Object.freeze({
  status: "authorized",
});

export async function requireApiSession(): Promise<ApiAuthorizationContext> {
  const authorization = await getServerAuthorization();

  switch (authorization.status) {
    case "missing":
    case "expired":
      throw new SafeApiError("AUTHENTICATION_REQUIRED");
    case "unauthorized":
      throw new SafeApiError("ACCESS_DENIED");
    case "authorized":
      return authorizedContext;
  }
}
