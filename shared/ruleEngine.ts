import { ALL_QUESTIONS } from "./questions";
import type {
  AnswerInput,
  RuleCondition,
  ScreeningFlag,
  ScreeningResult,
  TreatmentFlag,
  TreatmentRecord,
  TreatmentRuleRecord,
} from "./types";

// The Kaaya consultation screening engine.
//
// This never makes a clinical judgement. Rules come from the manufacturers'
// instructions and the salon's own policies, stored as data
// (treatment_rules), so new rules or treatments can be added without
// changing this file. Each flag carries:
// - an outcome: warn (client decides), doctor (client must confirm their
//   doctor's OK) or stop (the treatment can't go ahead);
// - a staff note (explanation + staff_action);
// - a client_message in salon language.
//
// Runs BEFORE the client signs: the client sees these flags first, so there
// is no signature to evaluate against yet (consent_without_patch_test below
// is deactivated for exactly this reason).

const LABELS = new Map<string, string>([
  ...ALL_QUESTIONS.map((q) => [q.key, q.label] as [string, string]),
  // Not a question: derived server-side from a guardian completing the form.
  ["under_16", "Under 16"],
]);

function answerLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

function answersByKey(answers: AnswerInput[]): Map<string, AnswerInput> {
  return new Map(answers.map((a) => [a.question_key, a]));
}

function isTrue(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}

function hasFlag(treatment: TreatmentRecord, flag: TreatmentFlag): boolean {
  return treatment[flag] === true;
}

function ruleApplies(treatment: TreatmentRecord, rule: TreatmentRuleRecord): boolean {
  const any = rule.applies_to_any ?? [];
  if (any.length > 0) return any.some((f) => hasFlag(treatment, f));
  if (rule.applies_to_category === null) return true;
  return hasFlag(treatment, rule.applies_to_category);
}

function evaluateAnswerCondition(
  condition: RuleCondition,
  answers: Map<string, AnswerInput>
): { matched: boolean; matchedKeys: string[] } {
  const keys = condition.question_keys ?? [];
  const matchedKeys = keys.filter((k) => isTrue(answers.get(k)?.answer_value) === condition.expect);
  const matched = condition.match === "all" ? matchedKeys.length === keys.length : matchedKeys.length > 0;
  return { matched, matchedKeys };
}

const STAFF_NOTE = "Check this with the client before starting.";

function fillMessage(template: string | null | undefined, fallback: string, values: { treatments?: string; item?: string }): string {
  if (!template) return fallback;
  return template
    .replace(/\{treatments\}/g, values.treatments ?? "This treatment")
    .replace(/\{item\}/g, values.item ?? "");
}

// general_medical_information skips answers a more specific rule already
// raised, so it has to run after every other rule regardless of row order.
function ruleOrder(rule: TreatmentRuleRecord): number {
  return rule.rule_type === "general_medical_information" ? 1 : 0;
}

