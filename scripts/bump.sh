#!/usr/bin/env bash
# bump.sh — bump a plugin version, like npm version patch/minor/major
#
# Usage:
#   ./scripts/bump.sh <plugin-name> [patch|minor|major]
#
# Examples:
#   ./scripts/bump.sh hub
#   ./scripts/bump.sh hub patch
#   ./scripts/bump.sh agent-factory minor
#
set -e

PLUGIN="${1:-}"
BUMP="${2:-patch}"
MARKETPLACE=".claude-plugin/marketplace.json"

if [[ -z "$PLUGIN" ]]; then
  echo "Usage: $0 <plugin-name> [patch|minor|major]"
  echo ""
  echo "Available plugins:"
  jq -r '.plugins[].name' "$MARKETPLACE"
  exit 1
fi

PLUGIN_DIR="plugins/$PLUGIN"
PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"

if [[ ! -f "$PLUGIN_JSON" ]]; then
  echo "Error: Plugin '$PLUGIN' not found at $PLUGIN_JSON"
  exit 1
fi

# Read current version
CURRENT=$(jq -r '.version' "$PLUGIN_JSON")
if [[ -z "$CURRENT" || "$CURRENT" == "null" ]]; then
  echo "Error: Could not read version from $PLUGIN_JSON"
  exit 1
fi

# Parse semver
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP" in
  patch)  PATCH=$((PATCH + 1)) ;;
  minor)  MINOR=$((MINOR + 1)); PATCH=0 ;;
  major)  MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *)
    echo "Error: bump type must be patch, minor, or major (got '$BUMP')"
    exit 1
    ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"

# Update plugin.json
jq --arg v "$NEW" '.version = $v' "$PLUGIN_JSON" > /tmp/_bump_tmp.json
mv /tmp/_bump_tmp.json "$PLUGIN_JSON"

# Update marketplace.json
python3 - "$PLUGIN" "$NEW" "$MARKETPLACE" <<'EOF'
import json, sys
plugin_name, new_version, path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    data = json.load(f)
for p in data.get('plugins', []):
    if p['name'] == plugin_name:
        p['version'] = new_version
        break
with open(path, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
EOF

echo "Bumped $PLUGIN: $CURRENT → $NEW"
