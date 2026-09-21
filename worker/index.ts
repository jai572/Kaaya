import type { Env } from "./env";
import { errorResponse } from "./lib/http";
import { listTreatments } from "./routes/treatments";
import { submitConsultation, getClientConsultation, finalizeConsultation } from "./routes/consultations";
import { listStaffConsultations, getStaffConsultation, recordStaffReview } from "./routes/staff";
import { listBookableServices } from "./routes/booking";
import { isKnownRoute } from "../shared/routes";

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;

  if (path === "/api/treatments" && method === "GET") {
    return listTreatments(env);
  }

  if (path === "/api/consultations" && method === "POST") {
    return submitConsultation(request, env);
  }

  const consultationMatch = path.match(/^\/api\/consultations\/([^/]+)$/);
  if (consultationMatch && method === "GET") {
    return getClientConsultation(request, env, consultationMatch[1]);
  }

  const finalizeMatch = path.match(/^\/api\/consultations\/([^/]+)\/finalize$/);
  if (finalizeMatch && method === "POST") {
    return finalizeConsultation(request, env, finalizeMatch[1]);
  }

  if (path === "/api/booking/services" && method === "GET") {
    return listBookableServices(env);
  }

  if (path === "/api/staff/consultations" && method === "GET") {
    return listStaffConsultations(request, env);
  }

  const staffDetailMatch = path.match(/^\/api\/staff\/consultations\/([^/]+)$/);
  if (staffDetailMatch && method === "GET") {
    return getStaffConsultation(request, env, staffDetailMatch[1]);
  }

  const staffReviewMatch = path.match(/^\/api\/staff\/consultations\/([^/]+)\/review$/);
  if (staffReviewMatch && method === "POST") {
    return recordStaffReview(request, env, staffReviewMatch[1]);
  }

  return errorResponse("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url.pathname);
      } catch (err) {
        console.error("Unhandled API error", err);
        return errorResponse("Internal server error", 500);
      }
    }

    // Static assets, with SPA fallback so client-side routes (e.g. /staff/login)
    // work on direct navigation/refresh. The assets binding doesn't only 404 for
    // an unmatched SPA route -- it can also issue its own redirect (307) while
    // trying to resolve the path, which must NOT be passed through to the
    // browser or every non-root route silently redirects to "/". Only a real
    // 2xx asset match should be served as-is; anything else falls through to
    // index.html so client-side routing can take over.
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.ok) return assetResponse;

    // Fetching "/index.html" directly triggers the assets layer's own
    // canonicalization redirect (index.html -> /), which would just repeat
    // the same problem. "/" resolves to the same file without a redirect.
    const indexRequest = new Request(new URL("/", request.url), request);
    const indexResponse = await env.ASSETS.fetch(indexRequest);

    // A known client route (e.g. /staff/login on direct load/refresh) gets
    // the SPA shell with 200 — it's a real page, just not a static asset.
    // Anything else is a genuinely unknown path, so it gets the same shell
    // (still a usable page, via the React NotFound route) but a real 404
    // status — otherwise every bad link/typo reports 200, which search
    // consoles flag as a soft-404 and which quietly breaks "does this page
    // exist" checks for any tool that reads status codes.
    if (isKnownRoute(url.pathname)) return indexResponse;
    return new Response(indexResponse.body, { status: 404, headers: indexResponse.headers });
  },
};
