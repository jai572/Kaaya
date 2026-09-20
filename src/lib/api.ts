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
