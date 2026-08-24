import { posix, win32 } from "node:path";

export function localArchivePath(archive) {
  const path = pathApi(archive);
  return { directory: path.dirname(archive), name: path.basename(archive) };
}

export function localTarDestination(archive, destination) {
  const path = pathApi(archive);
  return path.relative(path.dirname(archive), destination).split("\\").join("/") || ".";
}

export function localTarInvocation(archive, flags, trailingArgs = []) {
  const { directory, name } = localArchivePath(archive);
  return {
    args: [flags, name, ...trailingArgs],
    options: { cwd: directory },
  };
}

function pathApi(path) {
  return /^(?:[A-Za-z]:[\\/]|\\\\)/u.test(path) ? win32 : posix;
}
