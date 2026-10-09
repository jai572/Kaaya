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

describe("manufacturer rules", () => {
  const henna: TreatmentRecord = { ...threading, id: "henna", name: "Henna Tint", is_tint: true, contains_ppd: true, is_henna: true, requires_patch_test: true };
  const lamination: TreatmentRecord = { ...threading, id: "lam", name: "Eyebrow Lamination", is_lift: true, is_lamination: true, requires_patch_test: true };
  const wax: TreatmentRecord = { ...threading, id: "wax", name: "Waxing", is_wax: true };

  const under16 = rule({
    rule_key: "under_16_ppd",
    rule_type: "contraindication",
    applies_to_category: "contains_ppd",
    outcome: "stop",
    condition: { source: "answers", question_keys: ["under_16"], expect: true, match: "any" },
  });
  const brokenSkin = rule({
    rule_key: "broken_skin_now",
    rule_type: "contraindication",
    applies_to_any: ["contains_ppd", "is_wax"],
    outcome: "stop",
    condition: { source: "answers", question_keys: ["skin_broken_now"], expect: true, match: "any" },
  });
  const combo = rule({
    rule_key: "henna_lamination_week",
    rule_type: "treatment_combination",
    applies_to_category: "is_henna",
    outcome: "stop",
    condition: { source: "treatments", requires_flags: ["is_henna", "is_lamination"], expect: true },
  });
  const patch = rule({
    rule_key: "patch_test_required",
    rule_type: "patch_test_required",
    outcome: "stop",
    condition: { source: "answers", question_keys: ["patch_test_done", "patch_test_changes"], expect: false, match: "any" },
  });

  it("stops a PPD tint for an under-16 but not threading", () => {
    const { flags } = screenConsultation([yes("under_16")], [henna, threading], [under16]);
    expect(flags).toHaveLength(1);
    expect(flags[0].outcome).toBe("stop");
    expect(flags[0].treatment_ids).toEqual(["henna"]);
  });

  it("matches a rule against any of several treatment flags", () => {
    const { flags } = screenConsultation([yes("skin_broken_now")], [wax, threading], [brokenSkin]);
    expect(flags[0].treatment_ids).toEqual(["wax"]);
  });

  it("stops henna when brow lamination is chosen in the same visit", () => {
    expect(screenConsultation([], [henna], [combo]).flags).toHaveLength(0);
    const { flags } = screenConsultation([], [henna, lamination], [combo]);
    expect(flags.map((f) => [f.rule_key, f.outcome, f.treatment_ids])).toEqual([["henna_lamination_week", "stop", ["henna"]]]);
  });

  it("treats a patch test as invalid after a health change or 3-month gap", () => {
    const done = { question_key: "patch_test_done", answer_value: true };
    expect(screenConsultation([done], [henna], [patch]).flags).toHaveLength(0);
    const { flags } = screenConsultation([done, yes("patch_test_changes")], [henna], [patch]);
    expect(flags[0].outcome).toBe("stop");
    expect(screenConsultation([], [henna], [patch]).flags[0].client_answer_summary).toContain(": No");
  });

  it("defaults an outcome to warn when the rule has none", () => {
    const { flags } = screenConsultation([yes("diabetes")], [threading], [general]);
    expect(flags[0].outcome).toBe("warn");
  });
});
