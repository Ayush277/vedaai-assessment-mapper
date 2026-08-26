/**
 * `server-only` throws on import outside a React Server Component, which is
 * exactly what we want in the app and exactly what blocks unit tests of the
 * server modules. Vitest aliases the package to this no-op; the real guard is
 * untouched in every build.
 */
export {};
