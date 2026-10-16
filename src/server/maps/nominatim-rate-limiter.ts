import "server-only";

const minimumStartIntervalMs = 1_000;

let queue: Promise<void> = Promise.resolve();
let nextAllowedStart = 0;

interface RateLimiterDependencies {
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export function scheduleNominatimRequest<Result>(
  operation: () => Promise<Result>,
  dependencies: RateLimiterDependencies = {},
): Promise<Result> {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? defaultSleep;

  const scheduled = queue.then(async () => {
    const waitMilliseconds = Math.max(0, nextAllowedStart - now());
    if (waitMilliseconds > 0) {
      await sleep(waitMilliseconds);
    }

    nextAllowedStart = now() + minimumStartIntervalMs;
    return operation();
  });

  queue = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