export function screenConsultation(
  answers: AnswerInput[],
  selectedTreatments: TreatmentRecord[],
  rules: TreatmentRuleRecord[]
): ScreeningResult {
  const answerMap = answersByKey(answers);
  const flags: ScreeningFlag[] = [];
  const coveredAnswerKeys = new Set<string>();

  const base = (rule: TreatmentRuleRecord) => ({
    rule_id: rule.id,
    group_key: rule.group_key,
    category: rule.category,
    severity: rule.severity,
    outcome: rule.outcome ?? "warn",
    staff_action: rule.staff_action,
  });

  const ordered = [...rules].sort((a, b) => ruleOrder(a) - ruleOrder(b));
  for (const rule of ordered) {
    if (!rule.active) continue;

    switch (rule.rule_type) {
      case "previous_tint_reaction":
      case "eye_related_information":
      case "adhesive_allergy":
      case "latex_allergy":
      case "contraindication": {
        const relevantTreatments = selectedTreatments.filter((t) => ruleApplies(t, rule));
        if (relevantTreatments.length === 0) break;
        if (rule.condition.source !== "answers") break;

        const { matched, matchedKeys } = evaluateAnswerCondition(rule.condition, answerMap);
        if (!matched) break;

        matchedKeys.forEach((k) => coveredAnswerKeys.add(k));
        const treatmentNames = relevantTreatments.map((t) => t.name).join(", ");

        flags.push({
          ...base(rule),
          rule_key: rule.rule_key,
          title: rule.title,
          client_answer_summary: matchedKeys.map((k) => `${answerLabel(k)}: Yes`).join("; "),
          explanation: `${rule.description_template} Selected treatment(s): ${treatmentNames}. ${STAFF_NOTE}`,
          client_message: fillMessage(rule.client_message, rule.description_template, { treatments: treatmentNames }),
          treatment_ids: relevantTreatments.map((t) => t.id),
        });
        break;
      }

      // Two treatments that can't be done close together (e.g. henna brows
      // and brow lamination). Attaches to the treatments matching the rule.
      case "treatment_combination": {
        const required = rule.condition.requires_flags ?? [];
        if (required.length === 0) break;
        const allPresent = required.every((f) => selectedTreatments.some((t) => hasFlag(t, f)));
        if (!allPresent) break;
        const relevantTreatments = selectedTreatments.filter((t) => ruleApplies(t, rule));
        if (relevantTreatments.length === 0) break;
        const treatmentNames = relevantTreatments.map((t) => t.name).join(", ");
        const allNames = selectedTreatments.filter((t) => required.some((f) => hasFlag(t, f))).map((t) => t.name);

        flags.push({
          ...base(rule),
          rule_key: rule.rule_key,
          title: rule.title,
          client_answer_summary: `Chosen together: ${allNames.join(", ")}`,
          explanation: `${rule.description_template} ${STAFF_NOTE}`,
          client_message: fillMessage(rule.client_message, rule.description_template, { treatments: treatmentNames }),
          treatment_ids: relevantTreatments.map((t) => t.id),
        });
        break;
      }

      // question_keys[0]: "has had a patch test" (must be Yes).
      // question_keys[1] (optional): "anything changed since" (must be No).
      case "patch_test_required": {
        const treatmentsNeedingPatchTest = selectedTreatments.filter((t) => t.requires_patch_test);
        if (treatmentsNeedingPatchTest.length === 0) break;
        if (rule.condition.source !== "answers") break;

        const [doneKey = "patch_test_done", changedKey] = rule.condition.question_keys ?? [];
        const done = isTrue(answerMap.get(doneKey)?.answer_value);
        const changed = changedKey ? isTrue(answerMap.get(changedKey)?.answer_value) : false;
        if (done && !changed) break;

        coveredAnswerKeys.add(doneKey);
        if (changedKey) coveredAnswerKeys.add(changedKey);
        const treatmentNames = treatmentsNeedingPatchTest.map((t) => t.name).join(", ");
        const summary = done
          ? `${answerLabel(changedKey ?? doneKey)}: Yes`
          : `${answerLabel(doneKey)}: No`;

        flags.push({
          ...base(rule),
          rule_key: rule.rule_key,
          title: rule.title,
          client_answer_summary: summary,
          explanation: `${rule.description_template} Treatment(s) requiring a patch test: ${treatmentNames}. ${STAFF_NOTE}`,
          client_message: fillMessage(rule.client_message, rule.description_template, { treatments: treatmentNames }),
          treatment_ids: treatmentsNeedingPatchTest.map((t) => t.id),
        });
        break;
      }

      // Deactivated (treatment_rules.active = false): superseded by the
      // acknowledgement workflow. Kept only so historical flags stay
      // linkable via rule_id. Since no active rule reaches this branch,
      // it's a no-op.
      case "consent_without_patch_test":
        break;

      case "general_medical_information": {
        if (rule.condition.source !== "answers") break;
        const keys = rule.condition.question_keys ?? [];

        for (const key of keys) {
          if (coveredAnswerKeys.has(key)) continue;
          if (!isTrue(answerMap.get(key)?.answer_value)) continue;

          flags.push({
            ...base(rule),
            rule_key: `${rule.rule_key}:${key}`,
            title: `${rule.title}: ${answerLabel(key)}`,
            client_answer_summary: `${answerLabel(key)}: Yes`,
            explanation: `${rule.description_template} Reported item: ${answerLabel(key)}. ${STAFF_NOTE}`,
            client_message: fillMessage(rule.client_message, rule.description_template, { item: answerLabel(key) }),
            // No rule currently ties this to a specific treatment — shown as
            // general in the staff UI rather than guessing an attribution.
            treatment_ids: [],
          });
        }
        break;
      }
    }
  }

  const summary = {
    total: flags.length,
    high: flags.filter((f) => f.severity === "HIGH").length,
    medium: flags.filter((f) => f.severity === "MEDIUM").length,
    information: flags.filter((f) => f.severity === "INFORMATION").length,
  };

  return { flags, summary, screenedAt: new Date().toISOString() };
}
