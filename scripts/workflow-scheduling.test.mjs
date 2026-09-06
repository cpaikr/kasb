import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseDocument } from "yaml";
import { schedulingFailures } from "./workflow-scheduling-policy.mjs";

const workflows = {};
for (const name of await readdir(new URL("../.github/workflows/", import.meta.url))) {
  if (!/\.ya?ml$/u.test(name)) continue;
  const document = parseDocument(await readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8"));
  assert.deepEqual(document.errors, []);
  workflows[name] = document.toJS();
}

test("current workflows schedule only Linux x64 automatically", () => {
  assert.deepEqual(schedulingFailures(workflows), []);
});

for (const runner of ["ubuntu-24.04-arm", "blacksmith-6vcpu-macos-15", "blacksmith-2vcpu-windows-2025", "blacksmith-8vcpu-ubuntu-2404"]) {
  test(`rejects an added automatic ${runner} job`, () => {
    const changed = structuredClone(workflows);
    changed["ci.yml"].jobs.extra = { "runs-on": runner };
    assert.match(schedulingFailures(changed).join("\n"), /extra: routine jobs/u);
  });
  test(`rejects ${runner} hidden behind a matrix runner`, () => {
    const changed = structuredClone(workflows);
    changed["ci.yml"].jobs["native-linux"].strategy.matrix.include.push({ runner });
    assert.match(schedulingFailures(changed).join("\n"), /native-linux: routine jobs/u);
  });
}

for (const [name, event] of [["candidate.yml", "pull_request"], ["candidate.yml", "schedule"], ["release.yml", "push"]]) {
  test(`rejects automatic ${event} entry to ${name}`, () => {
    const changed = structuredClone(workflows);
    changed[name].on[event] = {};
    assert.match(schedulingFailures(changed).join("\n"), /cross-platform workflows must be manual-only/u);
  });
}

test("rejects an automatic reusable caller even in another workflow", () => {
  const changed = structuredClone(workflows);
  changed["new.yml"] = { on: "push", jobs: { candidate: { uses: "./.github/workflows/candidate.yml" } } };
  assert.match(schedulingFailures(changed).join("\n"), /must not call reusable workflows/u);
});

for (const matrix of ["${{ fromJSON(needs.metadata.outputs.matrix) }}", { runner: ["ubuntu-24.04", "ubuntu-24.04-arm"] }]) {
  test(`rejects an unresolved runner matrix ${JSON.stringify(matrix)}`, () => {
    const changed = structuredClone(workflows);
    changed["ci.yml"].jobs["native-linux"].strategy.matrix = matrix;
    assert.match(schedulingFailures(changed).join("\n"), /explicit include tuples/u);
  });
}

const sha = "1".repeat(40);
for (const scenario of [
  { name: "direct manual rehearsal", mode: "", ref: "", expectedMode: "rehearsal", expectedRef: `refs/kasb-rehearsal/${sha}` },
  { name: "strict reuse from a manual tag release", mode: "strict", ref: "refs/tags/v0.3.0", expectedMode: "strict", expectedRef: "refs/tags/v0.3.0" },
  { name: "strict reuse with a branch", mode: "strict", ref: "refs/heads/main", invalid: true },
  { name: "rehearsal with a real tag", mode: "rehearsal", ref: "refs/tags/v0.3.0", invalid: true },
]) {
  test(`candidate identity handles ${scenario.name}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "kasb-dispatch-"));
    try {
      const output = join(directory, "output");
      const script = workflows["candidate.yml"].jobs.metadata.steps.find(({ id }) => id === "identity").run;
      const result = spawnSync("bash", ["-c", script], {
        encoding: "utf8",
        env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: sha,
          GITHUB_OUTPUT: output, REQUESTED_MODE: scenario.mode, REQUESTED_REF: scenario.ref, REQUESTED_SHA: "" },
      });
      assert.equal(result.error, undefined);
      if (scenario.invalid) {
        assert.notEqual(result.status, 0);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(await readFile(output, "utf8"), `mode=${scenario.expectedMode}\nref=${scenario.expectedRef}\nsha=${sha}\n`);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
