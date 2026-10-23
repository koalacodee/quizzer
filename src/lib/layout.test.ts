import { describe, expect, it } from "vitest";
import { buildLayout, orderChoices } from "./layout";

const quiz = (over: Partial<Parameters<typeof buildLayout>[0]> = {}) => ({
  shuffleQuestions: false,
  shuffleChoices: false,
  questionPoolSize: null,
  questions: ["q1", "q2", "q3", "q4"].map((id) => ({ id, choices: [{ id: `${id}a` }, { id: `${id}b` }] })),
  ...over,
});

describe("buildLayout", () => {
  it("keeps authoring order by default", () => {
    const layout = buildLayout(quiz());
    expect(layout.questionIds).toEqual(["q1", "q2", "q3", "q4"]);
    expect(layout.choiceOrder.q1).toEqual(["q1a", "q1b"]);
  });

  it("draws a pool of the requested size in authoring order", () => {
    const layout = buildLayout(quiz({ questionPoolSize: 2 }));
    expect(layout.questionIds).toHaveLength(2);
    const idx = layout.questionIds.map((id) => Number(id.slice(1)));
    expect(idx).toEqual([...idx].sort());
    expect(Object.keys(layout.choiceOrder).sort()).toEqual([...layout.questionIds].sort());
  });

  it("shuffles questions and choices when asked", () => {
    const reverse = () => 0; // always swap with index 0 → deterministic permutation
    const layout = buildLayout(quiz({ shuffleQuestions: true, shuffleChoices: true }), reverse);
    expect(layout.questionIds).not.toEqual(["q1", "q2", "q3", "q4"]);
    expect([...layout.questionIds].sort()).toEqual(["q1", "q2", "q3", "q4"]);
    expect(layout.choiceOrder.q1).toEqual(["q1b", "q1a"]);
  });
});

describe("orderChoices", () => {
  const c = (id: string) => ({ id });
  it("follows the stored order, drops removed and appends new choices", () => {
    expect(orderChoices(["b", "x", "a"], [c("a"), c("b"), c("new")])).toEqual([c("b"), c("a"), c("new")]);
  });
  it("falls back to the current order", () => {
    expect(orderChoices(undefined, [c("a"), c("b")])).toEqual([c("a"), c("b")]);
  });
});
