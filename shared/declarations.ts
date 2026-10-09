// What the client ticks before signing. Shared so the server stores the exact
// wording the client saw alongside their ticks. Bump DECLARATIONS_VERSION
// whenever any text changes.

export const DECLARATIONS_VERSION = "2026-10-salon-v2";

export type DeclarationKey =
  | "accurate_information"
  | "understood_and_accept"
  | "no_patch_test_risk"
  | "doctor_ok"
  | "tell_us_changes"
  | "aftercare"
  | "guardian";

export const DECLARATION_TEXT: Record<DeclarationKey, string> = {
  accurate_information:
    "The information I've given is true and complete. I understand Kaaya relies on it, and that leaving something out could cause a reaction that Kaaya is not responsible for.",
  understood_and_accept:
    "I've read the notes above about my treatment and choose to go ahead. I understand every treatment carries a small risk of redness, irritation or reaction, and I accept that.",
  // v1 only: patch tests can no longer be waived. Kept so old records still read.
  no_patch_test_risk:
    "I've been offered a patch test and choose to go ahead without one. I accept the risk of an allergic reaction.",
  doctor_ok:
    "My doctor has told me the treatments marked \"needs your doctor's OK\" are fine for me.",
  tell_us_changes:
    "I'll tell my therapist before each visit if my health, medication or allergies change, or if I'm pregnant.",
  aftercare:
    "I'll follow the aftercare advice I'm given. I understand Kaaya can't be responsible for problems caused by not following it.",
  guardian:
    "I'm the parent or legal guardian of the person having the treatment, I've answered on their behalf, and I give consent for them.",
};

/** Which declarations must be ticked for this consultation. */
export function requiredDeclarations(opts: {
  decision: "continue" | "decline";
  doctorFlagged: boolean;
  hasGuardian: boolean;
}): DeclarationKey[] {
  const keys: DeclarationKey[] = ["accurate_information"];
  if (opts.decision === "continue") {
    keys.push("understood_and_accept");
    if (opts.doctorFlagged) keys.push("doctor_ok");
    keys.push("tell_us_changes", "aftercare");
  }
  if (opts.hasGuardian) keys.push("guardian");
  return keys;
}
