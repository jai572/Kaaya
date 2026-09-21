import type { Env } from "../env";
import { createMockSquareClient } from "./square.fixtures";

// Square is the sole source of truth for services, prices, durations,
// availability, team members, customers and bookings — this module is the
// only place that talks to Square's API, and it is never imported from
// src/ (the access token must never reach the client bundle).

export interface SquareBookableVariation {
  squareItemId: string;
  squareVariationId: string;
  serviceName: string;
  variationName: string;
  priceAmount: number | null; // minor units (e.g. pence), null if variable pricing
  priceCurrency: string | null; // e.g. "GBP"
  durationMinutes: number | null;
  version: number; // service_variation_version, required by CreateBooking
  teamMemberIds: string[];
}

export interface SquareTeamMember {
  id: string;
  displayName: string;
}

export interface SquareAvailabilitySlot {
  startAt: string; // ISO 8601
  locationId: string;
  teamMemberId: string;
  serviceVariationId: string;
  serviceVariationVersion: number;
  durationMinutes: number;
}

export interface SquareCustomer {
  id: string;
  givenName: string;
  familyName: string;
  emailAddress: string;
  phoneNumber: string | null;
}

export interface SquareBooking {
  id: string;
  status: string;
  startAt: string;
}

export interface SquareClient {
  listBookableServices(): Promise<SquareBookableVariation[]>;
  listTeamMembers(serviceVariationId?: string): Promise<SquareTeamMember[]>;
  searchAvailability(params: {
    serviceVariationId: string;
    date: string; // YYYY-MM-DD, local salon date
    teamMemberId?: string; // omitted = "any available"
  }): Promise<SquareAvailabilitySlot[]>;
  searchCustomerByEmail(email: string): Promise<SquareCustomer | null>;
  createCustomer(input: {
    givenName: string;
    familyName: string;
    emailAddress: string;
    phoneNumber: string;
  }): Promise<SquareCustomer>;
  createBooking(input: {
    startAt: string;
    customerId: string;
    teamMemberId: string;
    serviceVariationId: string;
    serviceVariationVersion: number;
    durationMinutes: number;
    idempotencyKey: string;
  }): Promise<SquareBooking>;
  getServiceVariation(variationId: string): Promise<SquareBookableVariation>;
}

export class SquareApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Dated per Square's versioned REST API — re-confirm against Square's
// changelog whenever real credentials are (re)wired in, since Square
// deprecates old versions over time.
const SQUARE_VERSION = "2026-09-16";

