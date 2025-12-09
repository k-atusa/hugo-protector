#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/k-atusa/hugo-protector.git"
DEV_HANDLE="@D3vle0"
REPO_LINK="https://github.com/k-atusa/hugo-protector"
SCRIPT_TAG='<script defer src="{{ "hugo-protector/protector.js" | relURL }}"></script>'

TMP_DIR=""

cleanup() {
	if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
		rm -rf "$TMP_DIR"
	fi
}

trap cleanup EXIT

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "[!] Required command '$1' not found. Please install it and retry." >&2
		exit 1;
	fi
}

ensure_project_root() {
	if [[ ! -f "config.toml" && ! -f "config.yaml" && ! -f "config.yml" && ! -f "config.json" && ! -f "hugo.toml" && ! -f "hugo.yaml" && ! -f "hugo.yml" ]]; then
		echo "[!] Run this script from the root of your Hugo project (config.* not found)." >&2
		exit 1
	fi
}

show_first_run_banner() {
	cat <<EOF
==============================================
Hugo Protector Installer
Author: $DEV_HANDLE
Repo:   $REPO_LINK
==============================================
EOF
}

prompt_overwrite() {
	local target="$1"
	read -r -p "[?] $target already exists. Overwrite? [y/N] " reply
	if [[ ! "$reply" =~ ^([yY]|[yY][eE][sS])$ ]]; then
		echo "[i] Skipped $target"
		return 1
	fi
	return 0
}

copy_file() {
	local src="$1"
	local dest="$2"
	if [[ ! -f "$src" ]]; then
		echo "[!] Source missing: $src" >&2
		return 1
	fi
	mkdir -p "$(dirname "$dest")"
	if [[ -e "$dest" ]]; then
		prompt_overwrite "$dest" || return 0
	fi
	cp "$src" "$dest"
	echo "[+] Copied ${src##*/} -> $dest"
}

copy_tree() {
	local src_root="$1"
	local dest_root="$2"
	if [[ ! -d "$src_root" ]]; then
		return
	fi
	find "$src_root" -type f -print0 | while IFS= read -r -d '' file; do
		local rel="${file#$src_root/}"
		copy_file "$file" "$dest_root/$rel"
	done
}

clone_repo() {
	TMP_DIR="$(mktemp -d)"
	git clone --depth 1 "$REPO_URL" "$TMP_DIR/repo" >/dev/null 2>&1
	REPO_CLONE="$TMP_DIR/repo"
}

sync_static() {
	local src_js="$REPO_CLONE/static/hugo-protector/protector.js"
	copy_file "$src_js" "static/hugo-protector/protector.js"
}

sync_layouts() {
	copy_tree "$REPO_CLONE/layouts" "layouts"
}

ensure_baseof() {
	local base_dir="layouts/_default"
	local base_file="$base_dir/baseof.html"
	mkdir -p "$base_dir"
	if [[ ! -f "$base_file" ]]; then
		local theme_source
		theme_source=$(find themes -path '*/layouts/_default/baseof.html' -print -quit 2>/dev/null || true)
		if [[ -n "$theme_source" ]]; then
			cp "$theme_source" "$base_file"
			echo "[+] Copied base layout from $theme_source"
		else
			cat <<'EOF' > "$base_file"
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8">
		<title>{{ .Title }}</title>
	</head>
	<body>
		{{ block "main" . }}{{ end }}
	</body>
</html>
EOF
			echo "[+] Created minimal layouts/_default/baseof.html"
		fi
	fi

	if ! grep -Fq "$SCRIPT_TAG" "$base_file"; then
		printf '\n%s\n' "$SCRIPT_TAG" >> "$base_file"
		echo "[+] Appended script tag to $base_file"
	else
		echo "[i] Script tag already present in $base_file"
	fi
}

main() {
	ensure_project_root
	require_command git
	show_first_run_banner
	clone_repo
	sync_static
	sync_layouts
	ensure_baseof
	echo "[✓] Installation complete."
}

main "$@"
