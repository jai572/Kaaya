import { describe, expect, it } from "vitest";
import { screenConsultation } from "./ruleEngine";
import type { AnswerInput, TreatmentRecord, TreatmentRuleRecord } from "./types";

const nails: TreatmentRecord = {
  id: "nails",
  name: "Nails",
  is_tint: false,
  is_eyelash: false,
  uses_adhesive: true,
  uses_latex: true,
  requires_patch_test: false,
};
const threading: TreatmentRecord = { ...nails, id: "threading", name: "Threading", uses_adhesive: false, uses_latex: false };

function rule(partial: Partial<TreatmentRuleRecord> & Pick<TreatmentRuleRecord, "rule_key" | "rule_type">): TreatmentRuleRecord {
  return {
    id: partial.rule_key,
    applies_to_category: null,
    applies_to_treatment_id: null,
    condition: { source: "answers", question_keys: [], expect: true, match: "any" },
    severity: "HIGH",
    title: partial.rule_key,
    description_template: "Staff text.",
    staff_action: "Do something.",
    active: true,
    group_key: null,
    category: null,
    client_message: null,
    ...partial,
  };
}

const general = rule({
  rule_key: "general_medical_information",
  rule_type: "general_medical_information",
  severity: "INFORMATION",
  condition: { source: "answers", question_keys: ["latex_allergy", "diabetes"], expect: true, match: "any" },
  client_message: "Thanks for letting us know about: {item}.",
});
const latex = rule({
  rule_key: "latex_allergy",
  rule_type: "latex_allergy",
  applies_to_category: "uses_latex",
  condition: { source: "answers", question_keys: ["latex_allergy"], expect: true, match: "any" },
  client_message: "{treatments} may use latex.",
});

const yes = (key: string): AnswerInput => ({ question_key: key, answer_value: true });

describe("screenConsultation", () => {
  it("raises the specific latex rule even when the general rule comes first", () => {
    const { flags } = screenConsultation([yes("latex_allergy")], [nails], [general, latex]);
    expect(flags.map((f) => f.rule_key)).toEqual(["latex_allergy"]);
    expect(flags[0].client_message).toBe("Nails may use latex.");
    expect(flags[0].treatment_ids).toEqual(["nails"]);
  });

  it("falls back to general information when no chosen treatment uses latex", () => {
    const { flags } = screenConsultation([yes("latex_allergy")], [threading], [general, latex]);
    expect(flags.map((f) => f.rule_key)).toEqual(["general_medical_information:latex_allergy"]);
    expect(flags[0].client_message).toBe("Thanks for letting us know about: Allergic to latex.");
  });

  it("uses the staff text for the client when a rule has no client message", () => {
    const { flags } = screenConsultation([yes("diabetes")], [threading], [{ ...general, client_message: null }]);
    expect(flags[0].client_message).toBe("Staff text.");
  });
});
