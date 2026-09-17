import type { Env } from "./env";
import { errorResponse } from "./lib/http";
import { listTreatments } from "./routes/treatments";
import { submitConsultation, getClientConsultation } from "./routes/consultations";
import { listStaffConsultations, getStaffConsultation, recordStaffReview } from "./routes/staff";

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

    // Static assets, with SPA fallback so client-side routes (e.g. /staff/login) work on refresh.
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    const indexRequest = new Request(new URL("/index.html", request.url), request);
    return env.ASSETS.fetch(indexRequest);
  },
};
