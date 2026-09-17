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
}

export interface AnswerInput {
  question_key: string;
  answer_value: boolean | string;
  additional_info?: string | null;
}

export interface SignatureInput {
  method: "typed";
  legal_name: string;
  signature_value: string;
  consent_without_patch_test: boolean;
}

export interface ConsultationSubmission {
  client: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address?: string;
  };
  answers: AnswerInput[];
  treatment_ids: string[];
  signature: SignatureInput;
}

export interface TreatmentRecord {
  id: string;
  name: string;
  is_tint: boolean;
  is_eyelash: boolean;
  uses_adhesive: boolean;
  requires_patch_test: boolean;
}

export type RuleConditionSource = "answers" | "signature";

export interface RuleCondition {
  source: RuleConditionSource;
  question_keys?: string[];
  field?: string;
  expect: boolean;
  match?: "any" | "all";
}

export type RuleApplyCategory = "is_tint" | "is_eyelash" | "uses_adhesive" | null;

export interface TreatmentRuleRecord {
  id: string;
  rule_key: string;
  rule_type:
    | "previous_tint_reaction"
    | "eye_related_information"
    | "adhesive_allergy"
    | "patch_test_required"
    | "consent_without_patch_test"
    | "general_medical_information";
  applies_to_category: RuleApplyCategory;
  applies_to_treatment_id: string | null;
  condition: RuleCondition;
  severity: Severity;
  title: string;
  description_template: string;
  staff_action: string;
  active: boolean;
}

export interface ScreeningFlag {
  rule_id: string | null;
  rule_key: string;
  severity: Severity;
  title: string;
  client_answer_summary: string;
  explanation: string;
  staff_action: string;
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
