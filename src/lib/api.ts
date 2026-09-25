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
  booking_mode?: BookingMode;
  active?: boolean;
}

export type BookingMode = "both" | "bookable_only" | "walk_in_only";

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

export interface PublicLocation {
  id: string;
  name: string;
  phone: string | null;
  hours: { day_of_week: number; open_time: string; close_time: string }[];
}

export function getBookingLocations() {
  return request("/api/booking/locations") as Promise<{ locations: PublicLocation[]; booking_window_days: number }>;
}

export function getAvailability(serviceId: string, locationId: string, date: string, staffMemberId?: string) {
  const params = new URLSearchParams({ service_id: serviceId, location_id: locationId, date });
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
  location_name?: string | null;
}

export function createBookingAppointment(input: {
  client_id: string;
  service_id: string;
  staff_member_id: string;
  location_id: string;
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

// ---- Client self-service: cancel/reschedule by booking reference (no login) ----

export type AppointmentStatus = "pending_approval" | "confirmed" | "completed" | "no_show" | "cancelled" | "rescheduled";

export interface AppointmentLookup {
  id: string;
  status: AppointmentStatus;
  service_id: string;
  service_name: string;
  scheduled_at: string;
  end_at: string;
  duration_minutes: number;
  price_amount: number;
  price_currency: string;
  staff_member_id: string;
  rescheduled_to_id: string | null;
  location_id: string | null;
  location_name: string | null;
}

export function getAppointmentByReference(appointmentId: string, bookingReference: string) {
  const params = new URLSearchParams({ booking_reference: bookingReference });
  return request(`/api/booking/appointments/${appointmentId}?${params.toString()}`) as Promise<{
    appointment: AppointmentLookup;
    resolved_from_original: boolean;
    can_self_service: boolean;
    can_self_service_immediately: boolean;
  }>;
}

export function clientCancelAppointment(appointmentId: string, bookingReference: string, reason?: string) {
  return request(`/api/booking/appointments/${appointmentId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ booking_reference: bookingReference, reason }),
  }) as Promise<{ status: "cancelled" | "pending_staff_approval" }>;
}

export function clientRequestReschedule(
  appointmentId: string,
  bookingReference: string,
  newStartAt: string,
  newStaffMemberId?: string
) {
  return request(`/api/booking/appointments/${appointmentId}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ booking_reference: bookingReference, new_start_at: newStartAt, new_staff_member_id: newStaffMemberId }),
  }) as Promise<{ status: "rescheduled" | "pending_staff_approval"; new_appointment_id?: string }>;
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
  booking_mode?: BookingMode;
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
  colour: string | null;
}

export async function staffListStaffMembers() {
  const headers = await staffAuthHeader();
  return request("/api/staff/booking/staff-members", { headers }) as Promise<{ staffMembers: StaffMemberRow[] }>;
}

export async function staffCreateStaffMember(input: { staff_profile_id?: string | null; display_name: string; colour?: string | null }) {
  const headers = await staffAuthHeader();
  return request("/api/staff/booking/staff-members", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{
    id: string;
  }>;
}

export async function staffUpdateStaffMember(
  id: string,
  input: Partial<{ staff_profile_id: string | null; display_name: string; active: boolean; colour: string | null }>
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
  location_id: string | null;
}

export async function staffGetStaffWorkingHours(staffMemberId: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/staff-members/${staffMemberId}/hours`, { headers }) as Promise<{
    hours: { day_of_week: number; start_time: string; end_time: string; location_id: string | null }[];
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
  status: AppointmentStatus;
  scheduled_at: string;
  end_at: string;
  rescheduled_to_id: string | null;
  location_id: string | null;
}

export async function staffListAppointments(date?: string, status?: AppointmentStatus) {
  const headers = await staffAuthHeader();
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (status) params.set("status", status);
  const query = params.toString();
  return request(`/api/staff/booking/appointments${query ? `?${query}` : ""}`, { headers }) as Promise<{
    appointments: StaffAppointmentRow[];
  }>;
}

export async function staffApproveAppointment(id: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/appointments/${id}/approve`, { method: "PATCH", headers }) as Promise<{
    status: "confirmed";
  }>;
}

export async function staffCancelAppointment(id: string, reason?: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/appointments/${id}/cancel`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ reason }),
  }) as Promise<{ status: "cancelled" }>;
}

export async function staffRescheduleAppointment(id: string, newStartAt: string, newStaffMemberId?: string, allowOverlap?: boolean) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/appointments/${id}/reschedule`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ new_start_at: newStartAt, new_staff_member_id: newStaffMemberId, allow_overlap: allowOverlap }),
  }) as Promise<{ status: "rescheduled"; new_appointment_id: string; needs_confirmation?: undefined } | { needs_confirmation: true; warnings: string[] }>;
}

