import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Demo 3 AI approach packaging", () => {
  it("keeps OpenAI credentials server-only and the feature disabled by default", () => {
    const manifest = readRepositoryFile("k8s/prospecta-demo3.yaml");
    const deploy = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");
    const example = readRepositoryFile(".env.demo3.example");

    expect(manifest).toContain(
      'FEATURE_AI_APPROACH_ENABLED: "__FEATURE_AI_APPROACH_ENABLED__"',
    );
    expect(manifest).toContain(
      'FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: "__FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED__"',
    );
    expect(manifest).toContain('OPENAI_APPROACH_TIMEOUT_MS: "20000"');
    expect(manifest).not.toContain("OPENAI_API_KEY:");
    expect(manifest).not.toContain("OPENAI_APPROACH_MODEL:");
    expect(manifest).not.toContain("NEXT_PUBLIC_OPENAI");

    expect(deploy).toContain(
      'aiApproachEnabled: optionalBoolean("FEATURE_AI_APPROACH_ENABLED")',
    );
    expect(deploy).toMatch(
      /aiApproachAutoQueueEnabled:\s*optionalBoolean\(\s*"FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED",?\s*\)/,
    );
    expect(deploy).toContain(
      'openAiApiKey: readOptional("OPENAI_API_KEY")',
    );
    expect(deploy).toContain(
      'openAiApproachModel: readOptional("OPENAI_APPROACH_MODEL")',
    );
    expect(deploy).toContain(
      "OPENAI_API_KEY: configuration.openAiApiKey",
    );
    expect(deploy).toContain(
      "OPENAI_APPROACH_MODEL: configuration.openAiApproachModel",
    );
    expect(deploy).toContain(
      '"__FEATURE_AI_APPROACH_ENABLED__"',
    );
    expect(deploy).toContain(
      '"__FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED__"',
    );
    expect(deploy).toContain(
      '"db/app/015_lead_approach_draft_cache_forward.sql"',
    );

    const postgresImage = readRepositoryFile("k8s/Dockerfile.demo3-postgres");
    expect(postgresImage).toContain(
      "COPY db/app/015_lead_approach_draft_cache_forward.sql",
    );

    expect(example).toContain('OPENAI_API_KEY=""');
    expect(example).toContain('OPENAI_APPROACH_MODEL=""');
    expect(example).toContain('FEATURE_AI_APPROACH_ENABLED="false"');
    expect(example).toContain(
      'FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED="false"',
    );
    expect(example).not.toContain("NEXT_PUBLIC_OPENAI");
  });
});
