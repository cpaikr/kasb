import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadReleaseContract, releaseTag, repositoryRoot } from "./release-contract.mjs";

const checkOnly = process.argv.includes("--check");
const contract = await loadReleaseContract();
const outputs = new Map([
  [resolve(repositoryRoot, "installers/install.sh"), shellInstaller(contract)],
  [resolve(repositoryRoot, "installers/install.ps1"), powershellInstaller(contract)],
]);
const stale = [];
for (const [path, expected] of outputs) {
  let actual;
  try {
    actual = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (actual?.replaceAll("\r\n", "\n") === expected) continue;
  if (checkOnly) stale.push(path.slice(repositoryRoot.length + 1));
  else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected, { mode: path.endsWith(".sh") ? 0o755 : 0o644 });
  }
}
if (stale.length) {
  throw new Error(`Generated release assets are stale:\n${stale.map((path) => `- ${path}`).join("\n")}`);
}
console.log(checkOnly ? "release installers are current" : "generated release installers");

function shellInstaller({ version, release, targets, manifest }) {
  const archiveEntryArguments = release.archiveEntries
    .map((entry) => entry === "{executable}" ? '"${executable}"' : `'${entry.replaceAll("'", `'\\''`)}'`)
    .join(" ");
  const cases = targets
    .filter((target) => target.npmPlatform !== "win32")
    .map((target) => {
      const os = target.npmPlatform === "darwin" ? "Darwin" : "Linux";
      const arch = target.npmArch === "x64" ? "x86_64" : `arm64|${os}:aarch64`;
      return `  ${os}:${arch}) target='${target.releaseTarget}'; archive='${target.archiveName}'; executable='${target.executableName}' ;;`;
    })
    .join("\n");
  return `#!/bin/sh
set -eu

# Generated from Cargo.toml and native-targets.json. Do not edit.
version='${version}'
tag='${releaseTag(release, version)}'
repository='${release.repository}'
checksum_asset='${release.checksumAsset}'
receipt_name='${release.receiptFile}'
api_base=https://api.github.com
download_base=https://github.com
if [ -n "\${KASB_INSTALLER_API_BASE:-}\${KASB_INSTALLER_DOWNLOAD_BASE:-}" ]; then
  [ "\${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] || { echo 'kasb: release URL overrides are test-only' >&2; exit 1; }
  api_base=\${KASB_INSTALLER_API_BASE:-\${api_base}}
  download_base=\${KASB_INSTALLER_DOWNLOAD_BASE:-\${download_base}}
fi
os=\${KASB_INSTALLER_TEST_OS:-\$(uname -s)}
arch=\${KASB_INSTALLER_TEST_ARCH:-\$(uname -m)}
if [ -n "\${KASB_INSTALLER_TEST_OS:-}\${KASB_INSTALLER_TEST_ARCH:-}" ] && [ "\${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" != 1 ]; then
  echo 'kasb: platform overrides are test-only' >&2
  exit 1
fi
expanded_limit=${release.archiveLimitBytes}
total_expanded_limit=$((expanded_limit * 2))
if [ -n "\${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES:-}" ]; then
  [ "\${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] || { echo 'kasb: extraction limit override is test-only' >&2; exit 1; }
  case "\${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES}" in ''|*[!0-9]*) echo 'kasb: invalid test extraction limit' >&2; exit 1 ;; esac
  [ "\${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES}" -gt 0 ] || { echo 'kasb: invalid test extraction limit' >&2; exit 1; }
  [ "\${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES}" -le ${release.archiveLimitBytes} ] || { echo 'kasb: invalid test extraction limit' >&2; exit 1; }
  expanded_limit=\${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES}
fi
if [ -n "\${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES:-}" ]; then
  [ "\${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] || { echo 'kasb: total extraction limit override is test-only' >&2; exit 1; }
  case "\${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES}" in ''|*[!0-9]*) echo 'kasb: invalid test total extraction limit' >&2; exit 1 ;; esac
  [ "\${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES}" -gt 0 ] || { echo 'kasb: invalid test total extraction limit' >&2; exit 1; }
  [ "\${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES}" -le $(( ${release.archiveLimitBytes} * 2 )) ] || { echo 'kasb: invalid test total extraction limit' >&2; exit 1; }
  total_expanded_limit=\${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES}
fi

if [ "\${os}" = Linux ] && [ -z "\${KASB_INSTALLER_TEST_OS:-}\${KASB_INSTALLER_TEST_ARCH:-}" ]; then
  glibc_identity=\$(getconf GNU_LIBC_VERSION 2>/dev/null || true)
  case "\${glibc_identity}" in glibc\\ *) glibc_version=\${glibc_identity#glibc } ;; *) echo 'kasb: standalone Linux requires glibc' >&2; exit 1 ;; esac
  awk -v have="\${glibc_version}" -v minimum='${manifest.minimumGlibcVersion}' 'BEGIN { split(have, h, "."); split(minimum, m, "."); exit !((h[1] + 0 > m[1] + 0) || (h[1] + 0 == m[1] + 0 && h[2] + 0 >= m[2] + 0)) }' || { echo 'kasb: standalone Linux glibc is below ${manifest.minimumGlibcVersion}' >&2; exit 1; }
fi

case "\${os}:\${arch}" in
${cases}
  *) echo "kasb: unsupported standalone target \${os}/\${arch}" >&2; exit 1 ;;
esac

install_dir=\${KASB_INSTALL_DIR:-"\${HOME}/.local/bin"}
safe_install_dir=\$(printf '%s' "\${install_dir}" | LC_ALL=C tr -d '\\001-\\037\\177')
[ "\${install_dir}" = "\${safe_install_dir}" ] || { echo 'kasb: installation path contains unsupported control characters' >&2; exit 1; }
mkdir -p "\${install_dir}"
case "\${install_dir}" in
  /*) install_dir=\$(cd -P "\${install_dir}" && pwd) ;;
  *) install_dir=\$(cd -P "./\${install_dir}" && pwd) ;;
esac
destination="\${install_dir}/\${executable}"
receipt="\${install_dir}/\${receipt_name}"
safe_destination=\$(printf '%s' "\${destination}" | LC_ALL=C tr -d '\\001-\\037\\177')
[ "\${destination}" = "\${safe_destination}" ] || { echo 'kasb: installation path contains unsupported control characters' >&2; exit 1; }
for existing_path in "\${destination}" "\${receipt}"; do
  if [ -L "\${existing_path}" ] || { [ -e "\${existing_path}" ] && [ ! -f "\${existing_path}" ]; }; then
    echo 'kasb: pre-existing installation paths must be regular files' >&2
    exit 1
  fi
done
work=\$(mktemp -d "\${install_dir}/.kasb-install.XXXXXX")
backup="\${work}/previous-kasb"
receipt_backup="\${work}/previous-receipt"
committed=0
publish_started=0
had_destination=0
had_receipt=0
decompressor_pid=
identity_pid=
identity_reader_pid=
cleanup() {
  status=\$?
  trap - EXIT HUP INT TERM
  for child_pid in "\${decompressor_pid}" "\${identity_pid}" "\${identity_reader_pid}"; do
    if [ -n "\${child_pid}" ]; then kill "\${child_pid}" 2>/dev/null || true; fi
  done
  preserve_work=0
  if [ "\${committed}" -ne 1 ] && [ "\${publish_started}" -eq 1 ]; then
    if [ "\${status}" -eq 0 ]; then status=1; fi
    rollback_ok=1
    if [ "\${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] && [ "\${KASB_INSTALLER_TEST_FAIL_ROLLBACK:-0}" = 1 ]; then
      rollback_ok=0
    else
      if [ "\${had_destination}" -eq 1 ]; then
        if [ -f "\${backup}" ] || [ -L "\${backup}" ]; then
          if rm -f "\${destination}" && [ ! -e "\${destination}" ] && [ ! -L "\${destination}" ]; then
            mv "\${backup}" "\${destination}" || rollback_ok=0
          else
            rollback_ok=0
          fi
        elif [ ! -f "\${destination}" ]; then
          rollback_ok=0
        fi
      else
        rm -f "\${destination}" || rollback_ok=0
      fi
      if [ "\${had_receipt}" -eq 1 ]; then
        if [ -f "\${receipt_backup}" ] || [ -L "\${receipt_backup}" ]; then
          if rm -f "\${receipt}" && [ ! -e "\${receipt}" ] && [ ! -L "\${receipt}" ]; then
            mv "\${receipt_backup}" "\${receipt}" || rollback_ok=0
          else
            rollback_ok=0
          fi
        elif [ ! -f "\${receipt}" ]; then
          rollback_ok=0
        fi
      else
        rm -f "\${receipt}" || rollback_ok=0
      fi
    fi
    if [ "\${rollback_ok}" -ne 1 ]; then
      preserve_work=1
      echo "kasb: installation rollback was incomplete; recovery files remain in \${work}" >&2
    fi
  fi
  if [ "\${preserve_work}" -ne 1 ]; then rm -rf "\${work}"; fi
  exit "\${status}"
}
trap cleanup EXIT HUP INT TERM

fetch() {
  protocols='=https'
  case "$1" in
    https://*) ;;
    http://*) [ "\${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] || { echo 'kasb: refused an insecure release URL' >&2; return 1; }; protocols='=https,http' ;;
    *) echo 'kasb: refused an invalid release URL' >&2; return 1 ;;
  esac
  curl --fail --silent --show-error --location --proto "\${protocols}" --proto-redir "\${protocols}" \\
    --connect-timeout ${release.connectTimeoutSeconds} --max-time "\$4" \\
    --speed-limit 1 --speed-time ${release.transferStallTimeoutSeconds} \\
    --max-redirs ${release.redirectLimit} --max-filesize "\$3" --output "\$2" "\$1"
}

sync_file() {
  if sync -f "\$1" 2>/dev/null; then return 0; fi
  sync
}

parse_release_metadata() {
  awk -v expected_tag="\${tag}" -v expected_archive="\${archive}" -v expected_archive_url="https://github.com/\${repository}/releases/download/\${tag}/\${archive}" \
      -v expected_checksum="\${checksum_asset}" -v expected_checksum_url="https://github.com/\${repository}/releases/download/\${tag}/\${checksum_asset}" '
  function fail() { invalid = 1; position = length(input) + 1 }
  function whitespace( character) {
    while (position <= length(input)) {
      character = substr(input, position, 1)
      if (character != " " && character != "\\t" && character != "\\r" && character != "\\n") break
      position += 1
    }
  }
  function string_value( output, character, escape, digits) {
    whitespace()
    if (substr(input, position, 1) != "\\\"") { fail(); return "" }
    position += 1; output = ""; string_plain = 1
    while (position <= length(input)) {
      character = substr(input, position, 1)
      if (character == "\\\"") { position += 1; return output }
      if (character == "\\\\") {
        string_plain = 0; position += 1; escape = substr(input, position, 1)
        if (escape == "u") {
          digits = substr(input, position + 1, 4)
          if (digits !~ /^[0-9a-fA-F]{4}$/) { fail(); return "" }
          position += 5
        } else if (escape == "\\\"" || escape == "\\\\" || escape == "/" || escape ~ /^[bfnrt]$/) { position += 1 }
        else { fail(); return "" }
      } else {
        if (character ~ /[[:cntrl:]]/) { fail(); return "" }
        output = output character; position += 1
      }
    }
    fail(); return ""
  }
  function number_value( start, character, value) {
    whitespace(); start = position
    while (position <= length(input)) {
      character = substr(input, position, 1)
      if (character !~ /[0-9eE+.-]/) break
      position += 1
    }
    value = substr(input, start, position - start)
    if (value !~ /^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$/) fail()
    return value
  }
  function skip_value(depth, character, key) {
    if (depth > 64) { fail(); return }
    whitespace(); character = substr(input, position, 1)
    if (character == "\\\"") { string_value(); return }
    if (character == "{") {
      position += 1; whitespace()
      if (substr(input, position, 1) == "}") { position += 1; return }
      while (!invalid) {
        key = string_value(); whitespace()
        if (substr(input, position, 1) != ":") { fail(); return }
        position += 1; skip_value(depth + 1); whitespace(); character = substr(input, position, 1)
        if (character == "}") { position += 1; return }
        if (character != ",") { fail(); return }
        position += 1
      }
      return
    }
    if (character == "[") {
      position += 1; whitespace()
      if (substr(input, position, 1) == "]") { position += 1; return }
      while (!invalid) {
        skip_value(depth + 1); whitespace(); character = substr(input, position, 1)
        if (character == "]") { position += 1; return }
        if (character != ",") { fail(); return }
        position += 1
      }
      return
    }
    if (substr(input, position, 4) == "true" || substr(input, position, 4) == "null") { position += 4; return }
    if (substr(input, position, 5) == "false") { position += 5; return }
    number_value()
  }
  function boolean_value() {
    whitespace()
    if (substr(input, position, 4) == "true") { position += 4; return 1 }
    if (substr(input, position, 5) == "false") { position += 5; return 0 }
    fail(); return -1
  }
  function asset_object( character, key, plain, value, name, name_count, name_plain, url, url_count, url_plain, size, size_count) {
    whitespace()
    if (substr(input, position, 1) != "{") { fail(); return }
    position += 1; whitespace(); name = ""; name_count = 0; name_plain = 0; url = ""; url_count = 0; url_plain = 0; size = -1; size_count = 0
    if (substr(input, position, 1) != "}") {
      while (!invalid) {
        key = string_value(); plain = string_plain; whitespace()
        if (!plain || substr(input, position, 1) != ":") { fail(); return }
        position += 1
        if (key == "name") { value = string_value(); name_plain = string_plain; name = value; name_count += 1 }
        else if (key == "browser_download_url") { value = string_value(); url_plain = string_plain; url = value; url_count += 1 }
        else if (key == "size") { value = number_value(); if (value !~ /^[0-9]+$/) fail(); size = value; size_count += 1 }
        else skip_value(2)
        whitespace(); character = substr(input, position, 1)
        if (character == "}") break
        if (character != ",") { fail(); return }
        position += 1
      }
    }
    if (substr(input, position, 1) != "}") { fail(); return }
    position += 1
    if (name_count != 1 || !name_plain) return
    if (name == expected_archive) {
      archive_matches += 1
      if (url_count == 1 && url_plain && url == expected_archive_url) archive_url_matches += 1
      if (size_count == 1) archive_size = size
    }
    if (name == expected_checksum) {
      checksum_matches += 1
      if (url_count == 1 && url_plain && url == expected_checksum_url) checksum_url_matches += 1
      if (size_count == 1) checksum_size = size
    }
  }
  function assets_value( character) {
    whitespace()
    if (substr(input, position, 1) != "[") { fail(); return }
    position += 1; whitespace()
    if (substr(input, position, 1) == "]") { position += 1; return }
    while (!invalid) {
      asset_object(); whitespace(); character = substr(input, position, 1)
      if (character == "]") { position += 1; return }
      if (character != ",") { fail(); return }
      position += 1
    }
  }
  function root_object( character, key, plain, value) {
    whitespace()
    if (substr(input, position, 1) != "{") { fail(); return }
    position += 1; whitespace()
    if (substr(input, position, 1) == "}") { fail(); return }
    while (!invalid) {
      key = string_value(); plain = string_plain; whitespace()
      if (!plain || substr(input, position, 1) != ":") { fail(); return }
      position += 1
      if (key == "immutable") { immutable_count += 1; immutable_value = boolean_value() }
      else if (key == "draft") { draft_count += 1; draft_value = boolean_value() }
      else if (key == "prerelease") { prerelease_count += 1; prerelease_value = boolean_value() }
      else if (key == "tag_name") { value = string_value(); tag_count += 1; if (string_plain && value == expected_tag) tag_matches += 1 }
      else if (key == "assets") { assets_count += 1; assets_value() }
      else skip_value(1)
      whitespace(); character = substr(input, position, 1)
      if (character == "}") { position += 1; return }
      if (character != ",") { fail(); return }
      position += 1
    }
  }
  { input = input \$0 "\\n" }
  END {
    position = 1; archive_size = -1; checksum_size = -1
    root_object(); whitespace()
    if (invalid || position <= length(input)) exit 2
    print immutable_count + 0, immutable_value + 0, draft_count + 0, draft_value + 0, prerelease_count + 0, prerelease_value + 0, tag_count + 0, tag_matches + 0, assets_count + 0, archive_matches + 0, archive_url_matches + 0, archive_size, checksum_matches + 0, checksum_url_matches + 0, checksum_size
  }' "\$1"
}

metadata="\${work}/release.json"
fetch "\${api_base}/repos/\${repository}/releases/tags/\${tag}" "\${metadata}" ${release.metadataLimitBytes} ${release.requestTimeoutSeconds}
metadata_fields=\$(parse_release_metadata "\${metadata}") || { echo 'kasb: release metadata is invalid JSON or has an invalid shape' >&2; exit 1; }
# The parser emits validated integer fields for intentional positional splitting.
# shellcheck disable=SC2086
set -- \${metadata_fields}
[ "\$#" -eq 15 ] || { echo 'kasb: release metadata is incomplete' >&2; exit 1; }
[ "\$1" -eq 1 ] && [ "\$2" -eq 1 ] || { echo 'kasb: release is not immutable' >&2; exit 1; }
[ "\$3" -eq 1 ] && [ "\$4" -eq 0 ] && [ "\$5" -eq 1 ] && [ "\$6" -eq 0 ] || { echo 'kasb: release is not a production release' >&2; exit 1; }
[ "\$7" -eq 1 ] && [ "\$8" -eq 1 ] || { echo 'kasb: release tag identity mismatch' >&2; exit 1; }
[ "\$9" -eq 1 ] || { echo 'kasb: release asset list is missing or duplicated' >&2; exit 1; }
[ "\${10}" -eq 1 ] || { echo 'kasb: release archive is missing or duplicated' >&2; exit 1; }
[ "\${11}" -eq 1 ] || { echo 'kasb: release archive URL identity mismatch' >&2; exit 1; }
archive_size=\${12}
[ "\${13}" -eq 1 ] || { echo 'kasb: release checksum manifest is missing or duplicated' >&2; exit 1; }
[ "\${14}" -eq 1 ] || { echo 'kasb: release checksum URL identity mismatch' >&2; exit 1; }
checksum_size=\${15}
case "\${archive_size}" in ''|*[!0-9]*) echo 'kasb: release archive metadata has an invalid size' >&2; exit 1 ;; esac
case "\${checksum_size}" in ''|*[!0-9]*) echo 'kasb: release checksum metadata has an invalid size' >&2; exit 1 ;; esac
[ "\${archive_size}" -gt 0 ] && [ "\${archive_size}" -le ${release.archiveLimitBytes} ] || { echo 'kasb: release archive metadata exceeds size limit' >&2; exit 1; }
[ "\${checksum_size}" -gt 0 ] && [ "\${checksum_size}" -le ${release.metadataLimitBytes} ] || { echo 'kasb: release checksum metadata exceeds size limit' >&2; exit 1; }

archive_path="\${work}/\${archive}"
checksums="\${work}/\${checksum_asset}"
release_download="\${download_base}/\${repository}/releases/download/\${tag}"
fetch "\${release_download}/\${archive}" "\${archive_path}" ${release.archiveLimitBytes} ${release.archiveRequestTimeoutSeconds}
fetch "\${release_download}/\${checksum_asset}" "\${checksums}" ${release.metadataLimitBytes} ${release.requestTimeoutSeconds}
[ "\$(wc -c < "\${archive_path}" | tr -d ' ')" -eq "\${archive_size}" ] || { echo 'kasb: release archive size identity mismatch' >&2; exit 1; }
[ "\$(wc -c < "\${checksums}" | tr -d ' ')" -eq "\${checksum_size}" ] || { echo 'kasb: release checksum size identity mismatch' >&2; exit 1; }
expected=\$(awk -v name="\${archive}" '\$2 == name { print \$1 }' "\${checksums}")
case "\${expected}" in ''|*[!0-9a-fA-F]* ) echo 'kasb: invalid or missing archive checksum' >&2; exit 1 ;; esac
[ "\${#expected}" -eq 64 ] || { echo 'kasb: invalid archive checksum length' >&2; exit 1; }
expected=\$(printf '%s' "\${expected}" | LC_ALL=C tr 'A-F' 'a-f')
if command -v sha256sum >/dev/null 2>&1; then
  actual=\$(sha256sum "\${archive_path}" | awk '{print \$1}')
else
  actual=\$(shasum -a 256 "\${archive_path}" | awk '{print \$1}')
fi
[ "\${actual}" = "\${expected}" ] || { echo 'kasb: archive checksum mismatch' >&2; exit 1; }

command -v gzip >/dev/null 2>&1 || { echo 'kasb: gzip is required to inspect the release archive safely' >&2; exit 1; }
expanded_archive="\${work}/archive.tar"
archive_pipe="\${work}/archive.pipe"
mkfifo "\${archive_pipe}"
gzip -dc "\${archive_path}" > "\${archive_pipe}" 2>/dev/null &
decompressor_pid=\$!
head -c \$((total_expanded_limit + 1)) < "\${archive_pipe}" > "\${expanded_archive}"
if wait "\${decompressor_pid}"; then decompressor_ok=1; else decompressor_ok=0; fi
decompressor_pid=
rm -f "\${archive_pipe}"
[ "\$(wc -c < "\${expanded_archive}" | tr -d ' ')" -le "\${total_expanded_limit}" ] || { echo 'kasb: expanded release archive exceeds total size limit' >&2; exit 1; }
[ "\${decompressor_ok}" -eq 1 ] || { echo 'kasb: release archive compression is invalid' >&2; exit 1; }
staged="\${work}/kasb.new"
entry_counts=\$(tar -tf "\${expanded_archive}" | awk -v name="\${executable}" '{ total += 1; if (\$0 == name) executable += 1 } END { print total + 0, executable + 0 }')
# The archive counter emits two integers for intentional positional splitting.
# shellcheck disable=SC2086
set -- \${entry_counts}
[ "\$#" -eq 2 ] && [ "\$1" -eq ${release.archiveEntries.length} ] && [ "\$2" -eq 1 ] || { echo 'kasb: archive entry set or executable identity is invalid' >&2; exit 1; }
expected_archive_entries="\${work}/expected-archive-entries"
observed_archive_entries="\${work}/observed-archive-entries"
printf '%s\\n' ${archiveEntryArguments} | LC_ALL=C sort > "\${expected_archive_entries}"
tar -tf "\${expanded_archive}" | LC_ALL=C sort > "\${observed_archive_entries}"
cmp -s "\${expected_archive_entries}" "\${observed_archive_entries}" || { echo 'kasb: archive entry set or executable identity is invalid' >&2; exit 1; }
entry_description=\$(tar -tvf "\${expanded_archive}" "\${executable}")
case "\${entry_description}" in -*) ;; *) echo 'kasb: archive executable entry is not a regular file' >&2; exit 1 ;; esac
tar -xOf "\${expanded_archive}" "\${executable}" | head -c \$((expanded_limit + 1)) > "\${staged}"
[ "\$(wc -c < "\${staged}" | tr -d ' ')" -le "\${expanded_limit}" ] || { echo 'kasb: expanded release executable exceeds size limit' >&2; exit 1; }
chmod 755 "\${staged}"
reported_path="\${work}/reported-version"
reported_pipe="\${work}/reported-version.pipe"
reported_done="\${work}/reported-version.done"
mkfifo "\${reported_pipe}"
(head -c 129 < "\${reported_pipe}" > "\${reported_path}"; : > "\${reported_done}") &
identity_reader_pid=\$!
"\${staged}" --version > "\${reported_pipe}" 2>/dev/null &
identity_pid=\$!
identity_waits=0
while kill -0 "\${identity_pid}" 2>/dev/null; do
  identity_waits=\$((identity_waits + 1))
  if [ "\${identity_waits}" -ge 50 ]; then
    kill "\${identity_pid}" 2>/dev/null || true
    wait "\${identity_pid}" 2>/dev/null || true
    kill "\${identity_reader_pid}" 2>/dev/null || true
    wait "\${identity_reader_pid}" 2>/dev/null || true
    identity_pid=
    identity_reader_pid=
    echo 'kasb: archive executable identity check timed out' >&2
    exit 1
  fi
  sleep 0.1
done
identity_status=0
wait "\${identity_pid}" || identity_status=\$?
identity_pid=
while [ ! -f "\${reported_done}" ]; do
  identity_waits=\$((identity_waits + 1))
  if [ "\${identity_waits}" -ge 50 ]; then
    kill "\${identity_reader_pid}" 2>/dev/null || true
    wait "\${identity_reader_pid}" 2>/dev/null || true
    identity_reader_pid=
    echo 'kasb: archive executable identity output pipe did not close within five seconds' >&2
    exit 1
  fi
  sleep 0.1
done
if ! wait "\${identity_reader_pid}"; then echo 'kasb: archive executable identity output could not be read' >&2; exit 1; fi
identity_reader_pid=
rm -f "\${reported_pipe}"
[ "\$(wc -c < "\${reported_path}" | tr -d ' ')" -le 128 ] || { echo 'kasb: archive executable identity output is too large' >&2; exit 1; }
[ "\${identity_status}" -eq 0 ] || { echo 'kasb: archive executable identity check failed' >&2; exit 1; }
reported=\$(cat "\${reported_path}")
[ "\${reported}" = "kasb \${version}" ] || { echo 'kasb: archive executable version mismatch' >&2; exit 1; }
binary_digest=\$(if command -v sha256sum >/dev/null 2>&1; then sha256sum "\${staged}"; else shasum -a 256 "\${staged}"; fi | awk '{print \$1}')
escaped_destination=\$(printf '%s' "\${destination}" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
receipt_staged="\${work}/receipt.new"
printf '%s\\n' '{"schemaVersion":${release.receiptSchemaVersion},"manager":"standalone","version":"'"\${version}"'","target":"'"\${target}"'","executable":"'"\${escaped_destination}"'","releaseRepository":"'"\${repository}"'","releaseTag":"'"\${tag}"'","assetName":"'"\${archive}"'","sha256":"'"\${binary_digest}"'"}' > "\${receipt_staged}"
sync_file "\${staged}"
sync_file "\${receipt_staged}"

if [ -e "\${destination}" ] || [ -L "\${destination}" ]; then had_destination=1; fi
if [ -e "\${receipt}" ] || [ -L "\${receipt}" ]; then had_receipt=1; fi
publish_started=1
if [ "\${had_destination}" -eq 1 ]; then mv "\${destination}" "\${backup}"; fi
if [ "\${had_receipt}" -eq 1 ]; then mv "\${receipt}" "\${receipt_backup}"; fi
if [ "\${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] && [ "\${KASB_INSTALLER_TEST_INTERRUPT_AFTER_BACKUP:-0}" = 1 ]; then kill -TERM "\$\$"; fi
mv "\${staged}" "\${destination}"
if [ "\${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] && [ "\${KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH:-0}" = 1 ]; then false; fi
mv "\${receipt_staged}" "\${receipt}"
committed=1
echo "Installed kasb \${version} at \${destination}"
`;
}

function powershellInstaller({ version, release, targets, manifest }) {
  const targetCases = targets
    .map((target) => {
      const platform = target.npmPlatform === "win32" ? "Win32NT" : target.npmPlatform === "darwin" ? "Unix:OSX" : "Unix:Linux";
      const arch = target.npmArch === "x64" ? "X64" : "Arm64";
      const archiveEntries = target.archiveEntries.map((entry) => `'${entry.replaceAll("'", "''")}'`).join(", ");
      return `  "${platform}:${arch}" { $Target = "${target.releaseTarget}"; $Archive = "${target.archiveName}"; $Executable = "${target.executableName}"; $ArchiveEntries = @(${archiveEntries}) }`;
    })
    .join("\n");
  return `#requires -Version 5.1
# Generated from Cargo.toml and native-targets.json. Do not edit.
$ErrorActionPreference = "Stop"
$Version = "${version}"
$Tag = "${releaseTag(release, version)}"
$Repository = "${release.repository}"
$ChecksumAsset = "${release.checksumAsset}"
$ReceiptName = "${release.receiptFile}"
$ApiBase = "https://api.github.com"
$DownloadBase = "https://github.com"
if ($env:KASB_INSTALLER_API_BASE -or $env:KASB_INSTALLER_DOWNLOAD_BASE) {
  if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -ne '1') { throw "kasb: release URL overrides are test-only" }
  if ($env:KASB_INSTALLER_API_BASE) { $ApiBase = $env:KASB_INSTALLER_API_BASE }
  if ($env:KASB_INSTALLER_DOWNLOAD_BASE) { $DownloadBase = $env:KASB_INSTALLER_DOWNLOAD_BASE }
}
$RunningWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$RunningMacOS = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)
if (($env:KASB_INSTALLER_TEST_PLATFORM -or $env:KASB_INSTALLER_TEST_ARCH) -and $env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -ne '1') { throw "kasb: platform overrides are test-only" }
$Platform = if ($env:KASB_INSTALLER_TEST_PLATFORM) { $env:KASB_INSTALLER_TEST_PLATFORM } elseif ($RunningWindows) { "Win32NT" } elseif ($RunningMacOS) { "Unix:OSX" } else { "Unix:Linux" }
$Architecture = if ($env:KASB_INSTALLER_TEST_ARCH) { $env:KASB_INSTALLER_TEST_ARCH } else { [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() }
if ($Platform -eq "Unix:Linux" -and -not $env:KASB_INSTALLER_TEST_PLATFORM -and -not $env:KASB_INSTALLER_TEST_ARCH) {
  $GlibcIdentity = (& getconf GNU_LIBC_VERSION 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $GlibcIdentity -notmatch '^glibc ([0-9]+\.[0-9]+)') { throw "kasb: standalone Linux requires glibc" }
  if ([version]$Matches[1] -lt [version]'${manifest.minimumGlibcVersion}') { throw "kasb: standalone Linux glibc is below ${manifest.minimumGlibcVersion}" }
}
switch ("$Platform\`:$Architecture") {
${targetCases}
  default { throw "kasb: unsupported standalone target $Platform/$Architecture" }
}
$InstallDir = if ($env:KASB_INSTALL_DIR) { $env:KASB_INSTALL_DIR } elseif ($RunningWindows) { Join-Path $env:LOCALAPPDATA "kasb\\bin" } else { Join-Path $HOME ".local/bin" }
$Destination = Join-Path $InstallDir $Executable
$Receipt = Join-Path $InstallDir $ReceiptName
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$Work = Join-Path $InstallDir (".kasb-install." + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$Backup = Join-Path $Work "previous-kasb"
$ReceiptBackup = Join-Path $Work "previous-receipt"
$Committed = $false
$PublishStarted = $false
$HadDestination = $false
$HadReceipt = $false

Add-Type -AssemblyName System.Net.Http
function Save-BoundedReleaseFile([string]$Uri, [string]$Path, [long]$Limit, [int]$TimeoutSeconds) {
  $Parsed = [uri]$Uri
  $AllowInsecureTestUrl = $env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $Parsed.Scheme -eq 'http'
  if ($Parsed.Scheme -ne 'https' -and -not $AllowInsecureTestUrl) { throw "kasb: refused an insecure release URL" }
  $Handler = New-Object System.Net.Http.HttpClientHandler
  $Handler.AllowAutoRedirect = $true
  $Handler.MaxAutomaticRedirections = ${release.redirectLimit}
  $Client = New-Object System.Net.Http.HttpClient($Handler)
  $Client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
  $Client.DefaultRequestHeaders.UserAgent.ParseAdd("kasb-installer/$Version")
  $Response = $null
  $ResponseStream = $null
  $Output = $null
  $Cancellation = New-Object System.Threading.CancellationTokenSource
  $Cancellation.CancelAfter([TimeSpan]::FromSeconds($TimeoutSeconds))
  try {
    $Response = $Client.GetAsync($Parsed, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead, $Cancellation.Token).GetAwaiter().GetResult()
    if (-not $Response.IsSuccessStatusCode) { throw "kasb: release request failed with HTTP $([int]$Response.StatusCode)" }
    $FinalUri = $Response.RequestMessage.RequestUri
    $FinalInsecureTestUrl = $env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $FinalUri.Scheme -eq 'http'
    if ($FinalUri.Scheme -ne 'https' -and -not $FinalInsecureTestUrl) { throw "kasb: refused an insecure release redirect" }
    if ($Response.Content.Headers.ContentLength -ne $null -and $Response.Content.Headers.ContentLength -gt $Limit) { throw "kasb: release response exceeds size limit" }
    $ResponseStream = $Response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $Output = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $Buffer = New-Object byte[] 65536
    [long]$Total = 0
    while ($true) {
      $ReadCancellation = [System.Threading.CancellationTokenSource]::CreateLinkedTokenSource($Cancellation.Token)
      $ReadCancellation.CancelAfter([TimeSpan]::FromSeconds(${release.transferStallTimeoutSeconds}))
      try {
        $Count = $ResponseStream.ReadAsync($Buffer, 0, $Buffer.Length, $ReadCancellation.Token).GetAwaiter().GetResult()
      } finally {
        $ReadCancellation.Dispose()
      }
      if ($Count -eq 0) { break }
      $Total += $Count
      if ($Total -gt $Limit) { throw "kasb: release response exceeds size limit" }
      $Output.Write($Buffer, 0, $Count)
    }
    $Output.Flush($true)
  } finally {
    if ($Output) { $Output.Dispose() }
    if ($ResponseStream) { $ResponseStream.Dispose() }
    if ($Response) { $Response.Dispose() }
    $Cancellation.Dispose()
    $Client.Dispose()
    $Handler.Dispose()
  }
}
function Read-Exactly([System.IO.Stream]$Stream, [byte[]]$Buffer, [int]$Count) {
  [int]$Offset = 0
  while ($Offset -lt $Count) {
    $Read = $Stream.Read($Buffer, $Offset, $Count - $Offset)
    if ($Read -eq 0) { throw "kasb: truncated release archive" }
    $Offset += $Read
  }
}
function Flush-DurableFile([string]$Path) {
  $Stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::Read)
  try { $Stream.Flush($true) } finally { $Stream.Dispose() }
}
function Get-Sha256Hex([string]$Path) {
  $Stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $Algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      $Digest = $Algorithm.ComputeHash($Stream)
      return ([System.BitConverter]::ToString($Digest)).Replace('-', '').ToLowerInvariant()
    } finally {
      $Algorithm.Dispose()
    }
  } finally {
    $Stream.Dispose()
  }
}
function Test-JsonInteger([object]$Value) {
  return $Value -is [byte] -or $Value -is [sbyte] -or $Value -is [int16] -or $Value -is [uint16] -or $Value -is [int32] -or $Value -is [uint32] -or $Value -is [int64] -or $Value -is [uint64]
}
function Test-AnyPath([string]$Path) {
  return [System.IO.File]::Exists($Path) -or [System.IO.Directory]::Exists($Path)
}
function Remove-ExactFile([string]$Path) {
  if ([System.IO.Directory]::Exists($Path)) { throw "kasb: replacement destination is not a regular file" }
  if ([System.IO.File]::Exists($Path)) { [System.IO.File]::Delete($Path) }
  if (Test-AnyPath $Path) { throw "kasb: replacement destination could not be removed" }
}
function Move-ExactFile([string]$Source, [string]$Destination) {
  if (-not [System.IO.File]::Exists($Source)) { throw "kasb: replacement source is missing" }
  if (Test-AnyPath $Destination) { throw "kasb: replacement destination still exists" }
  [System.IO.File]::Move($Source, $Destination)
}
function Test-BoundedExecutableIdentity([string]$Path, [string]$Expected) {
  $Info = New-Object System.Diagnostics.ProcessStartInfo
  $Info.FileName = $Path
  $Info.Arguments = "--version"
  $Info.UseShellExecute = $false
  $Info.CreateNoWindow = $true
  $Info.RedirectStandardInput = $true
  $Info.RedirectStandardOutput = $true
  $Info.RedirectStandardError = $true
  $Process = New-Object System.Diagnostics.Process
  $Process.StartInfo = $Info
  $Started = $false
  [byte[]]$Stdout = New-Object byte[] 129
  [byte[]]$Stderr = New-Object byte[] 129
  [int]$StdoutCount = 0
  [int]$StderrCount = 0
  $StdoutDone = $false
  $StderrDone = $false
  try {
    if (-not $Process.Start()) { throw "kasb: archive executable identity check failed" }
    $Started = $true
    $Process.StandardInput.Close()
    $StdoutTask = $Process.StandardOutput.BaseStream.ReadAsync($Stdout, 0, $Stdout.Length)
    $StderrTask = $Process.StandardError.BaseStream.ReadAsync($Stderr, 0, $Stderr.Length)
    $Deadline = [DateTime]::UtcNow.AddSeconds(5)
    while (-not ($Process.HasExited -and $StdoutDone -and $StderrDone)) {
      if (-not $StdoutDone -and $StdoutTask.IsCompleted) {
        $Count = $StdoutTask.GetAwaiter().GetResult()
        if ($Count -eq 0) { $StdoutDone = $true } else {
          $StdoutCount += $Count
          if ($StdoutCount -gt 128) { throw "kasb: archive executable identity output is too large" }
          $StdoutTask = $Process.StandardOutput.BaseStream.ReadAsync($Stdout, $StdoutCount, $Stdout.Length - $StdoutCount)
        }
      }
      if (-not $StderrDone -and $StderrTask.IsCompleted) {
        $Count = $StderrTask.GetAwaiter().GetResult()
        if ($Count -eq 0) { $StderrDone = $true } else {
          $StderrCount += $Count
          if ($StderrCount -gt 128) { throw "kasb: archive executable identity output is too large" }
          $StderrTask = $Process.StandardError.BaseStream.ReadAsync($Stderr, $StderrCount, $Stderr.Length - $StderrCount)
        }
      }
      if ([DateTime]::UtcNow -ge $Deadline) { throw "kasb: archive executable identity check timed out" }
      if (-not ($Process.HasExited -and $StdoutDone -and $StderrDone)) { Start-Sleep -Milliseconds 10 }
    }
    $Process.WaitForExit()
    if ($Process.ExitCode -ne 0) { throw "kasb: archive executable identity check failed" }
    $Reported = [System.Text.Encoding]::UTF8.GetString($Stdout, 0, $StdoutCount).Trim()
    if ($Reported -ne $Expected) { throw "kasb: archive executable version mismatch" }
  } finally {
    if ($Started -and -not $Process.HasExited) {
      try { $Process.Kill() } catch {}
      try { $Process.WaitForExit() } catch {}
    }
    $Process.Dispose()
  }
}
function Extract-TarExecutable([string]$ArchivePath, [string]$Name, [string[]]$ExpectedEntries, [string]$Destination, [long]$Limit) {
  $ArchiveInput = $null
  $Gzip = $null
  $Output = $null
  $Found = $false
  [int]$EntryCount = 0
  [long]$ExpandedBytes = 0
  $ObservedEntries = @()
  try {
    $ArchiveInput = [System.IO.File]::OpenRead($ArchivePath)
    $Gzip = New-Object System.IO.Compression.GzipStream($ArchiveInput, [System.IO.Compression.CompressionMode]::Decompress)
    $Header = New-Object byte[] 512
    $Discard = New-Object byte[] 65536
    while ($true) {
      Read-Exactly $Gzip $Header 512
      $AllZero = $true
      foreach ($Byte in $Header) { if ($Byte -ne 0) { $AllZero = $false; break } }
      if ($AllZero) { break }
      $EntryCount += 1
      if ($EntryCount -gt $ExpectedEntries.Count) { throw "kasb: release archive contains too many entries" }
      $EntryName = [System.Text.Encoding]::ASCII.GetString($Header, 0, 100).Trim([char]0)
      if ($ExpectedEntries -cnotcontains $EntryName -or $ObservedEntries -ccontains $EntryName) { throw "kasb: release archive contains an invalid entry set" }
      $ObservedEntries += $EntryName
      $SizeText = [System.Text.Encoding]::ASCII.GetString($Header, 124, 12).Trim([char]0, [char]32)
      if ($SizeText -notmatch '^[0-7]+$') { throw "kasb: invalid release archive entry size" }
      [long]$Size = [Convert]::ToInt64($SizeText, 8)
      $ExpandedBytes += $Size
      if ($Size -gt $Limit -or $ExpandedBytes -gt ($Limit * 2)) { throw "kasb: expanded release archive exceeds size limit" }
      $Type = [char]$Header[156]
      if ($EntryName -eq $Name) {
        if ($Found -or ($Type -ne [char]0 -and $Type -ne '0') -or $Size -le 0 -or $Size -gt $Limit) { throw "kasb: invalid release archive executable identity" }
        $Found = $true
        $Output = [System.IO.File]::Open($Destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      }
      [long]$Remaining = $Size
      while ($Remaining -gt 0) {
        $Chunk = [Math]::Min([long]$Discard.Length, $Remaining)
        Read-Exactly $Gzip $Discard ([int]$Chunk)
        if ($Output) { $Output.Write($Discard, 0, [int]$Chunk) }
        $Remaining -= $Chunk
      }
      if ($Output) { $Output.Flush($true); $Output.Dispose(); $Output = $null }
      $Padding = (512 - ($Size % 512)) % 512
      if ($Padding -gt 0) { Read-Exactly $Gzip $Discard ([int]$Padding) }
    }
    if (-not $Found) { throw "kasb: release archive executable is missing" }
    if ($EntryCount -ne $ExpectedEntries.Count) { throw "kasb: release archive contains an invalid entry set" }
  } finally {
    if ($Output) { $Output.Dispose() }
    if ($Gzip) { $Gzip.Dispose() }
    if ($ArchiveInput) { $ArchiveInput.Dispose() }
  }
}
try {
  foreach ($ExistingPath in @($Destination, $Receipt)) {
    $ExistingItem = Get-Item -Force -LiteralPath $ExistingPath -ErrorAction SilentlyContinue
    if ($null -ne $ExistingItem -and ($ExistingItem.PSIsContainer -or (($ExistingItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0))) {
      throw "kasb: pre-existing installation paths must be regular files"
    }
  }
  foreach ($Base in @($ApiBase, $DownloadBase)) {
    if ($Base -notmatch '^https://') {
      if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -ne '1' -or $Base -notmatch '^http://') { throw "kasb: refused an insecure release URL" }
    }
  }
  $MetadataPath = Join-Path $Work "release.json"
  Save-BoundedReleaseFile "$ApiBase/repos/$Repository/releases/tags/$Tag" $MetadataPath ${release.metadataLimitBytes} ${release.requestTimeoutSeconds}
  $Metadata = Get-Content -Raw -LiteralPath $MetadataPath | ConvertFrom-Json
  if ($Metadata.immutable -isnot [bool] -or $Metadata.immutable -ne $true) { throw "kasb: release is not immutable" }
  if ($Metadata.draft -isnot [bool] -or $Metadata.prerelease -isnot [bool]) { throw "kasb: release production flags are invalid" }
  if ($Metadata.draft -ne $false -or $Metadata.prerelease -ne $false) { throw "kasb: release is not a production release" }
  if ($Metadata.tag_name -isnot [string] -or $Metadata.tag_name -cne $Tag) { throw "kasb: release tag identity mismatch" }
  $ReleaseAssets = @($Metadata.assets)
  foreach ($Asset in $ReleaseAssets) {
    if ($null -eq $Asset -or $Asset.name -isnot [string]) { throw "kasb: release asset name identity is invalid" }
  }
  $CaseVariantAssets = @($ReleaseAssets | Where-Object {
    ($_.name -ieq $Archive -and $_.name -cne $Archive) -or
    ($_.name -ieq $ChecksumAsset -and $_.name -cne $ChecksumAsset)
  })
  if ($CaseVariantAssets.Count -ne 0) { throw "kasb: release asset name identity is invalid" }
  $ArchiveAssets = @($ReleaseAssets | Where-Object { $_.name -ceq $Archive })
  $ChecksumAssets = @($ReleaseAssets | Where-Object { $_.name -ceq $ChecksumAsset })
  if ($ArchiveAssets.Count -ne 1) { throw "kasb: release archive is missing or duplicated" }
  if ($ChecksumAssets.Count -ne 1) { throw "kasb: release checksum manifest is missing or duplicated" }
  $ArchiveAsset = $ArchiveAssets[0]
  $ChecksumAssetMetadata = $ChecksumAssets[0]
  $ExpectedArchiveUrl = "https://github.com/$Repository/releases/download/$Tag/$Archive"
  $ExpectedChecksumUrl = "https://github.com/$Repository/releases/download/$Tag/$ChecksumAsset"
  if ($ArchiveAsset.browser_download_url -isnot [string] -or $ArchiveAsset.browser_download_url -cne $ExpectedArchiveUrl) { throw "kasb: release archive URL identity mismatch" }
  if ($ChecksumAssetMetadata.browser_download_url -isnot [string] -or $ChecksumAssetMetadata.browser_download_url -cne $ExpectedChecksumUrl) { throw "kasb: release checksum URL identity mismatch" }
  if (-not (Test-JsonInteger $ArchiveAsset.size)) { throw "kasb: release archive metadata has an invalid size" }
  if (-not (Test-JsonInteger $ChecksumAssetMetadata.size)) { throw "kasb: release checksum metadata has an invalid size" }
  if ($ArchiveAsset.size -le 0 -or $ArchiveAsset.size -gt ${release.archiveLimitBytes}) { throw "kasb: release archive metadata exceeds size limit" }
  if ($ChecksumAssetMetadata.size -le 0 -or $ChecksumAssetMetadata.size -gt ${release.metadataLimitBytes}) { throw "kasb: release checksum metadata exceeds size limit" }
  $ArchivePath = Join-Path $Work $Archive
  $Checksums = Join-Path $Work $ChecksumAsset
  Save-BoundedReleaseFile "$DownloadBase/$Repository/releases/download/$Tag/$Archive" $ArchivePath ${release.archiveLimitBytes} ${release.archiveRequestTimeoutSeconds}
  Save-BoundedReleaseFile "$DownloadBase/$Repository/releases/download/$Tag/$ChecksumAsset" $Checksums ${release.metadataLimitBytes} ${release.requestTimeoutSeconds}
  if ((Get-Item -LiteralPath $ArchivePath).Length -ne $ArchiveAsset.size) { throw "kasb: release archive size identity mismatch" }
  if ((Get-Item -LiteralPath $Checksums).Length -ne $ChecksumAssetMetadata.size) { throw "kasb: release checksum size identity mismatch" }
  $Line = @(Get-Content $Checksums | Where-Object { $_ -cmatch "^[0-9a-fA-F]{64}  $([regex]::Escape($Archive))$" })
  if ($Line.Count -ne 1) { throw "kasb: invalid or missing archive checksum" }
  $Expected = $Line[0].Substring(0, 64).ToLowerInvariant()
  $Actual = Get-Sha256Hex $ArchivePath
  if ($Actual -ne $Expected) { throw "kasb: archive checksum mismatch" }
  $Staged = Join-Path $Work $Executable
  Extract-TarExecutable $ArchivePath $Executable $ArchiveEntries $Staged ${release.archiveLimitBytes}
  if (-not $RunningWindows) {
    & chmod 755 $Staged
    if ($LASTEXITCODE -ne 0) { throw "kasb: could not mark the archive executable as executable" }
  }
  Flush-DurableFile $Staged
  Test-BoundedExecutableIdentity $Staged "kasb $Version"
  $Digest = Get-Sha256Hex $Staged
  $ReceiptStaged = Join-Path $Work "receipt.new"
  $CanonicalInstallDir = (Resolve-Path -LiteralPath $InstallDir).ProviderPath
  $CanonicalDestination = [System.IO.Path]::GetFullPath((Join-Path $CanonicalInstallDir $Executable))
  $ReceiptJson = [ordered]@{ schemaVersion = ${release.receiptSchemaVersion}; manager = 'standalone'; version = $Version; target = $Target; executable = $CanonicalDestination; releaseRepository = $Repository; releaseTag = $Tag; assetName = $Archive; sha256 = $Digest } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($ReceiptStaged, $ReceiptJson + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
  Flush-DurableFile $ReceiptStaged
  $HadDestination = Test-Path -LiteralPath $Destination
  $HadReceipt = Test-Path -LiteralPath $Receipt
  $PublishStarted = $true
  if ($HadDestination) { Move-ExactFile $Destination $Backup }
  if ($HadReceipt) { Move-ExactFile $Receipt $ReceiptBackup }
  if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $env:KASB_INSTALLER_TEST_INTERRUPT_AFTER_BACKUP -eq "1") { throw "kasb: simulated interrupted installation" }
  Move-ExactFile $Staged $Destination
  if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $env:KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH -eq "1") { throw "kasb: simulated receipt publication failure" }
  Move-ExactFile $ReceiptStaged $Receipt
  Flush-DurableFile $Destination
  Flush-DurableFile $Receipt
  $Committed = $true
  Write-Output "Installed kasb $Version at $Destination"
} finally {
  $PreserveWork = $false
  if (-not $Committed -and $PublishStarted) {
    $RollbackOk = $true
    if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $env:KASB_INSTALLER_TEST_FAIL_ROLLBACK -eq '1') {
      $RollbackOk = $false
    } else {
      try {
        if ($HadDestination) {
          if ([System.IO.File]::Exists($Backup)) {
            Remove-ExactFile $Destination
            Move-ExactFile $Backup $Destination
          } elseif (-not [System.IO.File]::Exists($Destination)) { $RollbackOk = $false }
        } else {
          Remove-ExactFile $Destination
        }
      } catch {
        if ($HadDestination -or (Test-Path -LiteralPath $Destination)) { $RollbackOk = $false }
      }
      try {
        if ($HadReceipt) {
          if ([System.IO.File]::Exists($ReceiptBackup)) {
            Remove-ExactFile $Receipt
            Move-ExactFile $ReceiptBackup $Receipt
          } elseif (-not [System.IO.File]::Exists($Receipt)) { $RollbackOk = $false }
        } else {
          Remove-ExactFile $Receipt
        }
      } catch {
        if ($HadReceipt -or (Test-Path -LiteralPath $Receipt)) { $RollbackOk = $false }
      }
    }
    if (-not $RollbackOk) {
      $PreserveWork = $true
      [Console]::Error.WriteLine("kasb: installation rollback was incomplete; recovery files remain in $Work")
    }
  }
  if (-not $PreserveWork) { Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Work }
}
`;
}
