import { supabase } from "./supabaseClient";
import type { ConsultationSubmission } from "@shared/types";

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

export function submitConsultation(payload: ConsultationSubmission) {
  return request("/api/consultations", { method: "POST", body: JSON.stringify(payload) }) as Promise<{
    consultation_id: string;
    access_token: string;
    status: string;
  }>;
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
