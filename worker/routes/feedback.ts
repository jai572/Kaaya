import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { trialFeedbackSchema } from "../lib/bookingValidation";
import { withStaff } from "./staffBooking";

/** Trial feedback from the staff portal's "Give feedback" button. */
export async function submitFeedback(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = trialFeedbackSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const { error } = await adminClient(env)
      .from("trial_feedback")
      .insert({
        staff_profile_id: staff.id,
        tester_name: parsed.data.tester_name || null,
        kind: parsed.data.kind,
        message: parsed.data.message,
        page_path: parsed.data.page_path || null,
        user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
      });
    if (error) return errorResponse(error.message, 500);
    return json({ saved: true }, 201);
  });
}
