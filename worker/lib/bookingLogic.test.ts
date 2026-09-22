import { describe, it, expect } from "vitest";
import { attachServiceMappings, buildServiceNameSnapshot } from "./bookingLogic";

describe("attachServiceMappings", () => {
  it("attaches a matching mapping by squareVariationId", () => {
    const variations = [{ squareVariationId: "v1", serviceName: "Tinting" }];
    const mappings = [
      { square_variation_id: "v1", treatment_id: "t1", tint_product_type: "hair_dye" as const, eyelash_safe: false },
    ];
    const result = attachServiceMappings(variations, mappings);
    expect(result).toHaveLength(1);
    expect(result[0].mapping).toEqual(mappings[0]);
  });

  it("attaches null when no mapping matches", () => {
    const variations = [{ squareVariationId: "v1", serviceName: "Tinting" }];
    const result = attachServiceMappings(variations, []);
    expect(result[0].mapping).toBeNull();
  });

  it("never lets a mapping leak onto the wrong variation", () => {
    const variations = [
      { squareVariationId: "v1", serviceName: "Tinting - Eyebrow" },
      { squareVariationId: "v2", serviceName: "Tinting - Eyelash" },
    ];
    const mappings = [
      { square_variation_id: "v2", treatment_id: "t1", tint_product_type: "hair_dye" as const, eyelash_safe: true },
    ];
    const result = attachServiceMappings(variations, mappings);
    expect(result.find((v) => v.squareVariationId === "v1")?.mapping).toBeNull();
    expect(result.find((v) => v.squareVariationId === "v2")?.mapping).toEqual(mappings[0]);
  });
});

describe("buildServiceNameSnapshot", () => {
  it("combines service and variation names", () => {
    expect(buildServiceNameSnapshot("Tinting", "Eyebrow")).toBe("Tinting - Eyebrow");
  });

  it("falls back to just the service name when variation name is empty", () => {
    expect(buildServiceNameSnapshot("Tinting", "")).toBe("Tinting");
  });
});
