import "server-only";

import type { JWT } from "next-auth/jwt";
import type { NextAuthConfig, Profile } from "next-auth";

import type { ServerEnv } from "../env";
import {
  authorizeIdentityClaims,
  type AuthorizationPolicy,
} from "./authorization";

export const AUTH_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const OIDC_PROVIDER_ID = "organization-oidc";

type ApplicationAuthConfig = NextAuthConfig & {
  cookies: {
    sessionToken: {
      name: string;
      options: {
        httpOnly: true;
        sameSite: "lax";
        path: "/";
        secure: boolean;
      };
    };
  };
};

function policyFromEnvironment(environment: ServerEnv): AuthorizationPolicy {
  return {
    issuer: environment.AUTH_OIDC_ISSUER,
    organizationId: environment.AUTH_ALLOWED_ORG_ID,
  };
}

function tokenIdentity(token: JWT): Record<string, unknown> {
  return {
    iss: token.verifiedIssuer,
    sub: token.subject,
    org_id: token.organizationId,
  };
}

function retainApprovedTokenValues(token: JWT): JWT {
  const retained: JWT = {};

  if (typeof token.verifiedIssuer === "string") {
    retained.verifiedIssuer = token.verifiedIssuer;
  }

  if (typeof token.subject === "string") {
    retained.subject = token.subject;
  }

  if (typeof token.organizationId === "string") {
    retained.organizationId = token.organizationId;
  }

  return retained;
}

export function createAuthConfig(
  environment: ServerEnv,
  isProduction: boolean,
): ApplicationAuthConfig {
  const policy = policyFromEnvironment(environment);

  return {
    secret: environment.AUTH_SECRET,
    trustHost: true,
    useSecureCookies: isProduction,
    cookies: {
      sessionToken: {
        name: `${isProduction ? "__Secure-" : ""}authjs.session-token`,
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: isProduction,
        },
      },
    },
    session: {
      strategy: "jwt",
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    },
    providers: [
      {
        id: OIDC_PROVIDER_ID,
        name: "Acesso corporativo",
        type: "oidc",
        issuer: environment.AUTH_OIDC_ISSUER,
        clientId: environment.AUTH_OIDC_CLIENT_ID,
        clientSecret: environment.AUTH_OIDC_CLIENT_SECRET,
        checks: ["pkce", "state", "nonce"],
        authorization: {
          params: {
            scope: "openid",
          },
        },
        profile(profile: Profile) {
          return {
            id: typeof profile.sub === "string" ? profile.sub : "",
          };
        },
      },
    ],
    callbacks: {
      async signIn({ account, profile }) {
        if (
          account?.provider !== OIDC_PROVIDER_ID ||
          account.type !== "oidc" ||
          !profile
        ) {
          return false;
        }

        return authorizeIdentityClaims(profile, policy).status === "authorized";
      },
      async jwt({ token, account, profile }) {
        if (account || profile) {
          if (
            account?.provider !== OIDC_PROVIDER_ID ||
            account.type !== "oidc" ||
            !profile
          ) {
            return {};
          }

          const authorization = authorizeIdentityClaims(profile, policy);

          if (authorization.status !== "authorized") {
            return {};
          }

          return {
            verifiedIssuer: authorization.identity.issuer,
            subject: authorization.identity.subject,
            organizationId: authorization.identity.organizationId,
          };
        }

        return retainApprovedTokenValues(token);
      },
      async session({ session, token }) {
        const authorization = authorizeIdentityClaims(
          tokenIdentity(token),
          policy,
        );

        return {
          expires: session.expires,
          authorization:
            authorization.status === "authorized" ? "authorized" : "denied",
        };
      },
    },
    logger: {
      error() {
        console.error("Authentication request failed.");
      },
      warn() {
        console.warn("Authentication request warning.");
      },
    },
  };
}
