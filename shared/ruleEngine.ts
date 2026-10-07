import { ALL_QUESTIONS } from "./questions";
import type {
  AnswerInput,
  RuleCondition,
  ScreeningFlag,
  ScreeningResult,
  TreatmentRecord,
  TreatmentRuleRecord,
} from "./types";

// The Kaaya consultation screening engine.
//
// This never makes a clinical judgement. Each flag carries two texts: a staff
// note (explanation + staff_action) and a client_message in salon language
// that tells the client what the risk is and that going ahead is their
// informed choice. Rules are data (treatment_rules table), not hardcoded
// branches, so new rules or treatments can be added without changing this file.
//
// Runs BEFORE the client signs: the client acknowledgement workflow shows
// these flags to the client first, so there is no signature to evaluate
// against yet (see consent_without_patch_test below, which is deactivated
// for exactly this reason -- its old signature-sourced condition can no
// longer run at this point in the flow).

const LABELS = new Map(ALL_QUESTIONS.map((q) => [q.key, q.label]));

function answerLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

function answersByKey(answers: AnswerInput[]): Map<string, AnswerInput> {
  return new Map(answers.map((a) => [a.question_key, a]));
}

function isTrue(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}

function matchesCategory(treatment: TreatmentRecord, category: TreatmentRuleRecord["applies_to_category"]): boolean {
  if (category === null) return true;
  return treatment[category] === true;
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

  const ordered = [...rules].sort((a, b) => ruleOrder(a) - ruleOrder(b));
  for (const rule of ordered) {
    if (!rule.active) continue;

    switch (rule.rule_type) {
      case "previous_tint_reaction":
      case "eye_related_information":
      case "adhesive_allergy":
      case "latex_allergy": {
        const relevantTreatments = selectedTreatments.filter((t) => matchesCategory(t, rule.applies_to_category));
        if (relevantTreatments.length === 0) break;
        if (rule.condition.source !== "answers") break;

        const { matched, matchedKeys } = evaluateAnswerCondition(rule.condition, answerMap);
        if (!matched) break;

        matchedKeys.forEach((k) => coveredAnswerKeys.add(k));
        const treatmentNames = relevantTreatments.map((t) => t.name).join(", ");
        const answerSummary = matchedKeys.map((k) => `${answerLabel(k)}: Yes`).join("; ");

        flags.push({
          rule_id: rule.id,
          rule_key: rule.rule_key,
          group_key: rule.group_key,
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          client_answer_summary: answerSummary,
          explanation: `${rule.description_template} Selected treatment(s): ${treatmentNames}. ${STAFF_NOTE}`,
          staff_action: rule.staff_action,
          client_message: fillMessage(rule.client_message, rule.description_template, { treatments: treatmentNames }),
          treatment_ids: relevantTreatments.map((t) => t.id),
        });
        break;
      }

      case "patch_test_required": {
        const treatmentsNeedingPatchTest = selectedTreatments.filter((t) => t.requires_patch_test);
        if (treatmentsNeedingPatchTest.length === 0) break;
        if (rule.condition.source !== "answers") break;

        const patchTestKey = rule.condition.question_keys?.[0] ?? "patch_test_done";
        const patchTestDone = isTrue(answerMap.get(patchTestKey)?.answer_value);
        if (patchTestDone) break;

        coveredAnswerKeys.add(patchTestKey);
        const treatmentNames = treatmentsNeedingPatchTest.map((t) => t.name).join(", ");

        flags.push({
          rule_id: rule.id,
          rule_key: rule.rule_key,
          group_key: rule.group_key,
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          client_answer_summary: `${answerLabel(patchTestKey)}: No`,
          explanation: `${rule.description_template} Treatment(s) requiring a patch test: ${treatmentNames}. ${STAFF_NOTE}`,
          staff_action: rule.staff_action,
          client_message: fillMessage(rule.client_message, rule.description_template, { treatments: treatmentNames }),
          treatment_ids: treatmentsNeedingPatchTest.map((t) => t.id),
        });
        break;
      }

      // Deactivated (treatment_rules.active = false): superseded by the
      // generic continue/decline decision every flag now goes through via
      // the client acknowledgement workflow, recorded in
      // consultation_acknowledgements rather than a patch-test-specific
      // consent checkbox. Kept only so historical flags stay linkable via
      // rule_id. Since no active rule reaches this branch, it's a no-op.
      case "consent_without_patch_test":
        break;

      case "general_medical_information": {
        if (rule.condition.source !== "answers") break;
        const keys = rule.condition.question_keys ?? [];

        for (const key of keys) {
          if (coveredAnswerKeys.has(key)) continue;
          if (!isTrue(answerMap.get(key)?.answer_value)) continue;

          flags.push({
            rule_id: rule.id,
            rule_key: `${rule.rule_key}:${key}`,
            group_key: rule.group_key,
            category: rule.category,
            severity: rule.severity,
            title: `${rule.title}: ${answerLabel(key)}`,
            client_answer_summary: `${answerLabel(key)}: Yes`,
            explanation: `${rule.description_template} Reported item: ${answerLabel(key)}. ${STAFF_NOTE}`,
            staff_action: rule.staff_action,
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
