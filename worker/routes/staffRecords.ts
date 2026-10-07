import { z } from "zod";
import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { requireCapability } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { withStaff } from "./staffBooking";
import { staffFileAlerts } from "../../shared/staffFiles";

// Staff personnel files: ID, right to work, contact details, CV and
// qualifications. Owner-only by default (view_staff_records); every view,
// download, upload and delete is written to the audit log.

const BUCKET = "staff-documents";
const RECORD_ROLES = ["owner"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const dateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date")
  .nullable()
  .or(z.literal("").transform(() => null));
const textOrNull = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .transform((v) => (v ? v : null));

const recordSchema = z.object({
  legal_name: textOrNull,
  date_of_birth: dateOrNull,
  phone: textOrNull,
  email: textOrNull,
  address: textOrNull,
  emergency_contact_name: textOrNull,
  emergency_contact_phone: textOrNull,
  beauty_experience_since: dateOrNull,
  right_to_work_type: z.enum(["british_irish_passport", "share_code", "visa_or_permit", "other"]).nullable(),
  right_to_work_checked_on: dateOrNull,
  right_to_work_expires_on: dateOrNull,
  notes: textOrNull,
});

const documentMetaSchema = z.object({
  kind: z.enum(["id", "right_to_work", "cv", "qualification", "other"]),
  label: z.string().trim().min(1, "Give the document a name").max(200),
  issued_on: dateOrNull,
  expires_on: dateOrNull,
});

async function audit(env: Env, actorId: string, event: string, metadata: Record<string, unknown>) {
  await recordAuditEvent(adminClient(env), { actor_id: actorId, actor_type: "staff", event_type: event, metadata });
}

export async function canViewStaffRecords(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    try {
      await requireCapability(env, staff, "view_staff_records", [...RECORD_ROLES]);
      return json({ allowed: true });
    } catch {
      return json({ allowed: false });
    }
  });
}

export async function listStaffFiles(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "view_staff_records", [...RECORD_ROLES]);
    const admin = adminClient(env);
    const [membersRes, recordsRes, docsRes] = await Promise.all([
      admin.from("staff_members").select("id, display_name, active").order("display_name"),
      admin.from("staff_records").select("*"),
      admin.from("staff_documents").select("staff_member_id, kind, expires_on"),
    ]);
    if (membersRes.error) return errorResponse(membersRes.error.message, 500);
    if (recordsRes.error) return errorResponse(recordsRes.error.message, 500);
    if (docsRes.error) return errorResponse(docsRes.error.message, 500);
    const today = new Date().toISOString().slice(0, 10);
    return json({
      staff: (membersRes.data ?? []).map((m) => {
        const record = (recordsRes.data ?? []).find((r) => r.staff_member_id === m.id) ?? null;
        const docs = (docsRes.data ?? []).filter((d) => d.staff_member_id === m.id);
        return {
          ...m,
          document_count: docs.length,
          alerts: staffFileAlerts(record, docs, today),
        };
      }),
    });
  });
}

export async function getStaffFile(request: Request, env: Env, staffMemberId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "view_staff_records", [...RECORD_ROLES]);
    const admin = adminClient(env);
    const [memberRes, recordRes, docsRes] = await Promise.all([
      admin.from("staff_members").select("id, display_name, active").eq("id", staffMemberId).maybeSingle(),
      admin.from("staff_records").select("*").eq("staff_member_id", staffMemberId).maybeSingle(),
      admin
        .from("staff_documents")
        .select("id, kind, label, issued_on, expires_on, file_name, content_type, size_bytes, uploaded_at")
        .eq("staff_member_id", staffMemberId)
        .order("uploaded_at", { ascending: false }),
    ]);
    if (memberRes.error) return errorResponse(memberRes.error.message, 500);
    if (!memberRes.data) return errorResponse("Staff member not found", 404);
    await audit(env, staff.id, "staff_file_viewed", { staff_member_id: staffMemberId });
    const today = new Date().toISOString().slice(0, 10);
    return json({
      member: memberRes.data,
      record: recordRes.data ?? null,
      documents: docsRes.data ?? [],
      alerts: staffFileAlerts(recordRes.data ?? null, docsRes.data ?? [], today),
    });
  });
}

