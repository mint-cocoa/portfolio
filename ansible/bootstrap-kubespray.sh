#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
lock_file="${1:-${script_dir}/kubespray.lock}"

if [[ ! -f "${lock_file}" ]]; then
  echo "missing lock file: ${lock_file}" >&2
  exit 1
fi

set -a
source "${lock_file}"
set +a

: "${KUBESPRAY_REPO:?missing KUBESPRAY_REPO}"
: "${KUBESPRAY_REF:?missing KUBESPRAY_REF}"
: "${KUBESPRAY_COMMIT_SHORT:?missing KUBESPRAY_COMMIT_SHORT}"
: "${KUBESPRAY_SOURCE_DIR:?missing KUBESPRAY_SOURCE_DIR}"

dest="${script_dir}/${KUBESPRAY_SOURCE_DIR}"

if [[ ! -d "${dest}/.git" ]]; then
  mkdir -p "$(dirname -- "${dest}")"
  git clone --branch "${KUBESPRAY_REF}" --depth 1 "${KUBESPRAY_REPO}" "${dest}"
else
  git -C "${dest}" fetch --depth 1 origin "refs/tags/${KUBESPRAY_REF}:refs/tags/${KUBESPRAY_REF}"
  git -C "${dest}" checkout --detach "${KUBESPRAY_REF}"
fi

actual="$(git -C "${dest}" rev-parse --short=7 HEAD)"
if [[ "${actual}" != "${KUBESPRAY_COMMIT_SHORT}" ]]; then
  echo "Kubespray pin mismatch: expected ${KUBESPRAY_COMMIT_SHORT}, got ${actual}" >&2
  exit 1
fi

python3 -m venv "${script_dir}/.venv"
"${script_dir}/.venv/bin/pip" install --upgrade pip
"${script_dir}/.venv/bin/pip" install -r "${dest}/requirements.txt"

echo "Kubespray ready at ${dest} (${KUBESPRAY_REF}/${actual})"
