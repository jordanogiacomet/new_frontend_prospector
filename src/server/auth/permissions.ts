export const APPROVED_PERMISSIONS = [
  "leads:read",
  "imports:read",
  "imports:create",
  "commercial:read",
  "commercial:write",
  "commercial:assign",
  "sensitive:read",
  "audit:read",
] as const;

export type Permission = (typeof APPROVED_PERMISSIONS)[number];

export const PERMISSION_BUNDLES = {
  reader: ["leads:read", "imports:read", "commercial:read"],
  seller: [
    "leads:read",
    "imports:read",
    "commercial:read",
    "commercial:write",
  ],
  manager: [
    "leads:read",
    "imports:read",
    "commercial:read",
    "commercial:write",
    "imports:create",
    "commercial:assign",
  ],
  auditor: [
    "leads:read",
    "imports:read",
    "commercial:read",
    "audit:read",
  ],
  sensitive: ["sensitive:read"],
} as const satisfies Readonly<Record<string, readonly Permission[]>>;

export type PermissionBundle = keyof typeof PERMISSION_BUNDLES;

export type RoleBundleMapping = Readonly<
  Record<string, readonly unknown[]>
>;

const approvedPermissionSet = new Set<string>(APPROVED_PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && approvedPermissionSet.has(value);
}

export function retainApprovedPermissions(
  values: readonly unknown[],
): readonly Permission[] {
  const permissions = new Set<Permission>();

  for (const value of values) {
    if (isPermission(value)) {
      permissions.add(value);
    }
  }

  return [...permissions];
}

export function permissionsForBundle(
  bundle: unknown,
): readonly Permission[] {
  if (
    typeof bundle !== "string" ||
    !Object.hasOwn(PERMISSION_BUNDLES, bundle)
  ) {
    return [];
  }

  return PERMISSION_BUNDLES[bundle as PermissionBundle];
}

export function permissionsForRoles(
  roles: readonly unknown[],
  roleBundles: RoleBundleMapping,
): readonly Permission[] {
  const permissions: Permission[] = [];

  for (const role of roles) {
    if (typeof role !== "string" || !Object.hasOwn(roleBundles, role)) {
      continue;
    }

    for (const bundle of roleBundles[role]) {
      permissions.push(...permissionsForBundle(bundle));
    }
  }

  return retainApprovedPermissions(permissions);
}
