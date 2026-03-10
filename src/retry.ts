import type { RetryOptions, AttemptContext } from "./types";

const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY = 1000;
const DEFAULT_FACTOR = 2;
const DEFAULT_MAX_DELAY = 30_000;

/**
 * Retry an async function with exponential backoff.
 *
 * @example
 * ```ts
 * const data = await retry(() => fetch("/api/data"), {
 *   retries: 5,
 *   delay: 500,
 * });
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * const data = await retry(
 *   ({ signal }) => fetch("/api", { signal }),
 *   { signal: controller.signal }
 * );
 * ```
 */
export async function retry<T>(
  fn: (context: AttemptContext) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = DEFAULT_RETRIES,
    delay = DEFAULT_DELAY,
    factor = DEFAULT_FACTOR,
    maxDelay = DEFAULT_MAX_DELAY,
    jitter = true,
    signal,
    onRetry,
    retryIf,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    checkAborted(signal);

    try {
      const context: AttemptContext = {
        attempt,
        remaining: retries + 1 - attempt,
        signal,
      };
      return await fn(context);
    } catch (err) {
      lastError = toError(err);

      // Last attempt — don't retry
      if (attempt > retries) break;

      // Check if error is retryable
      if (retryIf && !retryIf(lastError)) break;

      // Calculate delay with exponential backoff
      const baseDelay = Math.min(delay * factor ** (attempt - 1), maxDelay);
      const actualDelay = jitter ? addJitter(baseDelay) : baseDelay;

      // onRetry hook — return false to stop
      if (onRetry) {
        const result = await onRetry(lastError, attempt, actualDelay);
        if (result === false) break;
      }

      checkAborted(signal);
      await sleep(actualDelay, signal);
    }
  }

  throw lastError;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AbortError(signal.reason ?? "Retry aborted");
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new AbortError(signal.reason ?? "Retry aborted"));
      };

      if (signal.aborted) {
        clearTimeout(timer);
        reject(new AbortError(signal.reason ?? "Retry aborted"));
        return;
      }

      signal.addEventListener("abort", onAbort, { once: true });

      // Clean up listener when timer fires
      const originalResolve = resolve;
      resolve = (() => {
        signal.removeEventListener("abort", onAbort);
        originalResolve();
      }) as typeof resolve;
    }
  });
}

function addJitter(delay: number): number {
  // Full jitter: random value between 0 and delay
  return Math.floor(Math.random() * delay);
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Error thrown when retry is aborted via AbortSignal.
 */
export class AbortError extends Error {
  constructor(reason?: string) {
    super(reason ?? "Retry aborted");
    this.name = "AbortError";
  }
}
