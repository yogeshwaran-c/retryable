# Changelog

## 0.1.0 (2026-03-10)

- Initial release
- Async retry with exponential backoff
- Full jitter support
- AbortSignal integration
- `onRetry` hook (sync/async, return false to stop)
- `retryIf` conditional retry
- Attempt context (`attempt`, `remaining`, `signal`)
- Zero dependencies
