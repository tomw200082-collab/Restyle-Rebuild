/**
 * `server-only` resolves to a module that throws unless the bundler asks for
 * the `react-server` condition, which Vitest's node environment does not. The
 * guard is a build-time contract for Next, not a runtime one, so a unit test
 * importing a server module is not the thing it exists to prevent.
 *
 * Aliased in vitest.config.ts. Nothing imports this directly.
 */
export {};