export async function saveStaffFile(request: Request, env: Env, staffMemberId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "view_staff_records", [...RECORD_ROLES]);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = recordSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
    const admin = adminClient(env);
    const { data: member } = await admin.from("staff_members").select("id").eq("id", staffMemberId).maybeSingle();
    if (!member) return errorResponse("Staff member not found", 404);
    const { error } = await admin.from("staff_records").upsert({
      staff_member_id: staffMemberId,
      ...parsed.data,
      updated_at: new Date().toISOString(),
      updated_by: staff.id,
    });
    if (error) return errorResponse(error.message, 500);
    await audit(env, staff.id, "staff_file_updated", { staff_member_id: staffMemberId });
    return json({ ok: true });
  });
}

// multipart/form-data: file (optional for a qualification with no
// certificate yet), kind, label, issued_on, expires_on.
export async function uploadStaffDocument(request: Request, env: Env, staffMemberId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "view_staff_records", [...RECORD_ROLES]);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse("Expected a file upload");
    }
    const meta = documentMetaSchema.safeParse({
      kind: form.get("kind"),
      label: form.get("label"),
      issued_on: form.get("issued_on") ?? null,
      expires_on: form.get("expires_on") ?? null,
    });
    if (!meta.success) return errorResponse(meta.error.issues.map((i) => i.message).join("; "));

    const file = form.get("file");
    const admin = adminClient(env);
    const { data: member } = await admin.from("staff_members").select("id").eq("id", staffMemberId).maybeSingle();
    if (!member) return errorResponse("Staff member not found", 404);

    let stored: { storage_path: string; file_name: string; content_type: string; size_bytes: number } | null = null;
    if (file && typeof file !== "string") {
      if (file.size > MAX_FILE_BYTES) return errorResponse("File is too large (10MB max)");
      if (!ALLOWED_TYPES.has(file.type)) return errorResponse("Upload a PDF, photo or Word document");
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "document";
      const path = `${staffMemberId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
      if (uploadError) return errorResponse(uploadError.message, 500);
      stored = { storage_path: path, file_name: safeName, content_type: file.type, size_bytes: file.size };
    } else if (meta.data.kind !== "qualification") {
      return errorResponse("Choose a file to upload");
    }

    const { data: doc, error } = await admin
      .from("staff_documents")
      .insert({ staff_member_id: staffMemberId, ...meta.data, ...stored, uploaded_by: staff.id })
      .select("id")
      .single();
    if (error || !doc) {
      if (stored) await admin.storage.from(BUCKET).remove([stored.storage_path]);
      return errorResponse(error?.message ?? "Could not save the document", 500);
    }
    await audit(env, staff.id, "staff_document_uploaded", {
      staff_member_id: staffMemberId,
      document_id: doc.id,
      kind: meta.data.kind,
    });
    return json({ id: doc.id }, 201);
  });
}

export async function downloadStaffDocument(request: Request, env: Env, documentId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "view_staff_records", [...RECORD_ROLES]);
    const admin = adminClient(env);
    const { data: doc } = await admin
      .from("staff_documents")
      .select("id, staff_member_id, storage_path, file_name")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc || !doc.storage_path) return errorResponse("No file for this document", 404);
    // Short-lived link so a copied URL stops working almost immediately.
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60, { download: doc.file_name ?? true });
    if (error || !data) return errorResponse(error?.message ?? "Could not open the file", 500);
    await audit(env, staff.id, "staff_document_downloaded", {
      staff_member_id: doc.staff_member_id,
      document_id: doc.id,
    });
    return json({ url: data.signedUrl });
  });
}

export async function deleteStaffDocument(request: Request, env: Env, documentId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "view_staff_records", [...RECORD_ROLES]);
    const admin = adminClient(env);
    const { data: doc } = await admin
      .from("staff_documents")
      .select("id, staff_member_id, storage_path, kind")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc) return errorResponse("Document not found", 404);
    if (doc.storage_path) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove([doc.storage_path]);
      if (removeError) return errorResponse(removeError.message, 500);
    }
    const { error } = await admin.from("staff_documents").delete().eq("id", documentId);
    if (error) return errorResponse(error.message, 500);
    await audit(env, staff.id, "staff_document_deleted", {
      staff_member_id: doc.staff_member_id,
      document_id: doc.id,
      kind: doc.kind,
    });
    return json({ ok: true });
  });
}
