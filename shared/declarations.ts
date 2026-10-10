// What the client ticks before signing. Shared so the server stores the exact
// wording the client saw alongside their ticks. Bump DECLARATIONS_VERSION
// whenever any text changes.
//
// v3: two confirmations (declaration & consent, e-signature) plus a guardian
// confirmation for under-18s. Wording avoids blanket liability exclusions:
// informed consent doesn't remove Kaaya's duty of care.

export const DECLARATIONS_VERSION = "2026-10-salon-v3";

export type DeclarationKey = "consent" | "esign" | "guardian";

export interface DeclarationContext {
  decision: "continue" | "decline";
  /** A treatment needs the client's doctor's OK (adds one sentence to the consent). */
  doctorFlagged: boolean;
}

export const DECLARATION_HEADING: Record<DeclarationKey, string> = {
  consent: "Declaration & consent",
  esign: "Electronic signature",
  guardian: "Parent / guardian consent",
};

export function declarationText(key: DeclarationKey, ctx: DeclarationContext): string {
  switch (key) {
    case "consent":
      if (ctx.decision === "decline") return "I confirm my information is accurate and complete.";
      return (
        "I confirm my information is accurate and complete. I have read the treatment information, understand the possible risks, and consent to proceed. I agree to follow aftercare advice and inform Kaaya of any relevant health changes." +
        (ctx.doctorFlagged
          ? " My doctor has confirmed that the treatments marked \"needs your doctor's OK\" are suitable for me."
          : "")
      );
    case "esign":
      return "I agree to sign this consent form electronically.";
    case "guardian":
      return "I am the parent or legal guardian of the client. I have answered on their behalf and consent to their treatment.";
  }
}

/** Which declarations must be ticked for this consultation, in display order. */
export function requiredDeclarations(opts: { hasGuardian: boolean }): DeclarationKey[] {
  return opts.hasGuardian ? ["consent", "esign", "guardian"] : ["consent", "esign"];
}
