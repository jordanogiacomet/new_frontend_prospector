"use client";

import { useEffect, useState } from "react";

interface LeadLocationMapProps {
  cnpj: string;
  city: string | null;
  leadRunId: string;
  uf: string | null;
}

interface MapCoordinates {
  precision:
    | "registered_address"
    | "registered_postal_code"
    | "municipality_center";
  latitude: number;
  longitude: number;
  boundingBox: readonly [number, number, number, number];
}

type MapState =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "ready"; coordinates: MapCoordinates }
  | { status: "error" };

function normalizePart(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function locationCacheKey(
  cnpj: string,
  city: string | null,
  uf: string | null,
): string {
  return `prospecta:lead-map:v4:${cnpj}|${city?.toLowerCase() ?? ""}|${uf?.toLowerCase() ?? ""}`;
}

function buildEmbedUrl(coordinates: MapCoordinates): string {
  const url = new URL("https://www.openstreetmap.org/export/embed.html");
  url.searchParams.set("bbox", coordinates.boundingBox.join(","));
  url.searchParams.set("layer", "mapnik");
  url.searchParams.set(
    "marker",
    `${coordinates.latitude},${coordinates.longitude}`,
  );
  return url.toString();
}

function parseCachedCoordinates(value: string | null): MapCoordinates | null {
  if (value === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const precision = record.precision;
    const latitude = record.latitude;
    const longitude = record.longitude;
    const boundingBox = record.boundingBox;

    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      (precision !== "registered_address" &&
        precision !== "registered_postal_code" &&
        precision !== "municipality_center") ||
      !Array.isArray(boundingBox) ||
      boundingBox.length !== 4 ||
      !boundingBox.every(
        (coordinate) =>
          typeof coordinate === "number" && Number.isFinite(coordinate),
      )
    ) {
      return null;
    }

    const [west, south, east, north] = boundingBox;
    if (
      west === undefined ||
      south === undefined ||
      east === undefined ||
      north === undefined ||
      west < -180 ||
      east > 180 ||
      south < -90 ||
      north > 90 ||
      west >= east ||
      south >= north
    ) {
      return null;
    }

    return {
      precision,
      latitude,
      longitude,
      boundingBox: [west, south, east, north],
    };
  } catch {
    return null;
  }
}

function parseMapResponse(
  value: unknown,
): MapCoordinates | "unavailable" | null {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return null;
  }

  const data = value.data;
  if (typeof data !== "object" || data === null || !("status" in data)) {
    return null;
  }

  if (data.status === "unavailable") {
    return "unavailable";
  }

  if (data.status !== "available") {
    return null;
  }

  return parseCachedCoordinates(JSON.stringify(data));
}

