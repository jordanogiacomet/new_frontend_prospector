"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Permission } from "../../server/auth/permissions";

interface PrivateCapabilities {
  readonly hasPermission: (permission: Permission) => boolean;
}

const PrivateCapabilitiesContext = createContext<PrivateCapabilities | null>(
  null,
);

export function PrivateCapabilitiesProvider({
  permissions,
  children,
}: {
  readonly permissions: readonly Permission[];
  readonly children: ReactNode;
}) {
  const value = useMemo<PrivateCapabilities>(() => {
    const approved = new Set<Permission>(permissions);
    return {
      hasPermission: (permission) => approved.has(permission),
    };
  }, [permissions]);

  return (
    <PrivateCapabilitiesContext.Provider value={value}>
      {children}
    </PrivateCapabilitiesContext.Provider>
  );
}

export function usePrivateCapabilities(): PrivateCapabilities {
  return (
    useContext(PrivateCapabilitiesContext) ?? {
      hasPermission: () => false,
    }
  );
}
