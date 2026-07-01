import "server-only";

import NextAuth from "next-auth";

import { getServerEnv } from "../env";
import { classifyServerSession } from "./authorization";
import { createAuthConfig } from "./config";

const authentication = NextAuth(
  createAuthConfig(
    getServerEnv(),
    process.env.NODE_ENV === "production",
  ),
);

export const { auth, handlers, signIn, signOut } = authentication;

export async function getServerAuthorization() {
  const session = await auth();

  return classifyServerSession(session);
}

export type {
  ServerSessionAuthorization,
} from "./authorization";
