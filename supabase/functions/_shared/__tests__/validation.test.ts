import { z } from "zod";
import { ItemRefSchema, AttachmentsSchema } from "../../_shared/validation.ts";

describe("shared validation", () => {
  it("requires optionIndex for item_option", () => {
    const valid = ItemRefSchema.parse({ type: "item_option", itemId: 1, optionIndex: 0 });
    expect(valid.optionIndex).toBe(0);
    expect(() => ItemRefSchema.parse({ type: "item_option", itemId: 1 })).toThrow();
  });

  it("parses attachments array", () => {
    const parsed = AttachmentsSchema.parse([{
      imageUrl: "https://cdn.example.com/img.webp",
      purpose: "stemIllustration",
      targetRef: { type: "item_stimulus", itemId: 1 },
    }]);
    expect(parsed[0].purpose).toBe("stemIllustration");
  });
});