export async function staffMarkCompleted(id: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/appointments/${id}/complete`, { method: "PATCH", headers }) as Promise<{
    status: "completed";
  }>;
}

export async function staffMarkNoShow(id: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/appointments/${id}/no-show`, { method: "PATCH", headers }) as Promise<{
    status: "no_show";
  }>;
}

export interface ChangeRequestRow {
  id: string;
  appointment_id: string;
  request_type: "cancel" | "reschedule";
  requested_start_at: string | null;
  requested_staff_member_id: string | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  appointments: {
    id: string;
    client_id: string;
    service_name: string;
    scheduled_at: string;
    end_at: string;
    status: AppointmentStatus;
  } | null;
}

export async function staffListChangeRequests(status: "pending" | "approved" | "rejected" = "pending") {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/change-requests?status=${encodeURIComponent(status)}`, { headers }) as Promise<{
    changeRequests: ChangeRequestRow[];
  }>;
}

export async function staffResolveChangeRequest(id: string, decision: "approve" | "reject") {
  const headers = await staffAuthHeader();
  return request(`/api/staff/booking/change-requests/${id}/resolve`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ decision }),
  }) as Promise<{ resolved: "approve" | "reject" }>;
}

export interface ClientRecord {
  client: { id: string; first_name: string; last_name: string; email: string | null; phone: string };
  appointments: StaffAppointmentRow[];
  consultations: { id: string; status: string; submitted_at: string | null; created_at: string }[];
}

export async function staffGetClientRecord(clientId: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/clients/${clientId}`, { headers }) as Promise<ClientRecord>;
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
  | "view_revenue"
  | "manage_locations";

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

// ---- Admin: locations, booking settings, rota ----

export interface LocationHours {
  day_of_week: number;
  open_time: string;
  close_time: string;
}

export interface LocationRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  display_order: number;
  hours: LocationHours[];
}

export async function staffListLocations() {
  const headers = await staffAuthHeader();
  return request("/api/staff/admin/locations", { headers }) as Promise<{ locations: LocationRow[] }>;
}

export async function staffCreateLocation(input: { name: string; phone?: string | null; email?: string | null }) {
  const headers = await staffAuthHeader();
  return request("/api/staff/admin/locations", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{
    id: string;
  }>;
}

export async function staffUpdateLocation(
  id: string,
  input: Partial<{ name: string; phone: string | null; email: string | null; active: boolean }>
) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/admin/locations/${id}`, { method: "PATCH", headers, body: JSON.stringify(input) }) as Promise<{
    updated: true;
  }>;
}

export async function staffSetLocationHours(
  id: string,
  days: { day_of_week: number; open_time: string | null; close_time: string | null }[]
) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/admin/locations/${id}/hours`, { method: "PUT", headers, body: JSON.stringify({ days }) }) as Promise<{
    updated: true;
  }>;
}

export async function staffGetBookingSettings() {
  const headers = await staffAuthHeader();
  return request("/api/staff/admin/settings", { headers }) as Promise<{ client_booking_window_days: number }>;
}

export async function staffUpdateBookingSettings(input: { client_booking_window_days: number }) {
  const headers = await staffAuthHeader();
  return request("/api/staff/admin/settings", { method: "PUT", headers, body: JSON.stringify(input) }) as Promise<{
    updated: true;
  }>;
}

export async function staffGetStaffServices(staffMemberId: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/admin/staff-members/${staffMemberId}/services`, { headers }) as Promise<{ serviceIds: string[] }>;
}

export async function staffSetStaffServices(staffMemberId: string, serviceIds: string[]) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/admin/staff-members/${staffMemberId}/services`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ service_ids: serviceIds }),
  }) as Promise<{ updated: true }>;
}

export interface RotaHoursRow {
  staff_member_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location_id: string | null;
}

export async function staffGetRota() {
  const headers = await staffAuthHeader();
  return request("/api/staff/admin/rota", { headers }) as Promise<{ hours: RotaHoursRow[] }>;
}

export interface RotaExceptionRow {
  id: string;
  staff_member_id: string;
  date: string;
  kind: "off" | "working";
  location_id: string | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
  affected_bookings: number;
}

export async function staffListRotaExceptions(from?: string) {
  const headers = await staffAuthHeader();
  const qs = from ? `?from=${encodeURIComponent(from)}` : "";
  return request(`/api/staff/admin/rota-exceptions${qs}`, { headers }) as Promise<{ exceptions: RotaExceptionRow[] }>;
}

