import "server-only";

import type { JWT } from "next-auth/jwt";
import type { NextAuthConfig, Profile } from "next-auth";

import type { ServerEnv } from "../env";
import {
  authorizeIdentityClaims,
  authorizeRetainedActor,
  type AuthorizationPolicy,
  type AuthorizedActor,
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

type AuthEnvironment = ServerEnv;

export function createAuthorizationPolicy(
  environment: AuthEnvironment,
): AuthorizationPolicy {
  return {
    issuer: environment.AUTH_OIDC_ISSUER,
    organizationId: environment.AUTH_ALLOWED_ORG_ID,
  };
}

function tokenActor(token: JWT): Record<string, unknown> {
  return {
    issuer: token.verifiedIssuer,
    subject: token.subject,
    organizationId: token.organizationId,
  };
}

function tokenFromActor(actor: AuthorizedActor): JWT {
  return {
    verifiedIssuer: actor.issuer,
    subject: actor.subject,
    organizationId: actor.organizationId,
    permissions: actor.permissions,
  };
}

export function createAuthConfig(
  environment: AuthEnvironment,
  isProduction: boolean,
): ApplicationAuthConfig {
  const policy = createAuthorizationPolicy(environment);

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
    pages: {
      signIn: "/login",
      error: "/login",
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
            organization: environment.AUTH_ALLOWED_ORG_ID,
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

          return tokenFromActor(authorization.actor);
        }

        const authorization = authorizeRetainedActor(
          tokenActor(token),
          policy,
        );

        return authorization.status === "authorized"
          ? tokenFromActor(authorization.actor)
          : {};
      },
      async session({ session, token }) {
        const authorization = authorizeRetainedActor(
          tokenActor(token),
          policy,
        );

        if (authorization.status !== "authorized") {
          return {
            expires: session.expires,
            authorization: "denied",
          };
        }

        return {
          expires: session.expires,
          authorization: "authorized",
          actor: authorization.actor,
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
