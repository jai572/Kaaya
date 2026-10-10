export type Severity = "HIGH" | "MEDIUM" | "INFORMATION";

export type ConsultationSection =
  | "personal_profile"
  | "medical_assessment"
  | "salon_patch_test";

export type QuestionKind = "text" | "email" | "tel" | "boolean";

export interface QuestionDef {
  key: string;
  label: string;
  section: ConsultationSection;
  kind: QuestionKind;
  required: boolean;
  /** When true and the answer is truthy, the UI should offer a free-text "please provide details" field. */
  allowAdditionalInfo?: boolean;
  /** Heading the form shows this question under (medical section only). */
  group?: string;
  /** Only asked when a chosen treatment has one of these flags (e.g. "is_wax"). Unasked = "No". */
  showFor?: TreatmentFlag[];
}

export interface AnswerInput {
  question_key: string;
  answer_value: boolean | string;
  additional_info?: string | null;
}

// Phase 1: client info + answers + treatments only. No signature yet -- the
// client sees their flags and decides before signing, so screening (and this
// submission) necessarily happens before any signature exists.
export interface ConsultationSubmission {
  client: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address?: string;
  };
  answers: AnswerInput[];
  /** What the client picked from the treatment list; mapped server-side to screening treatments. */
  service_ids?: string[];
  /** Legacy/direct screening treatments. At least one of service_ids / treatment_ids is required. */
  treatment_ids?: string[];
  /** Set when a parent or guardian fills the form in for someone under 18. */
  guardian?: { name: string; relationship: string; under_16: boolean } | null;
}

export type ClientDecision = "continue" | "decline";

export interface DrawnSignatureInput {
  method: "drawn";
  legal_name: string;
  /** PNG data URL from the signature canvas. */
  signature_value: string;
}

// Phase 2: shown the flags from phase 1, the client acknowledges them,
// decides whether to continue, and signs. This locks the consultation.
export interface FinalizeConsultationInput {
  decision: ClientDecision;
  acknowledged_flag_ids: string[];
  /** Keys from shared/declarations.ts the client ticked. */
  declarations: string[];
  signature: DrawnSignatureInput;
  device_info?: Record<string, unknown>;
}

export interface TreatmentRecord {
  id: string;
  name: string;
  is_tint: boolean;
  is_eyelash: boolean;
  uses_adhesive: boolean;
  uses_latex?: boolean;
  requires_patch_test: boolean;
  contains_ppd?: boolean;
  is_henna?: boolean;
  is_lift?: boolean;
  is_lamination?: boolean;
  is_wax?: boolean;
  is_gel?: boolean;
}

export type TreatmentFlag =
  | "is_tint"
  | "is_eyelash"
  | "uses_adhesive"
  | "uses_latex"
  | "requires_patch_test"
  | "contains_ppd"
  | "is_henna"
  | "is_lift"
  | "is_lamination"
  | "is_wax"
  | "is_gel";

/** warn: client decides. doctor: client must confirm their doctor's OK. stop: can't go ahead. */
export type FlagOutcome = "warn" | "doctor" | "stop";

export type RuleConditionSource = "answers" | "signature" | "treatments";

export interface RuleCondition {
  source: RuleConditionSource;
  question_keys?: string[];
  field?: string;
  expect: boolean;
  match?: "any" | "all";
  /** treatment_combination: every one of these flags must be present among the chosen treatments. */
  requires_flags?: TreatmentFlag[];
}

export type RuleApplyCategory = Exclude<TreatmentFlag, "requires_patch_test"> | null;

export interface TreatmentRuleRecord {
  id: string;
  rule_key: string;
  rule_type:
    | "previous_tint_reaction"
    | "eye_related_information"
    | "adhesive_allergy"
    | "latex_allergy"
    | "contraindication"
    | "treatment_combination"
    | "patch_test_required"
    | "consent_without_patch_test"
    | "general_medical_information";
  applies_to_category: RuleApplyCategory;
  /** Matches a treatment with ANY of these flags; takes precedence over applies_to_category when non-empty. */
  applies_to_any?: TreatmentFlag[] | null;
  applies_to_treatment_id: string | null;
  condition: RuleCondition;
  severity: Severity;
  outcome?: FlagOutcome;
  title: string;
  description_template: string;
  staff_action: string;
  /** What the client reads, in salon language. {treatments} / {item} are filled in. */
  client_message?: string | null;
  active: boolean;
  /** Lets the staff UI cluster related flags (e.g. two patch-test reasons) under one heading without merging their underlying rows. */
  group_key: string | null;
  /** Client-facing grouping label (e.g. "Patch test", "Eye health") -- coarser than rule_type, which is an internal key. */
  category: string | null;
}

export interface ScreeningFlag {
  rule_id: string | null;
  rule_key: string;
  group_key: string | null;
  category: string | null;
  severity: Severity;
  outcome: FlagOutcome;
  title: string;
  client_answer_summary: string;
  explanation: string;
  staff_action: string;
  client_message: string;
  /** Which selected treatment(s) this flag concerns. Empty = general — not attributed to a specific treatment because no rule actually ties it to one. */
  treatment_ids: string[];
}

export interface ScreeningResult {
  flags: ScreeningFlag[];
  summary: {
    total: number;
    high: number;
    medium: number;
    information: number;
  };
  screenedAt: string;
}
