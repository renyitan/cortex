import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Phase } from "./types.js";

const OPERATING_SOURCE = "plugins/cortex/identity/operating.md";

const PHASE_SOURCES: Readonly<Record<Phase, readonly string[]>> = {
  wake: [OPERATING_SOURCE, "plugins/cortex/skills/recall/SKILL.md"],
  work: [OPERATING_SOURCE],
  sleep: [OPERATING_SOURCE, "plugins/cortex/skills/consolidate/SKILL.md"],
  curate: [OPERATING_SOURCE, "plugins/cortex/skills/curate/SKILL.md"],
};

export interface CortexPhaseSource {
  phase: Phase;
  files: readonly string[];
  digest: string;
  content: string;
}

export type CortexSourceManifest = Readonly<
  Record<Phase, { files: readonly string[]; sha256: string }>
>;

export class CortexSourceSnapshot {
  constructor(
    private readonly phases: Readonly<Record<Phase, CortexPhaseSource>>,
  ) {}

  async load(phase: Phase): Promise<CortexPhaseSource> {
    return structuredClone(this.phases[phase]);
  }

  manifest(): CortexSourceManifest {
    return Object.fromEntries(
      Object.entries(this.phases).map(([phase, source]) => [
        phase,
        { files: source.files, sha256: source.digest },
      ]),
    ) as CortexSourceManifest;
  }
}

export function defaultRepositoryRoot(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const override = environment.CORTEX_REPO_ROOT?.trim();
  if (override) return resolve(override);
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export class CortexSourceLoader {
  constructor(readonly repositoryRoot = defaultRepositoryRoot()) {}

  async load(phase: Phase): Promise<CortexPhaseSource> {
    const files = PHASE_SOURCES[phase];
    const sections = await Promise.all(
      files.map(async (path) => {
        const content = await readFile(resolve(this.repositoryRoot, path), "utf8");
        return `===== ${path} =====\n${content.trim()}\n`;
      }),
    );
    const content = sections.join("\n");
    return {
      phase,
      files,
      digest: createHash("sha256").update(content).digest("hex"),
      content,
    };
  }

  async manifest(): Promise<
    CortexSourceManifest
  > {
    const entries = await Promise.all(
      (["wake", "work", "sleep", "curate"] as const).map(async (phase) => {
        const source = await this.load(phase);
        return [phase, { files: source.files, sha256: source.digest }] as const;
      }),
    );
    return Object.fromEntries(entries) as CortexSourceManifest;
  }

  async snapshot(): Promise<CortexSourceSnapshot> {
    const phases = await Promise.all(
      (["wake", "work", "sleep", "curate"] as const).map(async (phase) => [
        phase,
        await this.load(phase),
      ] as const),
    );
    return new CortexSourceSnapshot(
      Object.fromEntries(phases) as Readonly<
        Record<Phase, CortexPhaseSource>
      >,
    );
  }
}