export async function staffCreateRotaException(input: {
  staff_member_id: string;
  from_date: string;
  to_date: string;
  kind: "off" | "working";
  location_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
}) {
  const headers = await staffAuthHeader();
  return request("/api/staff/admin/rota-exceptions", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{
    saved: number;
    affected_bookings: number;
  }>;
}

export async function staffDeleteRotaException(id: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/admin/rota-exceptions/${id}`, { method: "DELETE", headers }) as Promise<{ deleted: true }>;
}

export async function staffListServiceStaffLinks() {
  const headers = await staffAuthHeader();
  return request("/api/staff/admin/service-staff", { headers }) as Promise<{
    links: { service_id: string; staff_member_id: string }[];
  }>;
}

// ---- Calendar (phase 4) ----

export interface CalendarItem {
  id: string;
  service_id: string | null;
  service_name: string;
  duration_minutes: number;
  price_amount: number;
  staff_member_id: string | null;
}

export interface CalendarAppointment {
  id: string;
  client_id: string;
  staff_member_id: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  price_amount: number;
  price_currency: string;
  status: AppointmentStatus;
  scheduled_at: string;
  end_at: string;
  visit_id: string | null;
  booking_source: string;
  consultation_id: string | null;
  patch_test: boolean;
  allow_overlap: boolean;
  sale_id: string | null;
  sale: { total_amount: number; payment_method: PaymentMethod; payment_note: string | null } | null;
  clients: { first_name: string; last_name: string; phone: string; email: string | null } | null;
  appointment_items: CalendarItem[];
}

export type BlockReason = "break" | "lunch" | "personal" | "training" | "other";

export interface CalendarBlock {
  id: string;
  staff_member_id: string;
  start_at: string;
  end_at: string;
  reason: BlockReason;
  note: string | null;
}

export interface CalendarShift {
  startTime: string;
  endTime: string;
}

export interface CalendarData {
  location: { id: string; name: string; active: boolean; hours: { day_of_week: number; open_time: string; close_time: string }[] };
  dates: string[];
  own_staff_member_id: string | null;
  can_view_all: boolean;
  staff: { id: string; display_name: string; colour: string | null; active: boolean }[];
  shifts: Record<string, Record<string, CalendarShift | null>>;
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
}

export async function staffGetCalendar(locationId: string, from: string, to: string) {
  const headers = await staffAuthHeader();
  const params = new URLSearchParams({ location_id: locationId, from, to });
  return request(`/api/staff/calendar?${params.toString()}`, { headers }) as Promise<CalendarData>;
}

export interface StaffBookingPart {
  staff_member_id: string;
  start_at: string;
  service_ids: string[];
}

export async function staffCreateCalendarAppointments(input: {
  client_id: string;
  location_id: string;
  link_appointment_id?: string | null;
  confirm_warnings?: boolean;
  parts: StaffBookingPart[];
}) {
  const headers = await staffAuthHeader();
  return request("/api/staff/calendar/appointments", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<
    { needs_confirmation: true; warnings: string[] } | { needs_confirmation?: undefined; appointment_ids: string[]; visit_id: string | null }
  >;
}

export async function staffCreateTimeBlock(input: {
  staff_member_id: string;
  location_id: string;
  start_at: string;
  end_at: string;
  reason: BlockReason;
  note?: string | null;
}) {
  const headers = await staffAuthHeader();
  return request("/api/staff/calendar/blocks", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{ id: string }>;
}

export async function staffDeleteTimeBlock(id: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/calendar/blocks/${id}`, { method: "DELETE", headers }) as Promise<{ deleted: true }>;
}

export interface ClientSummary {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
}

export async function staffSearchClients(q: string) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/clients?q=${encodeURIComponent(q)}`, { headers }) as Promise<{ clients: ClientSummary[] }>;
}

export async function staffCreateClient(input: { first_name: string; last_name: string; phone: string; email?: string | null }) {
  const headers = await staffAuthHeader();
  return request("/api/staff/clients", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{
    client: ClientSummary;
    existing: boolean;
  }>;
}

export async function staffUpdateClient(id: string, input: { first_name: string; last_name: string; phone: string; email?: string | null }) {
  const headers = await staffAuthHeader();
  return request(`/api/staff/clients/${id}`, { method: "PATCH", headers, body: JSON.stringify(input) }) as Promise<{ client: ClientSummary }>;
}

export type PaymentMethod = "cash" | "card" | "voucher" | "other";

export interface CheckoutLine {
  service_id: string | null;
  appointment_id: string | null;
  staff_member_id: string | null;
  description: string;
  quantity: number;
  unit_price_amount: number;
}

export async function staffCheckout(input: {
  location_id: string;
  client_id: string | null;
  appointment_ids: string[];
  items: CheckoutLine[];
  discount_amount: number;
  payment_method: PaymentMethod;
  payment_note: string | null;
}) {
  const headers = await staffAuthHeader();
  return request("/api/staff/checkout", { method: "POST", headers, body: JSON.stringify(input) }) as Promise<{ sale_id: string; total_amount: number }>;
}
