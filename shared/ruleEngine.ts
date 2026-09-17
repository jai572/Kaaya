import { ALL_QUESTIONS } from "./questions";
import type {
  AnswerInput,
  RuleCondition,
  ScreeningFlag,
  ScreeningResult,
  SignatureInput,
  TreatmentRecord,
  TreatmentRuleRecord,
} from "./types";

// The Kaaya consultation screening engine.
//
// This never makes a clinical judgement. Every flag it produces is framed as
// "potential implication identified — staff review required", and explicitly
// states that final treatment suitability remains a staff decision. Rules are
// data (treatment_rules table), not hardcoded branches, so new rules or
// treatments can be added without changing this file.

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

const FINAL_DECISION_NOTE = "Final treatment suitability remains a staff decision.";

export function screenConsultation(
  answers: AnswerInput[],
  selectedTreatments: TreatmentRecord[],
  signature: SignatureInput,
  rules: TreatmentRuleRecord[]
): ScreeningResult {
  const answerMap = answersByKey(answers);
  const flags: ScreeningFlag[] = [];
  const coveredAnswerKeys = new Set<string>();

  for (const rule of rules) {
    if (!rule.active) continue;

    switch (rule.rule_type) {
      case "previous_tint_reaction":
      case "eye_related_information":
      case "adhesive_allergy": {
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
          severity: rule.severity,
          title: rule.title,
          client_answer_summary: answerSummary,
          explanation: `${rule.description_template} Selected treatment(s): ${treatmentNames}. ${FINAL_DECISION_NOTE}`,
          staff_action: rule.staff_action,
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
          severity: rule.severity,
          title: rule.title,
          client_answer_summary: `${answerLabel(patchTestKey)}: No`,
          explanation: `${rule.description_template} Treatment(s) requiring a patch test: ${treatmentNames}. ${FINAL_DECISION_NOTE}`,
          staff_action: rule.staff_action,
        });
        break;
      }

      case "consent_without_patch_test": {
        if (rule.condition.source !== "signature") break;
        if (signature.consent_without_patch_test !== rule.condition.expect) break;

        flags.push({
          rule_id: rule.id,
          rule_key: rule.rule_key,
          severity: rule.severity,
          title: rule.title,
          client_answer_summary: "Consent to proceed without patch test: Yes",
          explanation: `${rule.description_template} ${FINAL_DECISION_NOTE}`,
          staff_action: rule.staff_action,
        });
        break;
      }

      case "general_medical_information": {
        if (rule.condition.source !== "answers") break;
        const keys = rule.condition.question_keys ?? [];

        for (const key of keys) {
          if (coveredAnswerKeys.has(key)) continue;
          if (!isTrue(answerMap.get(key)?.answer_value)) continue;

          flags.push({
            rule_id: rule.id,
            rule_key: `${rule.rule_key}:${key}`,
            severity: rule.severity,
            title: `${rule.title}: ${answerLabel(key)}`,
            client_answer_summary: `${answerLabel(key)}: Yes`,
            explanation: `${rule.description_template} Reported item: ${answerLabel(key)}. ${FINAL_DECISION_NOTE}`,
            staff_action: rule.staff_action,
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
