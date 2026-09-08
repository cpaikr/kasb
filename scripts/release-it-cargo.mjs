import { readFileSync } from "node:fs";
import { Plugin } from "release-it";
import { workspaceVersion } from "./release-version.mjs";

// Cargo remains the sole authority; release-it owns preparation and Git delivery.
export default class CargoVersion extends Plugin {
  getLatestVersion() {
    return workspaceVersion(readFileSync("Cargo.toml", "utf8"));
  }

  async bump(version) {
    // Run through release-it so --dry-run cannot mutate source or lockfiles.
    await this.exec("node scripts/release-version.mjs sync ${version}", { options: { external: true }, context: { version } });
  }
}
