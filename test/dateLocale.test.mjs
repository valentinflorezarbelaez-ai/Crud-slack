import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatIsoDateEs, parseEsDateToIso, listAssigneeChoices } from "../src/ui/taskCards.mjs";

describe("Spanish date locale helpers & assignee choices", () => {
  it("formats and parses dd/mm/aaaa round-trip", () => {
    assert.equal(formatIsoDateEs("2026-11-14"), "14/11/2026");
    assert.equal(parseEsDateToIso("14/11/2026"), "2026-11-14");
    assert.equal(parseEsDateToIso("14-11-2026"), "2026-11-14");
    assert.equal(parseEsDateToIso("2026-11-14"), "2026-11-14");
    assert.equal(parseEsDateToIso(""), null);
    assert.equal(parseEsDateToIso("32/13/2026"), null);
  });

  it("lists workspace contacts including Por asignar and team profiles", () => {
    const choices = listAssigneeChoices({ full_name: "Invitado Demo" }, ["Carlos"]);
    assert.ok(choices.includes("Por asignar"));
    assert.ok(choices.includes("Valentín Flórez Arbelaez"));
    assert.ok(choices.includes("Jacobo Flórez Galeano"));
    assert.ok(choices.includes("Invitado Demo"));
    assert.ok(choices.includes("Carlos"));
  });
});
