// Keep the scheduling policy independent of the target manifest: changing both
// a matrix and its manifest must not silently restore automatic platform costs.
const routineRunners = new Set(["blacksmith-2vcpu-ubuntu-2404", "ubuntu-24.04"]);

export function schedulingFailures(workflows) {
  const failures = [];
  for (const [name, workflow] of Object.entries(workflows)) {
    const events = typeof workflow.on === "string" ? [workflow.on]
      : Array.isArray(workflow.on) ? workflow.on : Object.keys(workflow.on ?? {});
    if (name === "candidate.yml" || name === "release.yml") {
      const expected = name === "candidate.yml" ? ["workflow_call", "workflow_dispatch"] : ["push", "workflow_dispatch"];
      if (JSON.stringify([...events].sort()) !== JSON.stringify(expected)) {
        failures.push(`${name}: cross-platform workflows require explicit rehearsal or release entry points`);
      }
      if (name === "release.yml" && JSON.stringify(workflow.on?.push) !== JSON.stringify({ tags: ["v*"] })) {
        failures.push(`${name}: automatic releases must be restricted to v* tag pushes`);
      }
      continue;
    }
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      const label = `${name}/${jobName}`;
      // Only release.yml may call the complete candidate. Unknown reusable
      // workflows cannot prove Linux x64 scheduling from this repository.
      if (job.uses) {
        failures.push(`${label}: routine workflows must not call reusable workflows`);
        continue;
      }
      const matrix = job.strategy?.matrix;
      let runners;
      if (matrix !== undefined) {
        // The repository uses explicit include tuples; fail closed on dynamic
        // or expanded axes rather than pretending to evaluate GitHub expressions.
        if (!matrix || typeof matrix !== "object"
          || JSON.stringify(Object.keys(matrix)) !== JSON.stringify(["include"])
          || !Array.isArray(matrix.include) || matrix.include.length === 0) {
          failures.push(`${label}: runner matrices must use explicit include tuples`);
          continue;
        }
        runners = matrix.include.map((row) => job["runs-on"] === "${{ matrix.runner }}" ? row.runner : job["runs-on"]);
      } else {
        runners = [job["runs-on"]];
      }
      if (!runners.every((runner) => routineRunners.has(runner))) {
        failures.push(`${label}: routine jobs must use the approved Linux x64 runners`);
      }
    }
  }
  return failures;
}
