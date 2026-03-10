import { describe, it, expect, vi } from "vitest";
import { retry, AbortError } from "../src";

describe("retry", () => {
  describe("basic behavior", () => {
    it("returns value on first success", async () => {
      const result = await retry(async () => "ok");
      expect(result).toBe("ok");
    });

    it("retries on failure and returns on eventual success", async () => {
      let calls = 0;
      const result = await retry(
        async () => {
          calls++;
          if (calls < 3) throw new Error("fail");
          return "ok";
        },
        { delay: 10 },
      );
      expect(result).toBe("ok");
      expect(calls).toBe(3);
    });

    it("throws last error after all retries exhausted", async () => {
      await expect(
        retry(async () => { throw new Error("always fails"); }, { retries: 2, delay: 10 }),
      ).rejects.toThrow("always fails");
    });

    it("respects retries count", async () => {
      let calls = 0;
      try {
        await retry(
          async () => { calls++; throw new Error("fail"); },
          { retries: 4, delay: 10 },
        );
      } catch {
        // expected
      }
      expect(calls).toBe(5); // 1 initial + 4 retries
    });
  });

  describe("attempt context", () => {
    it("passes attempt number starting at 1", async () => {
      const attempts: number[] = [];
      let calls = 0;
      await retry(
        async (ctx) => {
          attempts.push(ctx.attempt);
          calls++;
          if (calls < 3) throw new Error("fail");
          return "ok";
        },
        { delay: 10 },
      );
      expect(attempts).toEqual([1, 2, 3]);
    });

    it("passes remaining retries", async () => {
      const remaining: number[] = [];
      let calls = 0;
      await retry(
        async (ctx) => {
          remaining.push(ctx.remaining);
          calls++;
          if (calls < 3) throw new Error("fail");
          return "ok";
        },
        { retries: 3, delay: 10 },
      );
      expect(remaining).toEqual([3, 2, 1]);
    });
  });

  describe("backoff", () => {
    it("increases delay exponentially", async () => {
      const delays: number[] = [];
      let calls = 0;

      await retry(
        async () => {
          calls++;
          if (calls <= 3) throw new Error("fail");
          return "ok";
        },
        {
          retries: 3,
          delay: 100,
          factor: 2,
          jitter: false,
          onRetry: (_err, _attempt, delay) => { delays.push(delay); },
        },
      );

      expect(delays).toEqual([100, 200, 400]);
    });

    it("caps delay at maxDelay", async () => {
      const delays: number[] = [];
      let calls = 0;

      try {
        await retry(
          async () => { calls++; throw new Error("fail"); },
          {
            retries: 5,
            delay: 100,
            factor: 10,
            maxDelay: 500,
            jitter: false,
            onRetry: (_err, _attempt, delay) => { delays.push(delay); },
          },
        );
      } catch {
        // expected
      }

      expect(delays.every((d) => d <= 500)).toBe(true);
    });

    it("applies jitter (delay is randomized)", async () => {
      const delays: number[] = [];
      let calls = 0;

      try {
        await retry(
          async () => { calls++; throw new Error("fail"); },
          {
            retries: 10,
            delay: 50,
            factor: 1,
            jitter: true,
            onRetry: (_err, _attempt, delay) => { delays.push(delay); },
          },
        );
      } catch {
        // expected
      }

      // With jitter, delays should vary (not all identical)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe("onRetry", () => {
    it("is called with error, attempt, and delay", async () => {
      const calls: { msg: string; attempt: number }[] = [];
      let count = 0;

      await retry(
        async () => {
          count++;
          if (count < 3) throw new Error(`fail-${count}`);
          return "ok";
        },
        {
          delay: 10,
          jitter: false,
          onRetry: (err, attempt) => { calls.push({ msg: err.message, attempt }); },
        },
      );

      expect(calls).toEqual([
        { msg: "fail-1", attempt: 1 },
        { msg: "fail-2", attempt: 2 },
      ]);
    });

    it("stops retrying when onRetry returns false", async () => {
      let calls = 0;

      await expect(
        retry(
          async () => { calls++; throw new Error("fail"); },
          {
            retries: 5,
            delay: 10,
            onRetry: () => false,
          },
        ),
      ).rejects.toThrow("fail");

      expect(calls).toBe(1); // initial attempt only, onRetry stopped before retry
    });
  });

  describe("retryIf", () => {
    it("only retries when retryIf returns true", async () => {
      let calls = 0;

      await expect(
        retry(
          async () => {
            calls++;
            throw new Error(calls === 1 ? "retryable" : "not-retryable");
          },
          {
            retries: 5,
            delay: 10,
            retryIf: (err) => err.message === "retryable",
          },
        ),
      ).rejects.toThrow("not-retryable");

      expect(calls).toBe(2);
    });

    it("does not retry when retryIf returns false on first error", async () => {
      let calls = 0;

      await expect(
        retry(
          async () => { calls++; throw new Error("fatal"); },
          {
            retries: 5,
            delay: 10,
            retryIf: () => false,
          },
        ),
      ).rejects.toThrow("fatal");

      expect(calls).toBe(1);
    });
  });

  describe("AbortSignal", () => {
    it("aborts immediately if signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort("cancelled");

      await expect(
        retry(async () => "ok", { signal: controller.signal }),
      ).rejects.toThrow(AbortError);
    });

    it("aborts during delay", async () => {
      const controller = new AbortController();
      let calls = 0;

      const promise = retry(
        async () => { calls++; throw new Error("fail"); },
        { retries: 5, delay: 5000, signal: controller.signal },
      );

      // Abort after short delay
      setTimeout(() => controller.abort(), 50);

      await expect(promise).rejects.toThrow(AbortError);
      expect(calls).toBeLessThan(3);
    });

    it("passes signal to the function via context", async () => {
      const controller = new AbortController();
      let receivedSignal: AbortSignal | undefined;

      await retry(
        async (ctx) => {
          receivedSignal = ctx.signal;
          return "ok";
        },
        { signal: controller.signal },
      );

      expect(receivedSignal).toBe(controller.signal);
    });
  });

  describe("non-Error throws", () => {
    it("wraps non-Error throws into Error", async () => {
      await expect(
        retry(
          async () => { throw "string error"; },
          { retries: 0 },
        ),
      ).rejects.toThrow("string error");
    });
  });

  describe("defaults", () => {
    it("uses 3 retries by default", async () => {
      let calls = 0;
      try {
        await retry(
          async () => { calls++; throw new Error("fail"); },
          { delay: 10, jitter: false },
        );
      } catch {
        // expected
      }
      expect(calls).toBe(4); // 1 initial + 3 retries
    });
  });

  describe("async onRetry", () => {
    it("supports async onRetry callbacks", async () => {
      let calls = 0;
      const logs: string[] = [];

      await retry(
        async () => {
          calls++;
          if (calls < 2) throw new Error("fail");
          return "ok";
        },
        {
          delay: 10,
          onRetry: async (err) => {
            await new Promise((r) => setTimeout(r, 5));
            logs.push(err.message);
          },
        },
      );

      expect(logs).toEqual(["fail"]);
    });
  });
});
