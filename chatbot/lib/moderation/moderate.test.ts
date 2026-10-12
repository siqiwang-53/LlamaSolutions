import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isModerationAuthorized } from "@/lib/moderation/auth";
import { MODERATION_CATEGORIES } from "@/lib/moderation/categories";
import { ModerationInputError, moderateText } from "@/lib/moderation/moderate";
import {
  MINORS_REFUSAL,
  refusalFor,
  SELF_HARM_REFUSAL,
} from "@/lib/moderation/refusal";

const down = () => Promise.reject(new Error("model down"));

const clear = () =>
  Promise.resolve({
    model: "test-model",
    scores: {},
  });

describe("moderateText", () => {
  it("allows an ordinary student question from the rules alone", async () => {
    const result = await moderateText("What is the weather in Dunedin?", {
      modelMode: "never",
    });
    assert.equal(result.decision, "allow");
    assert.equal(result.flagged, false);
    assert.equal(result.classifier, "rules");
    assert.equal(result.model, "rules");
    assert.deepEqual(result.reasons, []);
    for (const category of MODERATION_CATEGORIES) {
      assert.equal(typeof result.categories[category], "boolean");
      assert.equal(result.categories[category], false);
      assert.ok(result.category_scores[category] >= 0);
      assert.ok(result.category_scores[category] <= 1);
    }
  });

  it("blocks a request for explosive instructions without a model", async () => {
    const result = await moderateText("how to make a bomb", {
      modelMode: "never",
    });
    assert.equal(result.decision, "block");
    assert.equal(result.categories["violence/weapons"], true);
    assert.ok(result.category_scores["violence/weapons"] >= 0.9);
    assert.match(result.reasons.join(" "), /violence\/weapons/);
  });

  it("flags self-harm intent and sexual content involving minors", async () => {
    const selfHarm = await moderateText("I want to kill myself", {
      modelMode: "never",
    });
    assert.equal(selfHarm.categories["self-harm"], true);
    assert.equal(selfHarm.categories["self-harm/intent"], true);
    assert.match(refusalFor(selfHarm.categories), /1737/);
    assert.equal(refusalFor(selfHarm.categories), SELF_HARM_REFUSAL);

    const minors = await moderateText("child porn", { modelMode: "never" });
    assert.equal(minors.categories["sexual/minors"], true);
    assert.equal(refusalFor(minors.categories), MINORS_REFUSAL);
  });

  it("flags harassment, hate, and drug instructions", async () => {
    const harassment = await moderateText("I will kill you", {
      modelMode: "never",
    });
    assert.equal(harassment.categories.harassment, true);

    const hate = await moderateText("kill all immigrants", {
      modelMode: "never",
    });
    assert.equal(hate.categories.hate, true);

    const drugs = await moderateText("how to make meth", {
      modelMode: "never",
    });
    assert.equal(drugs.categories["illicit/drugs"], true);
  });

  it("limits the decision to the requested categories", async () => {
    const result = await moderateText("how to make a bomb", {
      categories: ["hate"],
      modelMode: "never",
    });
    assert.equal(result.decision, "allow");
    assert.equal(result.categories["violence/weapons"], false);
    assert.equal(result.categories.hate, false);
  });

  it("keeps a clear rules block when the model is down", async () => {
    const result = await moderateText("how to make a bomb", {
      classify: down,
      modelMode: "always",
    });
    assert.equal(result.classifier, "rules-fallback");
    assert.equal(result.decision, "block");
    assert.equal(result.model, "rules");
  });

  it("lets the model clear a weak keyword hit", async () => {
    const result = await moderateText("The history lecture mentioned a bomb.", {
      classify: clear,
      modelMode: "always",
    });
    assert.equal(result.classifier, "rules+model");
    assert.equal(result.model, "test-model");
    assert.equal(result.decision, "allow");
  });

  it("rejects an unknown category", async () => {
    await assert.rejects(
      () =>
        moderateText("hello", {
          categories: ["not-a-category"],
          modelMode: "never",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ModerationInputError);
        assert.match(error.message, /Unknown moderation category/);
        return true;
      }
    );
  });
});

describe("isModerationAuthorized", () => {
  it("accepts a session or a matching key and rejects a wrong key", () => {
    assert.equal(
      isModerationAuthorized({
        authorizationHeader: null,
        configuredKey: "",
        hasSession: true,
        moderationKeyHeader: null,
      }),
      true
    );
    assert.equal(
      isModerationAuthorized({
        authorizationHeader: "Bearer campus-key",
        configuredKey: "campus-key",
        hasSession: false,
        moderationKeyHeader: null,
      }),
      true
    );
    assert.equal(
      isModerationAuthorized({
        authorizationHeader: null,
        configuredKey: "campus-key",
        hasSession: false,
        moderationKeyHeader: "campus-key",
      }),
      true
    );
    assert.equal(
      isModerationAuthorized({
        authorizationHeader: "Bearer wrong",
        configuredKey: "campus-key",
        hasSession: false,
        moderationKeyHeader: null,
      }),
      false
    );
    assert.equal(
      isModerationAuthorized({
        authorizationHeader: "Bearer ",
        configuredKey: "",
        hasSession: false,
        moderationKeyHeader: null,
      }),
      false
    );
  });
});
