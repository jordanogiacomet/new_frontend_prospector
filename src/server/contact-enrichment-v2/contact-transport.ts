import "server-only";

export function hasVerifiedHttpsTransport(request: Request): boolean {
  let directHttps = false;
  try {
    directHttps = new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }

  const forwardedProto = request.headers.get("X-Forwarded-Proto");
  if (forwardedProto === null) return directHttps;

  return forwardedProto === "https";
}

