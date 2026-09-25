import type { Env } from "./env";
import { errorResponse } from "./lib/http";
import { listTreatments } from "./routes/treatments";
import { submitConsultation, getClientConsultation, finalizeConsultation } from "./routes/consultations";
import { listStaffConsultations, getStaffConsultation, recordStaffReview } from "./routes/staff";
import {
  listBookableServices,
  listPublicLocations,
  listStaffForService,
  getAvailability,
  lookupOrCreateCustomer,
  createAppointment,
  linkAppointmentToConsultation,
  getAppointmentByReference,
  clientCancelAppointment,
  clientRequestReschedule,
} from "./routes/booking";
import {
  listServicesAdmin,
  createService,
  updateService,
  listStaffMembers,
  createStaffMember,
  updateStaffMember,
  getStaffWorkingHours,
  setStaffWorkingHours,
  getServiceStaffCapabilities,
  setServiceStaffCapabilities,
  listAppointments,
  approveAppointment,
  cancelAppointment,
  rescheduleAppointment,
  markCompleted,
  markNoShow,
  listChangeRequests,
  resolveChangeRequest,
  getClientRecord,
  getRevenueSummary,
  listStaffPermissions,
  setStaffPermissions,
} from "./routes/staffBooking";
import {
  listLocations,
  createLocation,
  updateLocation,
  setLocationHours,
  getBookingSettings,
  updateBookingSettings,
  getStaffServices,
  setStaffServices,
  getRota,
  listRotaExceptions,
  createRotaExceptions,
  deleteRotaException,
  listServiceStaffLinks,
} from "./routes/staffAdmin";
import {
  getCalendar,
  staffCreateAppointments,
  createTimeBlock,
  deleteTimeBlock,
  searchClients,
  staffCreateClient,
  staffUpdateClient,
} from "./routes/staffCalendar";
import { checkout } from "./routes/checkout";
import { isKnownRoute } from "../shared/routes";

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const method = request.method;
  const path = url.pathname;

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

  if (path === "/api/booking/locations" && method === "GET") return listPublicLocations(env);

  if (path === "/api/booking/services" && method === "GET") {
    return listBookableServices(env);
  }

  if (path === "/api/booking/staff" && method === "GET") {
    return listStaffForService(env, url);
  }

  if (path === "/api/booking/availability" && method === "GET") {
    return getAvailability(env, url);
  }

  if (path === "/api/booking/customers" && method === "POST") {
    return lookupOrCreateCustomer(request, env);
  }

  if (path === "/api/booking/appointments" && method === "POST") {
    return createAppointment(request, env);
  }

  const linkConsultationMatch = path.match(/^\/api\/booking\/appointments\/([^/]+)\/consultation$/);
  if (linkConsultationMatch && method === "PATCH") {
    return linkAppointmentToConsultation(request, env, linkConsultationMatch[1]);
  }

  const appointmentRefMatch = path.match(/^\/api\/booking\/appointments\/([^/]+)$/);
  if (appointmentRefMatch && method === "GET") {
    return getAppointmentByReference(env, url, appointmentRefMatch[1]);
  }

  const clientCancelMatch = path.match(/^\/api\/booking\/appointments\/([^/]+)\/cancel$/);
  if (clientCancelMatch && method === "POST") {
    return clientCancelAppointment(request, env, clientCancelMatch[1]);
  }

  const clientRescheduleMatch = path.match(/^\/api\/booking\/appointments\/([^/]+)\/reschedule$/);
  if (clientRescheduleMatch && method === "POST") {
    return clientRequestReschedule(request, env, clientRescheduleMatch[1]);
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

  if (path === "/api/staff/booking/services" && method === "GET") {
    return listServicesAdmin(request, env);
  }

  if (path === "/api/staff/booking/services" && method === "POST") {
    return createService(request, env);
  }

  const serviceMatch = path.match(/^\/api\/staff\/booking\/services\/([^/]+)$/);
  if (serviceMatch && method === "PATCH") {
    return updateService(request, env, serviceMatch[1]);
  }

  if (path === "/api/staff/booking/staff-members" && method === "GET") {
    return listStaffMembers(request, env);
  }

  if (path === "/api/staff/booking/staff-members" && method === "POST") {
    return createStaffMember(request, env);
  }

  const staffMemberMatch = path.match(/^\/api\/staff\/booking\/staff-members\/([^/]+)$/);
  if (staffMemberMatch && method === "PATCH") {
    return updateStaffMember(request, env, staffMemberMatch[1]);
  }

  const hoursMatch = path.match(/^\/api\/staff\/booking\/staff-members\/([^/]+)\/hours$/);
  if (hoursMatch && method === "GET") {
    return getStaffWorkingHours(request, env, hoursMatch[1]);
  }
  if (hoursMatch && method === "PUT") {
    return setStaffWorkingHours(request, env, hoursMatch[1]);
  }

  const capabilityMatch = path.match(/^\/api\/staff\/booking\/services\/([^/]+)\/staff$/);
  if (capabilityMatch && method === "GET") {
    return getServiceStaffCapabilities(request, env, capabilityMatch[1]);
  }
  if (capabilityMatch && method === "PUT") {
    return setServiceStaffCapabilities(request, env, capabilityMatch[1]);
  }

  if (path === "/api/staff/booking/appointments" && method === "GET") {
    return listAppointments(request, env, url);
  }

  const approveMatch = path.match(/^\/api\/staff\/booking\/appointments\/([^/]+)\/approve$/);
  if (approveMatch && method === "PATCH") {
    return approveAppointment(request, env, approveMatch[1]);
  }

  const cancelMatch = path.match(/^\/api\/staff\/booking\/appointments\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "PATCH") {
    return cancelAppointment(request, env, cancelMatch[1]);
  }

  const rescheduleMatch = path.match(/^\/api\/staff\/booking\/appointments\/([^/]+)\/reschedule$/);
  if (rescheduleMatch && method === "PATCH") {
    return rescheduleAppointment(request, env, rescheduleMatch[1]);
  }

  const completeMatch = path.match(/^\/api\/staff\/booking\/appointments\/([^/]+)\/complete$/);
  if (completeMatch && method === "PATCH") {
    return markCompleted(request, env, completeMatch[1]);
  }

  const noShowMatch = path.match(/^\/api\/staff\/booking\/appointments\/([^/]+)\/no-show$/);
  if (noShowMatch && method === "PATCH") {
    return markNoShow(request, env, noShowMatch[1]);
  }

  if (path === "/api/staff/booking/change-requests" && method === "GET") {
    return listChangeRequests(request, env, url);
  }

  const resolveChangeRequestMatch = path.match(/^\/api\/staff\/booking\/change-requests\/([^/]+)\/resolve$/);
  if (resolveChangeRequestMatch && method === "PATCH") {
    return resolveChangeRequest(request, env, resolveChangeRequestMatch[1]);
  }

  if (path === "/api/staff/checkout" && method === "POST") return checkout(request, env);
  if (path === "/api/staff/calendar" && method === "GET") return getCalendar(request, env, url);
  if (path === "/api/staff/calendar/appointments" && method === "POST") return staffCreateAppointments(request, env);
  if (path === "/api/staff/calendar/blocks" && method === "POST") return createTimeBlock(request, env);
  const timeBlockMatch = path.match(/^\/api\/staff\/calendar\/blocks\/([^/]+)$/);
  if (timeBlockMatch && method === "DELETE") return deleteTimeBlock(request, env, timeBlockMatch[1]);
  if (path === "/api/staff/clients" && method === "GET") return searchClients(request, env, url);
  if (path === "/api/staff/clients" && method === "POST") return staffCreateClient(request, env);

  const clientRecordMatch = path.match(/^\/api\/staff\/clients\/([^/]+)$/);
  if (clientRecordMatch && method === "PATCH") return staffUpdateClient(request, env, clientRecordMatch[1]);
  if (clientRecordMatch && method === "GET") {
    return getClientRecord(request, env, clientRecordMatch[1]);
  }

  if (path === "/api/staff/booking/revenue-summary" && method === "GET") {
    return getRevenueSummary(request, env, url);
  }

  if (path === "/api/staff/admin/locations" && method === "GET") return listLocations(request, env);
  if (path === "/api/staff/admin/locations" && method === "POST") return createLocation(request, env);
  const locationMatch = path.match(/^\/api\/staff\/admin\/locations\/([^/]+)$/);
  if (locationMatch && method === "PATCH") return updateLocation(request, env, locationMatch[1]);
  const locationHoursMatch = path.match(/^\/api\/staff\/admin\/locations\/([^/]+)\/hours$/);
  if (locationHoursMatch && method === "PUT") return setLocationHours(request, env, locationHoursMatch[1]);

  if (path === "/api/staff/admin/settings" && method === "GET") return getBookingSettings(request, env);
  if (path === "/api/staff/admin/settings" && method === "PUT") return updateBookingSettings(request, env);

  const staffServicesMatch = path.match(/^\/api\/staff\/admin\/staff-members\/([^/]+)\/services$/);
  if (staffServicesMatch && method === "GET") return getStaffServices(request, env, staffServicesMatch[1]);
  if (staffServicesMatch && method === "PUT") return setStaffServices(request, env, staffServicesMatch[1]);

  if (path === "/api/staff/admin/service-staff" && method === "GET") return listServiceStaffLinks(request, env);
  if (path === "/api/staff/admin/rota" && method === "GET") return getRota(request, env);
  if (path === "/api/staff/admin/rota-exceptions" && method === "GET") return listRotaExceptions(request, env, url);
  if (path === "/api/staff/admin/rota-exceptions" && method === "POST") return createRotaExceptions(request, env);
  const rotaExceptionMatch = path.match(/^\/api\/staff\/admin\/rota-exceptions\/([^/]+)$/);
  if (rotaExceptionMatch && method === "DELETE") return deleteRotaException(request, env, rotaExceptionMatch[1]);

  if (path === "/api/staff/permissions" && method === "GET") {
    return listStaffPermissions(request, env);
  }

  const permissionsMatch = path.match(/^\/api\/staff\/permissions\/([^/]+)$/);
  if (permissionsMatch && method === "PUT") {
    return setStaffPermissions(request, env, permissionsMatch[1]);
  }

  return errorResponse("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
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