function baseUrl(env: Env): string {
  return env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

async function squareFetch(env: Env, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${baseUrl(env)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.errors?.[0]?.detail ?? `Square API error (${res.status})`;
    throw new SquareApiError(message, res.status);
  }
  return body;
}

function toVariation(item: any, variation: any): SquareBookableVariation {
  const data = variation.item_variation_data ?? {};
  const priceMoney = data.price_money;
  return {
    squareItemId: item.id,
    squareVariationId: variation.id,
    serviceName: item.item_data?.name ?? "",
    variationName: data.name ?? "",
    priceAmount: priceMoney?.amount ?? null,
    priceCurrency: priceMoney?.currency ?? null,
    durationMinutes: data.service_duration ? Math.round(data.service_duration / 60000) : null,
    version: variation.version,
    teamMemberIds: data.team_member_ids ?? [],
  };
}

async function listBookableServices(env: Env): Promise<SquareBookableVariation[]> {
  const body = await squareFetch(env, "/v2/catalog/search-catalog-items", {
    method: "POST",
    body: JSON.stringify({ product_types: ["APPOINTMENTS_SERVICE"] }),
  });
  const items: any[] = body.items ?? [];
  const variations: SquareBookableVariation[] = [];
  for (const item of items) {
    for (const variation of item.item_data?.variations ?? []) {
      variations.push(toVariation(item, variation));
    }
  }
  return variations;
}

async function getServiceVariation(env: Env, variationId: string): Promise<SquareBookableVariation> {
  const body = await squareFetch(env, `/v2/catalog/object/${variationId}`, { method: "GET" });
  const variation = body.object;
  const itemId = variation.item_variation_data?.item_id;
  const itemBody = itemId ? await squareFetch(env, `/v2/catalog/object/${itemId}`, { method: "GET" }) : null;
  return toVariation(itemBody?.object ?? { id: itemId, item_data: {} }, variation);
}

async function listTeamMembers(env: Env, serviceVariationId?: string): Promise<SquareTeamMember[]> {
  const body = await squareFetch(env, "/v2/bookings/team-member-booking-profiles?bookable_only=true", {
    method: "GET",
  });
  const profiles: any[] = body.team_member_booking_profiles ?? [];

  let allowed: Set<string> | null = null;
  if (serviceVariationId) {
    const variation = await getServiceVariation(env, serviceVariationId);
    allowed = new Set(variation.teamMemberIds);
  }

  return profiles
    .filter((p) => !allowed || allowed.has(p.team_member_id))
    .map((p) => ({ id: p.team_member_id, displayName: p.display_name }));
}

async function searchAvailability(
  env: Env,
  params: { serviceVariationId: string; date: string; teamMemberId?: string }
): Promise<SquareAvailabilitySlot[]> {
  const segmentFilter: Record<string, unknown> = { service_variation_id: params.serviceVariationId };
  if (params.teamMemberId) {
    segmentFilter.team_member_id_filter = { any: [params.teamMemberId] };
  }

  const body = await squareFetch(env, "/v2/bookings/availability/search", {
    method: "POST",
    body: JSON.stringify({
      query: {
        filter: {
          start_at_range: { start_at: `${params.date}T00:00:00Z`, end_at: `${params.date}T23:59:59Z` },
          location_id: env.SQUARE_LOCATION_ID,
          segment_filters: [segmentFilter],
        },
      },
    }),
  });

  const availabilities: any[] = body.availabilities ?? [];
  const slots: SquareAvailabilitySlot[] = [];
  for (const availability of availabilities) {
    for (const segment of availability.appointment_segments ?? []) {
      slots.push({
        startAt: availability.start_at,
        locationId: availability.location_id,
        teamMemberId: segment.team_member_id,
        serviceVariationId: segment.service_variation_id,
        serviceVariationVersion: segment.service_variation_version,
        durationMinutes: segment.duration_minutes,
      });
    }
  }
  return slots;
}

async function searchCustomerByEmail(env: Env, email: string): Promise<SquareCustomer | null> {
  const body = await squareFetch(env, "/v2/customers/search", {
    method: "POST",
    body: JSON.stringify({ query: { filter: { email_address: { exact: email } } } }),
  });
  const customers: any[] = body.customers ?? [];
  if (customers.length === 0) return null;
  const c = customers[0];
  return {
    id: c.id,
    givenName: c.given_name ?? "",
    familyName: c.family_name ?? "",
    emailAddress: c.email_address ?? email,
    phoneNumber: c.phone_number ?? null,
  };
}

async function createCustomer(
  env: Env,
  input: { givenName: string; familyName: string; emailAddress: string; phoneNumber: string }
): Promise<SquareCustomer> {
  const body = await squareFetch(env, "/v2/customers", {
    method: "POST",
    body: JSON.stringify({
      given_name: input.givenName,
      family_name: input.familyName,
      email_address: input.emailAddress,
      phone_number: input.phoneNumber,
    }),
  });
  const c = body.customer;
  return {
    id: c.id,
    givenName: c.given_name ?? "",
    familyName: c.family_name ?? "",
    emailAddress: c.email_address ?? input.emailAddress,
    phoneNumber: c.phone_number ?? null,
  };
}

async function createBooking(
  env: Env,
  input: {
    startAt: string;
    customerId: string;
    teamMemberId: string;
    serviceVariationId: string;
    serviceVariationVersion: number;
    durationMinutes: number;
    idempotencyKey: string;
  }
): Promise<SquareBooking> {
  const body = await squareFetch(env, "/v2/bookings", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey,
      booking: {
        location_id: env.SQUARE_LOCATION_ID,
        start_at: input.startAt,
        customer_id: input.customerId,
        appointment_segments: [
          {
            team_member_id: input.teamMemberId,
            service_variation_id: input.serviceVariationId,
            service_variation_version: input.serviceVariationVersion,
            duration_minutes: input.durationMinutes,
          },
        ],
      },
    }),
  });
  const b = body.booking;
  return { id: b.id, status: b.status, startAt: b.start_at };
}

export function createSquareClient(env: Env): SquareClient {
  return {
    listBookableServices: () => listBookableServices(env),
    listTeamMembers: (serviceVariationId) => listTeamMembers(env, serviceVariationId),
    searchAvailability: (params) => searchAvailability(env, params),
    searchCustomerByEmail: (email) => searchCustomerByEmail(env, email),
    createCustomer: (input) => createCustomer(env, input),
    createBooking: (input) => createBooking(env, input),
    getServiceVariation: (variationId) => getServiceVariation(env, variationId),
  };
}

// Single entry point route handlers should use — swaps in the fixture-backed
// client under local-dev-only SQUARE_MOCK_MODE, real client otherwise.
export function getSquareClient(env: Env): SquareClient {
  if (env.SQUARE_MOCK_MODE === "true") return createMockSquareClient();
  return createSquareClient(env);
}
