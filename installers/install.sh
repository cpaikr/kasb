#!/bin/sh
set -eu

# Generated from Cargo.toml and native-targets.json. Do not edit.
version='0.1.0'
tag='v0.1.0'
repository='cpaikr/kasb'
checksum_asset='SHA256SUMS'
receipt_name='.kasb-receipt.json'
api_base=https://api.github.com
download_base=https://github.com
if [ -n "${KASB_INSTALLER_API_BASE:-}${KASB_INSTALLER_DOWNLOAD_BASE:-}" ]; then
  [ "${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] || { echo 'kasb: release URL overrides are test-only' >&2; exit 1; }
  api_base=${KASB_INSTALLER_API_BASE:-${api_base}}
  download_base=${KASB_INSTALLER_DOWNLOAD_BASE:-${download_base}}
fi
os=${KASB_INSTALLER_TEST_OS:-$(uname -s)}
arch=${KASB_INSTALLER_TEST_ARCH:-$(uname -m)}
if [ -n "${KASB_INSTALLER_TEST_OS:-}${KASB_INSTALLER_TEST_ARCH:-}" ] && [ "${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" != 1 ]; then
  echo 'kasb: platform overrides are test-only' >&2
  exit 1
fi
expanded_limit=134217728
total_expanded_limit=$((expanded_limit * 2))
if [ -n "${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES:-}" ]; then
  [ "${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] || { echo 'kasb: extraction limit override is test-only' >&2; exit 1; }
  case "${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES}" in ''|*[!0-9]*) echo 'kasb: invalid test extraction limit' >&2; exit 1 ;; esac
  [ "${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES}" -gt 0 ] || { echo 'kasb: invalid test extraction limit' >&2; exit 1; }
  [ "${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES}" -le 134217728 ] || { echo 'kasb: invalid test extraction limit' >&2; exit 1; }
  expanded_limit=${KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES}
fi
if [ -n "${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES:-}" ]; then
  [ "${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] || { echo 'kasb: total extraction limit override is test-only' >&2; exit 1; }
  case "${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES}" in ''|*[!0-9]*) echo 'kasb: invalid test total extraction limit' >&2; exit 1 ;; esac
  [ "${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES}" -gt 0 ] || { echo 'kasb: invalid test total extraction limit' >&2; exit 1; }
  [ "${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES}" -le $(( 134217728 * 2 )) ] || { echo 'kasb: invalid test total extraction limit' >&2; exit 1; }
  total_expanded_limit=${KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES}
fi

if [ "${os}" = Linux ] && [ -z "${KASB_INSTALLER_TEST_OS:-}${KASB_INSTALLER_TEST_ARCH:-}" ]; then
  glibc_identity=$(getconf GNU_LIBC_VERSION 2>/dev/null || true)
  case "${glibc_identity}" in glibc\ *) glibc_version=${glibc_identity#glibc } ;; *) echo 'kasb: standalone Linux requires glibc' >&2; exit 1 ;; esac
  awk -v have="${glibc_version}" -v minimum='2.28' 'BEGIN { split(have, h, "."); split(minimum, m, "."); exit !((h[1] + 0 > m[1] + 0) || (h[1] + 0 == m[1] + 0 && h[2] + 0 >= m[2] + 0)) }' || { echo 'kasb: standalone Linux glibc is below 2.28' >&2; exit 1; }
fi

case "${os}:${arch}" in
  Linux:x86_64) target='linux-x64-gnu'; archive='kasb-0.1.0-linux-x64-gnu.tar.gz'; executable='kasb' ;;
  Linux:arm64|Linux:aarch64) target='linux-arm64-gnu'; archive='kasb-0.1.0-linux-arm64-gnu.tar.gz'; executable='kasb' ;;
  Darwin:arm64|Darwin:aarch64) target='darwin-arm64'; archive='kasb-0.1.0-darwin-arm64.tar.gz'; executable='kasb' ;;
  *) echo "kasb: unsupported standalone target ${os}/${arch}" >&2; exit 1 ;;
