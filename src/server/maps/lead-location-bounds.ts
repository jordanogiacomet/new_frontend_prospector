import "server-only";

import type { AvailableLeadMapLocation } from "../../types/leads";

type LocationBounds = Pick<AvailableLeadMapLocation, "boundingBox">;

const latitudeSpan = 0.001;
const longitudeSpan = 0.0015;

export function registeredAddressBounds(
  latitude: number,
  longitude: number,
): LocationBounds {
  return {
    boundingBox: [
      clamp(longitude - longitudeSpan, -180, 180),
      clamp(latitude - latitudeSpan, -90, 90),
      clamp(longitude + longitudeSpan, -180, 180),
      clamp(latitude + latitudeSpan, -90, 90),
    ],
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number(Math.min(maximum, Math.max(minimum, value)).toFixed(6));
}
