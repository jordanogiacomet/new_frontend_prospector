import { describe, expect, it } from "vitest";

import {
  APPROVED_PERMISSIONS,
  PERMISSION_BUNDLES,
  isPermission,
  permissionsForBundle,
  permissionsForRoles,
  retainApprovedPermissions,
} from "./permissions";

describe("permission policy", () => {
  it("defines the exact approved permission union", () => {
    expect(APPROVED_PERMISSIONS).toEqual([
      "leads:read",
      "imports:read",
      "imports:create",
      "commercial:read",
      "commercial:write",
      "commercial:assign",
      "sensitive:read",
      "audit:read",
    ]);
  });

  it.each(APPROVED_PERMISSIONS)("recognizes the approved permission %s", (permission) => {
    expect(isPermission(permission)).toBe(true);
  });

  it("rejects an unknown permission", () => {
    expect(isPermission("leads:delete")).toBe(false);
  });

  it("retains only approved permissions", () => {
    expect(
      retainApprovedPermissions([
        "leads:read",
        "unknown:permission",
        "commercial:write",
      ]),
    ).toEqual(["leads:read", "commercial:write"]);
  });

  it("deduplicates approved permissions", () => {
    expect(
      retainApprovedPermissions(["imports:read", "imports:read", "audit:read"]),
    ).toEqual(["imports:read", "audit:read"]);
  });

  it("defines the reader bundle", () => {
    expect(PERMISSION_BUNDLES.reader).toEqual([
      "leads:read",
      "imports:read",
      "commercial:read",
    ]);
  });

  it("defines the seller bundle as reader plus commercial write", () => {
    expect(PERMISSION_BUNDLES.seller).toEqual([
      "leads:read",
      "imports:read",
      "commercial:read",
      "commercial:write",
    ]);
  });

  it("defines the manager bundle as seller plus import and assignment", () => {
    expect(PERMISSION_BUNDLES.manager).toEqual([
      "leads:read",
      "imports:read",
      "commercial:read",
      "commercial:write",
      "imports:create",
      "commercial:assign",
    ]);
  });

  it("defines the auditor bundle without write permissions", () => {
    expect(PERMISSION_BUNDLES.auditor).toEqual([
      "leads:read",
      "imports:read",
      "commercial:read",
      "audit:read",
    ]);
  });

  it("defines sensitive access as an independent overlay", () => {
    expect(PERMISSION_BUNDLES.sensitive).toEqual(["sensitive:read"]);
  });

  it.each(["reader", "seller", "manager", "auditor"] as const)(
    "does not grant sensitive access through the %s bundle",
    (bundle) => {
      expect(PERMISSION_BUNDLES[bundle]).not.toContain("sensitive:read");
    },
  );

  it("grants nothing for an unknown bundle", () => {
    expect(permissionsForBundle("administrator")).toEqual([]);
  });

  it("resolves permissions from an explicitly mapped synthetic role", () => {
    expect(
      permissionsForRoles(["synthetic-manager-role"], {
        "synthetic-manager-role": ["manager"],
      }),
    ).toEqual(PERMISSION_BUNDLES.manager);
  });

  it("grants nothing for an unmapped role", () => {
    expect(
      permissionsForRoles(["synthetic-unknown-role"], {
        "synthetic-reader-role": ["reader"],
      }),
    ).toEqual([]);
  });

  it("grants nothing from an unknown bundle assigned to a role", () => {
    expect(
      permissionsForRoles(["synthetic-role"], {
        "synthetic-role": ["unknown-bundle"],
      }),
    ).toEqual([]);
  });

  it("does not recognize inherited role mappings", () => {
    const roleBundles = Object.create({
      "synthetic-inherited-role": ["manager"],
    }) as Readonly<Record<string, readonly unknown[]>>;

    expect(
      permissionsForRoles(["synthetic-inherited-role"], roleBundles),
    ).toEqual([]);
  });

  it("grants sensitive access only through an explicit overlay mapping", () => {
    const roleBundles = {
      "synthetic-manager-role": ["manager"],
      "synthetic-sensitive-role": ["sensitive"],
    };

    expect(
      permissionsForRoles(["synthetic-manager-role"], roleBundles),
    ).not.toContain("sensitive:read");
    expect(
      permissionsForRoles(
        ["synthetic-manager-role", "synthetic-sensitive-role"],
        roleBundles,
      ),
    ).toContain("sensitive:read");
  });

  it("combines bundles without duplicating shared permissions", () => {
    expect(
      permissionsForRoles(["synthetic-combined-role"], {
        "synthetic-combined-role": ["manager", "auditor"],
      }),
    ).toEqual([
      "leads:read",
      "imports:read",
      "commercial:read",
      "commercial:write",
      "imports:create",
      "commercial:assign",
      "audit:read",
    ]);
  });
});
