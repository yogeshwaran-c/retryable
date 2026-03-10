# @yogeshyc/retryable

Async retry with exponential backoff, jitter, and AbortSignal support. **Zero dependencies.**

- Exponential backoff with configurable factor and max delay
- Full jitter for distributed systems (avoids thundering herd)
- AbortSignal support — cancel retries from outside
- `onRetry` hook with async support
- `retryIf` — conditionally retry based on the error
- Attempt context passed to your function
- Dual CJS/ESM with full TypeScript types
- Zero runtime dependencies

## Install

```bash
npm install @yogeshyc/retryable
```

## Quick Start

```ts
import { retry } from "@yogeshyc/retryable";

const data = await retry(() => fetch("/api/data").then((r) => r.json()), {
  retries: 5,
  delay: 500,
});
```

## API

### `retry<T>(fn, options?): Promise<T>`

Retries `fn` until it succeeds or all attempts are exhausted.

#### `fn(context: AttemptContext) => Promise<T>`

The async function to retry. Receives context:

```ts
interface AttemptContext {
  attempt: number;    // current attempt (starts at 1)
  remaining: number;  // retries remaining
  signal?: AbortSignal;
}
```

#### Options

```ts
interface RetryOptions {
  retries?: number;      // max retries (default: 3)
  delay?: number;        // initial delay in ms (default: 1000)
  factor?: number;       // backoff multiplier (default: 2)
  maxDelay?: number;     // max delay cap in ms (default: 30000)
  jitter?: boolean;      // randomize delay (default: true)
  signal?: AbortSignal;  // cancel retries
  onRetry?: (error: Error, attempt: number, delay: number) => void | boolean | Promise<void | boolean>;
  retryIf?: (error: Error) => boolean;
}
```

## Examples

### Exponential Backoff

```ts
await retry(() => callApi(), {
  retries: 5,
  delay: 200,    // 200ms, 400ms, 800ms, 1600ms, 3200ms
  factor: 2,
  jitter: false,
});
```

### With AbortSignal

```ts
const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10_000);

const data = await retry(
  ({ signal }) => fetch("/api", { signal }).then((r) => r.json()),
  { signal: controller.signal },
);
```

### Conditional Retry

```ts
await retry(() => callApi(), {
  retryIf: (error) => {
    // Only retry on network/5xx errors, not 4xx
    if (error instanceof TypeError) return true; // network error
    if ("status" in error && (error as any).status >= 500) return true;
    return false;
  },
});
```

### Logging Retries

```ts
await retry(() => callApi(), {
  onRetry: (error, attempt, delay) => {
    console.warn(`Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
  },
});
```

### Stop Retrying Early

```ts
await retry(() => callApi(), {
  onRetry: (error) => {
    if (error.message.includes("FATAL")) return false; // stop retrying
  },
});
```

## Backoff Formula

```
delay = min(initialDelay * factor ^ (attempt - 1), maxDelay)
```

With jitter enabled (default), the actual delay is randomized between `0` and the calculated delay (full jitter strategy).

## License

MIT
