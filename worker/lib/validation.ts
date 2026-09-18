import { z } from "zod";
import { ALL_QUESTIONS } from "../../shared/questions";

const answerValueSchema = z.union([z.boolean(), z.string()]);

export const answerInputSchema = z.object({
  question_key: z.string().min(1),
  answer_value: answerValueSchema,
  additional_info: z.string().max(2000).nullable().optional(),
});

export const signatureInputSchema = z.object({
  method: z.literal("typed"),
  legal_name: z.string().trim().min(2, "Legal name is required"),
  signature_value: z.string().trim().min(2),
  consent_without_patch_test: z.boolean(),
});

export const consultationSubmissionSchema = z.object({
  client: z.object({
    first_name: z.string().trim().min(1),
    last_name: z.string().trim().min(1),
    email: z.string().trim().email(),
    phone: z.string().trim().min(5),
    address: z.string().trim().optional(),
  }),
  answers: z.array(answerInputSchema),
  treatment_ids: z.array(z.string().uuid()).min(1, "Select at least one treatment"),
  signature: signatureInputSchema,
});

const knownQuestionKeys = new Set(ALL_QUESTIONS.map((q) => q.key));
// personal_profile fields arrive via `client`, not `answers` — only the
// medical_assessment / salon_patch_test sections are required inside `answers`.
const requiredQuestionKeys = ALL_QUESTIONS.filter((q) => q.required && q.section !== "personal_profile").map(
  (q) => q.key
);

/** Server-side check that every submitted answer key is a real question, and every required question was answered. */
export function validateAnswerCompleteness(answers: { question_key: string }[]): string | null {
  const submittedKeys = new Set(answers.map((a) => a.question_key));

  for (const key of submittedKeys) {
    if (!knownQuestionKeys.has(key)) return `Unknown question: ${key}`;
  }
  for (const key of requiredQuestionKeys) {
    if (!submittedKeys.has(key)) return `Missing required answer: ${key}`;
  }
  return null;
}

export const staffReviewSchema = z.object({
  decision: z.enum([
    "suitable_to_proceed",
    "proceed_with_conditions",
    "further_information_required",
    "do_not_proceed",
  ]),
  // Enforced server-side, not just as a UI checkbox -- a decision is a
  // deliberate staff act, not something a stray click should be able to record.
  confirmed: z.literal(true, { errorMap: () => ({ message: "Staff confirmation is required" }) }),
  notes: z.string().trim().max(4000).optional(),
});
