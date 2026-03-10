/** Options for configuring retry behavior */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  retries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  delay?: number;
  /** Backoff multiplier applied after each retry (default: 2) */
  factor?: number;
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelay?: number;
  /** Add random jitter to delay (default: true) */
  jitter?: boolean;
  /** AbortSignal to cancel retries */
  signal?: AbortSignal;
  /** Called before each retry. Return false to stop retrying. */
  onRetry?: (error: Error, attempt: number, delay: number) => void | boolean | Promise<void | boolean>;
  /** Only retry if this returns true for the thrown error */
  retryIf?: (error: Error) => boolean;
}

/** Context passed to the retried function */
export interface AttemptContext {
  /** Current attempt number (starts at 1) */
  attempt: number;
  /** Number of retries remaining */
  remaining: number;
  /** AbortSignal if provided */
  signal?: AbortSignal;
}
