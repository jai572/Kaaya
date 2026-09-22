// Single source of truth for "is this a real client-side route" — used by
// worker/index.ts to decide whether an unmatched static-asset request should
// get the SPA shell with 200 (a real route, not yet a built asset) or 404 (a
// genuinely unknown path). Keep in sync with the <Route> list in src/App.tsx.
export const KNOWN_EXACT_ROUTES = [
  "/",
  "/treatments",
  "/about",
  "/gallery",
  "/contact",
  "/book",
  "/consultation",
  "/staff/login",
  "/staff",
  "/staff/services",
  "/staff/staff-members",
  "/staff/bookings",
  "/staff/permissions",
] as const;

export const KNOWN_ROUTE_PATTERNS: RegExp[] = [
  /^\/consultation\/[^/]+\/submitted$/,
  /^\/c\/[^/]+$/,
  /^\/staff\/consultations\/[^/]+$/,
  /^\/book\/[^/]+\/confirmed$/,
];

export function isKnownRoute(pathname: string): boolean {
  if ((KNOWN_EXACT_ROUTES as readonly string[]).includes(pathname)) return true;
  return KNOWN_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}
