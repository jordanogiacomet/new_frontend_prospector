import "server-only";

import NextAuth from "next-auth";

import { getServerEnv } from "../env";
import {
  classifyServerSession,
  createDevelopmentAuthorization,
} from "./authorization";
import {
  createAuthorizationPolicy,
  createAuthConfig,
} from "./config";

const environment = getServerEnv();
const authorizationPolicy = createAuthorizationPolicy(environment);
const developmentAuthorization = createDevelopmentAuthorization(
  environment.AUTH_DEV_BYPASS_ENABLED,
  process.env.NODE_ENV,
  environment.AUTH_ALLOWED_ORG_ID,
  environment.FEATURE_DEMO_DATA_ENABLED,
  environment.DEMO2_FULL_ACCESS_ENABLED,
  environment.FEATURE_SENSITIVE_CONTENT_ENABLED,
  environment.FEATURE_COSTS_ENABLED,
  environment.COSTS_READ_SUBJECTS,
  environment.DEMO2_K8S_RUNTIME_ENABLED,
  environment.DEMO3_LOCAL_RUNTIME_ENABLED,
);
const authentication = NextAuth(
  createAuthConfig(
    environment,
    process.env.NODE_ENV === "production",
  ),
);

export const { auth, handlers, signIn, signOut } = authentication;

export async function getServerAuthorization() {
  if (developmentAuthorization !== null) {
    return developmentAuthorization;
  }

  const session = await auth();

  return classifyServerSession(session, authorizationPolicy);
}

export type {
  AuthorizedActor,
  ServerSessionAuthorization,
} from "./authorization";
