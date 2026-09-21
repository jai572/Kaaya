import { supabase } from "./supabaseClient";
import type { ConsultationSubmission, FinalizeConsultationInput } from "@shared/types";

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body;
}

async function staffAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${token}` };
}

export function getTreatments() {
  return request("/api/treatments") as Promise<{
    treatments: {
      id: string;
      name: string;
      is_tint: boolean;
      is_eyelash: boolean;
      uses_adhesive: boolean;
      requires_patch_test: boolean;
    }[];
  }>;
}

export interface ClientFlag {
  id: string;
  rule_key: string;
  group_key: string | null;
  category: string | null;
  severity: "HIGH" | "MEDIUM" | "INFORMATION";
  title: string;
  client_answer_summary: string;
  explanation: string;
  staff_action: string;
  treatment_ids: string[];
}

// Phase 1: submits answers/treatments, returns the flags the client must
// review before they can sign. Does not finalize anything.
export function submitConsultation(payload: ConsultationSubmission) {
  return request("/api/consultations", { method: "POST", body: JSON.stringify(payload) }) as Promise<{
    consultation_id: string;
    access_token: string;
    status: string;
    flags: ClientFlag[];
    treatments: { id: string; name: string }[];
  }>;
}

// Phase 2: acknowledgement + decision + signature. Locks the consultation.
export function finalizeConsultation(id: string, token: string, payload: FinalizeConsultationInput) {
  return request(`/api/consultations/${id}/finalize?token=${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{ consultation_id: string; status: string; locked: true }>;
}

export function getClientConsultation(id: string, token: string) {
  return request(`/api/consultations/${id}?token=${encodeURIComponent(token)}`);
}

export async function staffListConsultations() {
  const headers = await staffAuthHeader();
  return request("/api/staff/consultations", { headers });
}

export async function staffGetConsultation(id: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/consultations/${id}`, { headers });
}

export async function staffRecordReview(id: string, decision: string, confirmed: true, notes?: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/consultations/${id}/review`, {
    method: "POST",
    headers,
    body: JSON.stringify({ decision, confirmed, notes }),
  });
}

// Booking flow — Square is the source of truth for all of this; nothing
// here is hard-coded, it's whatever the Worker's Square API calls return.
export interface BookableService {
  squareItemId: string;
  squareVariationId: string;
  serviceName: string;
  variationName: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  durationMinutes: number | null;
  version: number;
  teamMemberIds: string[];
  mapping: { treatment_id: string } | null;
}

export interface TeamMember {
  id: string;
  displayName: string;
}

export interface AvailabilitySlot {
  startAt: string;
  locationId: string;
  teamMemberId: string;
  serviceVariationId: string;
  serviceVariationVersion: number;
  durationMinutes: number;
}

export function getBookableServices() {
  return request("/api/booking/services") as Promise<{ services: BookableService[] }>;
}

export function getBookingTeamMembers(serviceVariationId: string) {
  return request(`/api/booking/team-members?service_variation_id=${encodeURIComponent(serviceVariationId)}`) as Promise<{
    teamMembers: TeamMember[];
  }>;
}

export function getAvailability(serviceVariationId: string, date: string, teamMemberId?: string) {
  const params = new URLSearchParams({ service_variation_id: serviceVariationId, date });
  if (teamMemberId) params.set("team_member_id", teamMemberId);
  return request(`/api/booking/availability?${params.toString()}`) as Promise<{ slots: AvailabilitySlot[] }>;
}

export interface BookingContact {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export function lookupOrCreateBookingCustomer(contact: BookingContact) {
  return request("/api/booking/customers", {
    method: "POST",
    body: JSON.stringify({ contact }),
  }) as Promise<{ client_id: string; square_customer_id: string }>;
}

export interface AppointmentSummary {
  service_name: string;
  variation_name: string;
  duration_minutes: number | null;
  price_amount: number | null;
  price_currency: string | null;
  start_at: string;
}

export function createBookingAppointment(input: {
  client_id: string;
  square_customer_id: string;
  square_service_id: string;
  square_service_variation_id: string;
  team_member_id: string;
  start_at: string;
}) {
  return request("/api/booking/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ appointment_id: string; square_booking_id: string; summary: AppointmentSummary }>;
}

export function linkAppointmentToConsultation(appointmentId: string, consultationId: string, squareBookingId: string) {
  return request(`/api/booking/appointments/${appointmentId}/consultation`, {
    method: "PATCH",
    body: JSON.stringify({ consultation_id: consultationId, square_booking_id: squareBookingId }),
  }) as Promise<{ linked: true }>;
}

export async function staffListBookingServices() {
  const headers = await staffAuthHeader();
  return request("/api/staff/booking/services", { headers }) as Promise<{
    services: BookableService[];
    treatments: {
      id: string;
      name: string;
      is_tint: boolean;
      is_eyelash: boolean;
      uses_adhesive: boolean;
      requires_patch_test: boolean;
    }[];
  }>;
}

export interface ServiceMappingInput {
  square_item_id: string;
  square_variation_id: string;
  treatment_id: string;
  tint_product_type?: "hair_dye" | "other" | null;
  eyelash_safe?: boolean | null;
  notes?: string;
}

export async function staffCreateServiceMapping(input: ServiceMappingInput) {
  const headers = await staffAuthHeader();
  return request("/api/staff/booking/mappings", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{
    id: string;
  }>;
}

export async function staffUpdateServiceMapping(id: string, input: Partial<ServiceMappingInput> & { active?: boolean }) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/mappings/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(input),
  }) as Promise<{ updated: true }>;
}
