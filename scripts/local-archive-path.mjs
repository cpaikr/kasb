import { posix, win32 } from "node:path";

export function localArchivePath(archive) {
  const path = /^(?:[A-Za-z]:[\\/]|\\\\)/u.test(archive) ? win32 : posix;
  return { directory: path.dirname(archive), name: path.basename(archive) };
}

export function localTarInvocation(archive, flags, trailingArgs = []) {
  const { directory, name } = localArchivePath(archive);
  return {
    args: [flags, name, ...trailingArgs],
    options: { cwd: directory },
  };
}