export function LeadLocationMap({
  cnpj,
  city,
  leadRunId,
  uf,
}: LeadLocationMapProps) {
  const normalizedCity = normalizePart(city);
  const normalizedUf = normalizePart(uf);
  const [retryVersion, setRetryVersion] = useState(0);
  const [mapState, setMapState] = useState<MapState>({ status: "loading" });
  const locationLabel = [normalizedCity, normalizedUf]
    .filter(Boolean)
    .join(" / ");
  const visibleMapState = mapState;
  const isRegisteredAddress =
    visibleMapState.status === "ready" &&
    visibleMapState.coordinates.precision === "registered_address";
  const isRegisteredPostalCode =
    visibleMapState.status === "ready" &&
    visibleMapState.coordinates.precision === "registered_postal_code";
  const isRegisteredReference =
    isRegisteredAddress || isRegisteredPostalCode;

  useEffect(() => {
    const cacheKey = locationCacheKey(cnpj, normalizedCity, normalizedUf);
    const abortController = new AbortController();

    async function loadMap(): Promise<void> {
      await Promise.resolve();
      const cachedCoordinates = parseCachedCoordinates(
        window.sessionStorage.getItem(cacheKey),
      );

      if (cachedCoordinates !== null) {
        if (!abortController.signal.aborted) {
          setMapState({ status: "ready", coordinates: cachedCoordinates });
        }
        return;
      }

      if (!abortController.signal.aborted) {
        setMapState({ status: "loading" });
      }

      try {
        const response = await fetch(
          `/api/leads/${encodeURIComponent(cnpj)}/location-map?leadRunId=${encodeURIComponent(leadRunId)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            credentials: "same-origin",
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error("Geocoder unavailable");
        }

        const payload: unknown = await response.json();
        const coordinates = parseMapResponse(payload);

        if (coordinates === null) {
          throw new Error("Invalid location response");
        }

        if (coordinates === "unavailable") {
          if (!abortController.signal.aborted) {
            setMapState({ status: "unavailable" });
          }
          return;
        }

        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(coordinates));
        } catch {
          // A private browsing policy may disable session storage; the map can
          // still render from the validated response.
        }
        if (!abortController.signal.aborted) {
          setMapState({ status: "ready", coordinates });
        }
      } catch {
        if (!abortController.signal.aborted) {
          setMapState({ status: "error" });
        }
      }
    }

    void loadMap();
    return () => abortController.abort();
  }, [cnpj, leadRunId, normalizedCity, normalizedUf, retryVersion]);

  return (
    <section
      aria-labelledby="lead-location-heading"
      className="border-y border-[oklch(72%_0.035_82)] py-8"
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-10">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
            {isRegisteredAddress
              ? "Referência cadastral"
              : isRegisteredPostalCode
                ? "Referência por CEP"
                : "Referência territorial"}
          </p>
          <h2
            id="lead-location-heading"
            className="mt-2 font-serif text-3xl tracking-[-0.03em]"
          >
            Localização da empresa
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
            {isRegisteredAddress
              ? "O marcador usa o endereço cadastral público localizado para esta empresa."
              : isRegisteredPostalCode
                ? "O marcador usa a coordenada pública do CEP vinculado ao endereço cadastral."
                : "O mapa indica o município armazenado, não o endereço da sede."}
          </p>
        </div>

        {locationLabel !== "" || isRegisteredReference ? (
          <div className="border-l border-[oklch(72%_0.075_174)] pl-4">
            <p className="text-xs font-bold tracking-[0.12em] text-[oklch(45%_0.105_174)] uppercase">
              {isRegisteredAddress
                ? "Sede cadastral aproximada"
                : isRegisteredPostalCode
                  ? "Entorno do CEP cadastral"
                  : "Referência aproximada"}
            </p>
            <p className="mt-1 font-serif text-2xl tracking-[-0.025em]">
              {isRegisteredAddress
                ? "Ponto cadastral localizado"
                : isRegisteredPostalCode
                  ? "CEP cadastral localizado"
                  : locationLabel}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-7 overflow-hidden border border-[oklch(72%_0.035_82)] bg-[oklch(91%_0.025_174)]">
        {visibleMapState.status === "unavailable" ? (
          <div role="status" className="grid min-h-72 place-content-center px-6 py-12 text-center">
            <p className="font-serif text-2xl tracking-[-0.025em]">
              Localização indisponível
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-[oklch(43%_0.03_252)]">
              Não foi possível localizar um endereço cadastral nem uma
              referência municipal para esta empresa.
            </p>
          </div>
        ) : null}

        {visibleMapState.status === "loading" ? (
          <div
            role="status"
            aria-label="Carregando mapa"
            aria-live="polite"
            className="relative min-h-80 overflow-hidden bg-[oklch(94%_0.025_174)] md:min-h-[28rem]"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 animate-pulse opacity-55 motion-reduce:animate-none"
              style={{
                backgroundImage:
                  "linear-gradient(oklch(72% 0.035 174 / 0.35) 1px, transparent 1px), linear-gradient(90deg, oklch(72% 0.035 174 / 0.35) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <p className="absolute bottom-6 left-6 bg-[oklch(97%_0.012_82)] px-4 py-3 text-sm font-bold">
              Localizando a empresa…
            </p>
          </div>
        ) : null}

        {visibleMapState.status === "error" ? (
          <div
            role="alert"
            aria-label="Mapa indisponível"
            className="grid min-h-80 place-content-center px-6 py-12 text-center md:min-h-[28rem]"
          >
            <p className="font-serif text-2xl tracking-[-0.025em]">
              Mapa indisponível
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-[oklch(43%_0.03_252)]">
              Não foi possível carregar a localização agora.
            </p>
            <button
              type="button"
              className="ui-action ui-action--secondary mx-auto mt-5"
              onClick={() => setRetryVersion((version) => version + 1)}
            >
              Tentar carregar o mapa
            </button>
          </div>
        ) : null}

        {visibleMapState.status === "ready" ? (
          <iframe
            title={
              isRegisteredAddress
                ? `Mapa da sede cadastral aproximada de ${locationLabel || "empresa"}`
                : isRegisteredPostalCode
                  ? `Mapa do entorno do CEP cadastral de ${locationLabel || "empresa"}`
                  : `Mapa aproximado de ${locationLabel}`
            }
            src={buildEmbedUrl(visibleMapState.coordinates)}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin"
            className="h-80 w-full border-0 md:h-[28rem]"
          />
        ) : null}
      </div>

      {visibleMapState.status === "ready" ? (
        <p className="mt-3 text-xs leading-5 text-[oklch(48%_0.025_252)]">
          Dados cartográficos © colaboradores do OpenStreetMap. {isRegisteredAddress
            ? "O marcador representa uma geocodificação aproximada da sede cadastral, não uma unidade operacional verificada."
            : isRegisteredPostalCode
              ? "O marcador representa o entorno do CEP cadastral, não a entrada ou uma unidade operacional verificada."
              : "O marcador representa o centro aproximado do município."}
        </p>
      ) : null}
    </section>
  );
}