esac

install_dir=${KASB_INSTALL_DIR:-"${HOME}/.local/bin"}
safe_install_dir=$(printf '%s' "${install_dir}" | LC_ALL=C tr -d '\001-\037\177')
[ "${install_dir}" = "${safe_install_dir}" ] || { echo 'kasb: installation path contains unsupported control characters' >&2; exit 1; }
mkdir -p "${install_dir}"
case "${install_dir}" in
  /*) install_dir=$(cd -P "${install_dir}" && pwd) ;;
  *) install_dir=$(cd -P "./${install_dir}" && pwd) ;;
esac
destination="${install_dir}/${executable}"
receipt="${install_dir}/${receipt_name}"
safe_destination=$(printf '%s' "${destination}" | LC_ALL=C tr -d '\001-\037\177')
[ "${destination}" = "${safe_destination}" ] || { echo 'kasb: installation path contains unsupported control characters' >&2; exit 1; }
for existing_path in "${destination}" "${receipt}"; do
  if [ -L "${existing_path}" ] || { [ -e "${existing_path}" ] && [ ! -f "${existing_path}" ]; }; then
    echo 'kasb: pre-existing installation paths must be regular files' >&2
    exit 1
  fi
done
work=$(mktemp -d "${install_dir}/.kasb-install.XXXXXX")
backup="${work}/previous-kasb"
receipt_backup="${work}/previous-receipt"
committed=0
publish_started=0
had_destination=0
had_receipt=0
decompressor_pid=
identity_pid=
identity_reader_pid=
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  for child_pid in "${decompressor_pid}" "${identity_pid}" "${identity_reader_pid}"; do
    if [ -n "${child_pid}" ]; then kill "${child_pid}" 2>/dev/null || true; fi
  done
  preserve_work=0
  if [ "${committed}" -ne 1 ] && [ "${publish_started}" -eq 1 ]; then
    if [ "${status}" -eq 0 ]; then status=1; fi
    rollback_ok=1
    if [ "${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] && [ "${KASB_INSTALLER_TEST_FAIL_ROLLBACK:-0}" = 1 ]; then
      rollback_ok=0
    else
      if [ "${had_destination}" -eq 1 ]; then
        if [ -f "${backup}" ] || [ -L "${backup}" ]; then
          if rm -f "${destination}" && [ ! -e "${destination}" ] && [ ! -L "${destination}" ]; then
            mv "${backup}" "${destination}" || rollback_ok=0
          else
            rollback_ok=0
          fi
        elif [ ! -f "${destination}" ]; then
          rollback_ok=0
        fi
      else
        rm -f "${destination}" || rollback_ok=0
      fi
      if [ "${had_receipt}" -eq 1 ]; then
        if [ -f "${receipt_backup}" ] || [ -L "${receipt_backup}" ]; then
          if rm -f "${receipt}" && [ ! -e "${receipt}" ] && [ ! -L "${receipt}" ]; then
            mv "${receipt_backup}" "${receipt}" || rollback_ok=0
          else
            rollback_ok=0
          fi
        elif [ ! -f "${receipt}" ]; then
          rollback_ok=0
        fi
      else
        rm -f "${receipt}" || rollback_ok=0
      fi
    fi
    if [ "${rollback_ok}" -ne 1 ]; then
      preserve_work=1
      echo "kasb: installation rollback was incomplete; recovery files remain in ${work}" >&2
    fi
  fi
  if [ "${preserve_work}" -ne 1 ]; then rm -rf "${work}"; fi
  exit "${status}"
}
trap cleanup EXIT HUP INT TERM

fetch() {
  protocols='=https'
  case "$1" in
    https://*) ;;
    http://*) [ "${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] || { echo 'kasb: refused an insecure release URL' >&2; return 1; }; protocols='=https,http' ;;
    *) echo 'kasb: refused an invalid release URL' >&2; return 1 ;;
  esac
  curl --fail --silent --show-error --location --proto "${protocols}" --proto-redir "${protocols}" \
    --connect-timeout 5 --max-time 15 \
    --max-redirs 5 --max-filesize "$3" --output "$2" "$1"
}

parse_release_metadata() {
  awk -v expected_tag="${tag}" -v expected_archive="${archive}" -v expected_archive_url="https://github.com/${repository}/releases/download/${tag}/${archive}"       -v expected_checksum="${checksum_asset}" -v expected_checksum_url="https://github.com/${repository}/releases/download/${tag}/${checksum_asset}" '
  function fail() { invalid = 1; position = length(input) + 1 }
  function whitespace( character) {
    while (position <= length(input)) {
      character = substr(input, position, 1)
      if (character != " " && character != "\t" && character != "\r" && character != "\n") break
      position += 1
    }
  }
  function string_value( output, character, escape, digits) {
    whitespace()
    if (substr(input, position, 1) != "\"") { fail(); return "" }
    position += 1; output = ""; string_plain = 1
    while (position <= length(input)) {
      character = substr(input, position, 1)
      if (character == "\"") { position += 1; return output }
      if (character == "\\") {
        string_plain = 0; position += 1; escape = substr(input, position, 1)
        if (escape == "u") {
          digits = substr(input, position + 1, 4)
          if (digits !~ /^[0-9a-fA-F]{4}$/) { fail(); return "" }
          position += 5
        } else if (escape == "\"" || escape == "\\" || escape == "/" || escape ~ /^[bfnrt]$/) { position += 1 }
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
    if (value !~ /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/) fail()
    return value
  }
  function skip_value(depth, character, key) {
    if (depth > 64) { fail(); return }
    whitespace(); character = substr(input, position, 1)
    if (character == "\"") { string_value(); return }
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
  { input = input $0 "\n" }
  END {
    position = 1; archive_size = -1; checksum_size = -1
    root_object(); whitespace()
    if (invalid || position <= length(input)) exit 2
    print immutable_count + 0, immutable_value + 0, draft_count + 0, draft_value + 0, prerelease_count + 0, prerelease_value + 0, tag_count + 0, tag_matches + 0, assets_count + 0, archive_matches + 0, archive_url_matches + 0, archive_size, checksum_matches + 0, checksum_url_matches + 0, checksum_size
  }' "$1"
}

metadata="${work}/release.json"
fetch "${api_base}/repos/${repository}/releases/tags/${tag}" "${metadata}" 1048576
metadata_fields=$(parse_release_metadata "${metadata}") || { echo 'kasb: release metadata is invalid JSON or has an invalid shape' >&2; exit 1; }
set -- ${metadata_fields}
[ "$#" -eq 15 ] || { echo 'kasb: release metadata is incomplete' >&2; exit 1; }
[ "$1" -eq 1 ] && [ "$2" -eq 1 ] || { echo 'kasb: release is not immutable' >&2; exit 1; }
[ "$3" -eq 1 ] && [ "$4" -eq 0 ] && [ "$5" -eq 1 ] && [ "$6" -eq 0 ] || { echo 'kasb: release is not a production release' >&2; exit 1; }
[ "$7" -eq 1 ] && [ "$8" -eq 1 ] || { echo 'kasb: release tag identity mismatch' >&2; exit 1; }
[ "$9" -eq 1 ] || { echo 'kasb: release asset list is missing or duplicated' >&2; exit 1; }
[ "${10}" -eq 1 ] || { echo 'kasb: release archive is missing or duplicated' >&2; exit 1; }
[ "${11}" -eq 1 ] || { echo 'kasb: release archive URL identity mismatch' >&2; exit 1; }
archive_size=${12}
[ "${13}" -eq 1 ] || { echo 'kasb: release checksum manifest is missing or duplicated' >&2; exit 1; }
[ "${14}" -eq 1 ] || { echo 'kasb: release checksum URL identity mismatch' >&2; exit 1; }
checksum_size=${15}
case "${archive_size}" in ''|*[!0-9]*) echo 'kasb: release archive metadata has an invalid size' >&2; exit 1 ;; esac
case "${checksum_size}" in ''|*[!0-9]*) echo 'kasb: release checksum metadata has an invalid size' >&2; exit 1 ;; esac
[ "${archive_size}" -gt 0 ] && [ "${archive_size}" -le 134217728 ] || { echo 'kasb: release archive metadata exceeds size limit' >&2; exit 1; }
[ "${checksum_size}" -gt 0 ] && [ "${checksum_size}" -le 1048576 ] || { echo 'kasb: release checksum metadata exceeds size limit' >&2; exit 1; }

archive_path="${work}/${archive}"
checksums="${work}/${checksum_asset}"
release_download="${download_base}/${repository}/releases/download/${tag}"
fetch "${release_download}/${archive}" "${archive_path}" 134217728
fetch "${release_download}/${checksum_asset}" "${checksums}" 1048576
[ "$(wc -c < "${archive_path}" | tr -d ' ')" -eq "${archive_size}" ] || { echo 'kasb: release archive size identity mismatch' >&2; exit 1; }
[ "$(wc -c < "${checksums}" | tr -d ' ')" -eq "${checksum_size}" ] || { echo 'kasb: release checksum size identity mismatch' >&2; exit 1; }
expected=$(awk -v name="${archive}" '$2 == name { print $1 }' "${checksums}")
case "${expected}" in ''|*[!0-9a-fA-F]* ) echo 'kasb: invalid or missing archive checksum' >&2; exit 1 ;; esac
[ "${#expected}" -eq 64 ] || { echo 'kasb: invalid archive checksum length' >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "${archive_path}" | awk '{print $1}')
else
  actual=$(shasum -a 256 "${archive_path}" | awk '{print $1}')
fi
[ "${actual}" = "${expected}" ] || { echo 'kasb: archive checksum mismatch' >&2; exit 1; }

command -v gzip >/dev/null 2>&1 || { echo 'kasb: gzip is required to inspect the release archive safely' >&2; exit 1; }
expanded_archive="${work}/archive.tar"
archive_pipe="${work}/archive.pipe"
mkfifo "${archive_pipe}"
gzip -dc "${archive_path}" > "${archive_pipe}" 2>/dev/null &
decompressor_pid=$!
head -c $((total_expanded_limit + 1)) < "${archive_pipe}" > "${expanded_archive}"
if wait "${decompressor_pid}"; then decompressor_ok=1; else decompressor_ok=0; fi
decompressor_pid=
rm -f "${archive_pipe}"
[ "$(wc -c < "${expanded_archive}" | tr -d ' ')" -le "${total_expanded_limit}" ] || { echo 'kasb: expanded release archive exceeds total size limit' >&2; exit 1; }
[ "${decompressor_ok}" -eq 1 ] || { echo 'kasb: release archive compression is invalid' >&2; exit 1; }
staged="${work}/kasb.new"
entry_counts=$(tar -tf "${expanded_archive}" | awk -v name="${executable}" '{ total += 1; if ($0 == name) executable += 1 } END { print total + 0, executable + 0 }')
set -- ${entry_counts}
[ "$#" -eq 2 ] && [ "$1" -eq 4 ] && [ "$2" -eq 1 ] || { echo 'kasb: archive entry set or executable identity is invalid' >&2; exit 1; }
entry_description=$(tar -tvf "${expanded_archive}" "${executable}")
case "${entry_description}" in -*) ;; *) echo 'kasb: archive executable entry is not a regular file' >&2; exit 1 ;; esac
tar -xOf "${expanded_archive}" "${executable}" | head -c $((expanded_limit + 1)) > "${staged}"
[ "$(wc -c < "${staged}" | tr -d ' ')" -le "${expanded_limit}" ] || { echo 'kasb: expanded release executable exceeds size limit' >&2; exit 1; }
chmod 755 "${staged}"
reported_path="${work}/reported-version"
reported_pipe="${work}/reported-version.pipe"
reported_done="${work}/reported-version.done"
mkfifo "${reported_pipe}"
(head -c 129 < "${reported_pipe}" > "${reported_path}"; : > "${reported_done}") &
identity_reader_pid=$!
"${staged}" --version > "${reported_pipe}" 2>/dev/null &
identity_pid=$!
identity_waits=0
while kill -0 "${identity_pid}" 2>/dev/null; do
  identity_waits=$((identity_waits + 1))
  if [ "${identity_waits}" -ge 50 ]; then
    kill "${identity_pid}" 2>/dev/null || true
    wait "${identity_pid}" 2>/dev/null || true
    kill "${identity_reader_pid}" 2>/dev/null || true
    wait "${identity_reader_pid}" 2>/dev/null || true
    identity_pid=
    identity_reader_pid=
    echo 'kasb: archive executable identity check timed out' >&2
    exit 1
  fi
  sleep 0.1
done
identity_status=0
wait "${identity_pid}" || identity_status=$?
identity_pid=
while [ ! -f "${reported_done}" ]; do
  identity_waits=$((identity_waits + 1))
  if [ "${identity_waits}" -ge 50 ]; then
    kill "${identity_reader_pid}" 2>/dev/null || true
    wait "${identity_reader_pid}" 2>/dev/null || true
    identity_reader_pid=
    echo 'kasb: archive executable identity output pipe did not close within five seconds' >&2
    exit 1
  fi
  sleep 0.1
done
if ! wait "${identity_reader_pid}"; then echo 'kasb: archive executable identity output could not be read' >&2; exit 1; fi
identity_reader_pid=
rm -f "${reported_pipe}"
[ "$(wc -c < "${reported_path}" | tr -d ' ')" -le 128 ] || { echo 'kasb: archive executable identity output is too large' >&2; exit 1; }
[ "${identity_status}" -eq 0 ] || { echo 'kasb: archive executable identity check failed' >&2; exit 1; }
reported=$(cat "${reported_path}")
[ "${reported}" = "kasb ${version}" ] || { echo 'kasb: archive executable version mismatch' >&2; exit 1; }
binary_digest=$(if command -v sha256sum >/dev/null 2>&1; then sha256sum "${staged}"; else shasum -a 256 "${staged}"; fi | awk '{print $1}')
escaped_destination=$(printf '%s' "${destination}" | sed 's/\\/\\\\/g; s/"/\\"/g')
receipt_staged="${work}/receipt.new"
printf '%s\n' '{"schemaVersion":1,"manager":"standalone","version":"'"${version}"'","target":"'"${target}"'","executable":"'"${escaped_destination}"'","releaseRepository":"'"${repository}"'","releaseTag":"'"${tag}"'","assetName":"'"${archive}"'","sha256":"'"${binary_digest}"'"}' > "${receipt_staged}"

if [ -e "${destination}" ] || [ -L "${destination}" ]; then had_destination=1; fi
if [ -e "${receipt}" ] || [ -L "${receipt}" ]; then had_receipt=1; fi
publish_started=1
if [ "${had_destination}" -eq 1 ]; then mv "${destination}" "${backup}"; fi
if [ "${had_receipt}" -eq 1 ]; then mv "${receipt}" "${receipt_backup}"; fi
if [ "${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] && [ "${KASB_INSTALLER_TEST_INTERRUPT_AFTER_BACKUP:-0}" = 1 ]; then kill -TERM "$$"; fi
mv "${staged}" "${destination}"
if [ "${KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS:-}" = 1 ] && [ "${KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH:-0}" = 1 ]; then false; fi
mv "${receipt_staged}" "${receipt}"
committed=1
echo "Installed kasb ${version} at ${destination}"
