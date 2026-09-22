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

// Booking flow — Kaaya (Supabase) is the source of truth for all of this now.
export interface BookableService {
  id: string;
  name: string;
  category_slug: string;
  treatment_id: string | null;
  tint_product_type: "hair_dye" | "other" | null;
  eyelash_safe: boolean | null;
  price_amount: number;
  price_currency: string;
  price_is_from: boolean;
  duration_minutes: number | null;
  display_order: number;
}

export interface StaffMember {
  id: string;
  display_name: string;
}

export interface AvailabilitySlot {
  staffMemberId: string;
  staffMemberName: string;
  startAt: string;
  endAt: string;
}

export function getBookableServices() {
  return request("/api/booking/services") as Promise<{ services: BookableService[] }>;
}

export function getBookingStaff(serviceId: string) {
  return request(`/api/booking/staff?service_id=${encodeURIComponent(serviceId)}`) as Promise<{ staff: StaffMember[] }>;
}

export function getAvailability(serviceId: string, date: string, staffMemberId?: string) {
  const params = new URLSearchParams({ service_id: serviceId, date });
  if (staffMemberId) params.set("staff_member_id", staffMemberId);
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
  }) as Promise<{ client_id: string }>;
}

export interface AppointmentSummary {
  service_name: string;
  duration_minutes: number;
  price_amount: number;
  price_currency: string;
  start_at: string;
}

export function createBookingAppointment(input: {
  client_id: string;
  service_id: string;
  staff_member_id: string;
  start_at: string;
}) {
  return request("/api/booking/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ appointment_id: string; booking_reference: string; summary: AppointmentSummary }>;
}

export function linkAppointmentToConsultation(appointmentId: string, consultationId: string, bookingReference: string) {
  return request(`/api/booking/appointments/${appointmentId}/consultation`, {
    method: "PATCH",
    body: JSON.stringify({ consultation_id: consultationId, booking_reference: bookingReference }),
  }) as Promise<{ linked: true }>;
}

// ---- Staff management (services, staff members, hours, capability) ----

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

export interface ServiceInput {
  name: string;
  category_slug: string;
  treatment_id?: string | null;
  tint_product_type?: "hair_dye" | "other" | null;
  eyelash_safe?: boolean | null;
  price_amount: number;
  price_currency?: string;
  price_is_from?: boolean;
  duration_minutes?: number | null;
  display_order?: number;
  notes?: string;
}

export async function staffCreateService(input: ServiceInput) {
  const headers = await staffAuthHeader();
  return request("/api/staff/booking/services", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{
    id: string;
  }>;
}

export async function staffUpdateService(id: string, input: Partial<ServiceInput> & { active?: boolean }) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/services/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(input),
  }) as Promise<{ updated: true }>;
}

export interface StaffMemberRow {
  id: string;
  staff_profile_id: string | null;
  display_name: string;
  active: boolean;
}

export async function staffListStaffMembers() {
  const headers = await staffAuthHeader();
  return request("/api/staff/booking/staff-members", { headers }) as Promise<{ staffMembers: StaffMemberRow[] }>;
}

export async function staffCreateStaffMember(input: { staff_profile_id?: string | null; display_name: string }) {
  const headers = await staffAuthHeader();
  return request("/api/staff/booking/staff-members", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{
    id: string;
  }>;
}

export async function staffUpdateStaffMember(
  id: string,
  input: Partial<{ staff_profile_id: string | null; display_name: string; active: boolean }>
) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/staff-members/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(input),
  }) as Promise<{ updated: true }>;
}

export interface WorkingHoursBlock {
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
}

export async function staffGetStaffWorkingHours(staffMemberId: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/staff-members/${staffMemberId}/hours`, { headers }) as Promise<{
    hours: { day_of_week: number; start_time: string; end_time: string }[];
  }>;
}

export async function staffSetStaffWorkingHours(staffMemberId: string, blocks: WorkingHoursBlock[]) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/staff-members/${staffMemberId}/hours`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ blocks }),
  }) as Promise<{ updated: true }>;
}

export async function staffGetServiceStaffCapabilities(serviceId: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/services/${serviceId}/staff`, { headers }) as Promise<{ staffMemberIds: string[] }>;
}

export async function staffSetServiceStaffCapabilities(serviceId: string, staffMemberIds: string[]) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/services/${serviceId}/staff`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ staff_member_ids: staffMemberIds }),
  }) as Promise<{ updated: true }>;
}

export interface StaffAppointmentRow {
  id: string;
  client_id: string;
  service_id: string;
  staff_member_id: string;
  service_name: string;
  duration_minutes: number;
  price_amount: number;
  price_currency: string;
  status: string;
  scheduled_at: string;
  end_at: string;
}

export async function staffListAppointments(date?: string) {
  const headers = await staffAuthHeader();
  const params = date ? `?date=${encodeURIComponent(date)}` : "";
  return request(`/api/staff/booking/appointments${params}`, { headers }) as Promise<{
    appointments: StaffAppointmentRow[];
  }>;
}

export async function staffCancelAppointment(id: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/appointments/${id}/cancel`, { method: "PATCH", headers }) as Promise<{
    cancelled: true;
  }>;
}

export async function staffGetRevenueSummary(date?: string) {
  const headers = await staffAuthHeader();
  const params = date ? `?date=${encodeURIComponent(date)}` : "";
  return request(`/api/staff/booking/revenue-summary${params}`, { headers }) as Promise<{
    date: string;
    total_amount: number;
    currency: string;
    appointment_count: number;
  }>;
}

// ---- Owner-only: per-staff-login feature overrides ----

export interface StaffProfileRow {
  id: string;
  full_name: string;
  role: "staff" | "admin" | "owner";
  active: boolean;
}

export type FeatureKey =
  | "manage_services"
  | "manage_staff_members"
  | "manage_service_capability"
  | "view_all_bookings"
  | "manage_all_bookings"
  | "view_revenue";

export async function staffListPermissions() {
  const headers = await staffAuthHeader();
  return request("/api/staff/permissions", { headers }) as Promise<{
    staffProfiles: StaffProfileRow[];
    overrides: { staff_profile_id: string; feature_key: FeatureKey; granted: boolean }[];
    featureKeys: FeatureKey[];
  }>;
}

export async function staffSetPermissions(
  staffProfileId: string,
  overrides: { feature_key: FeatureKey; granted: boolean | null }[]
) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/permissions/${staffProfileId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ overrides }),
  }) as Promise<{ updated: true }>;
}
