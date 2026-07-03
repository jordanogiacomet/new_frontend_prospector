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
