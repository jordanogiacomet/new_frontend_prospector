import "server-only";

import type { AvailableLeadMapLocation } from "../../types/leads";
import { brazilianMunicipalityCentroids } from "./data/brazilian-municipality-centroids";

interface MunicipalityLocation {
  readonly city: string | null;
  readonly uf: string | null;
}

type MunicipalityCoordinates = Omit<AvailableLeadMapLocation, "status">;

const municipalityCentroids: Readonly<
  Record<string, readonly [number, number]>
> = brazilianMunicipalityCentroids;
const latitudeSpan = 0.1;
const longitudeSpan = 0.14;

function normalizeMunicipalityName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number(
    Math.min(maximum, Math.max(minimum, value)).toFixed(6),
  );
}

export function resolveLeadMunicipalityLocation(
  input: MunicipalityLocation,
): MunicipalityCoordinates | null {
  const city = input.city?.trim() ?? "";
  const uf = input.uf?.trim().toUpperCase() ?? "";

  if (city === "" || !/^[A-Z]{2}$/.test(uf)) {
    return null;
  }

  const coordinates =
    municipalityCentroids[`${uf.toLowerCase()}|${normalizeMunicipalityName(city)}`];
  if (coordinates === undefined) {
    return null;
  }

  const [latitude, longitude] = coordinates;
  return {
    precision: "municipality_center",
    latitude,
    longitude,
    boundingBox: [
      clamp(longitude - longitudeSpan, -180, 180),
      clamp(latitude - latitudeSpan, -90, 90),
      clamp(longitude + longitudeSpan, -180, 180),
      clamp(latitude + latitudeSpan, -90, 90),
    ],
  };
}
