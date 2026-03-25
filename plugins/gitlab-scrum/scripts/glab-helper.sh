#!/bin/bash
# GitLab Scrum Helper - utility functions for glab CLI
# Used by gitlab-scrum skills

set -euo pipefail

# Get URL-encoded project path for API calls
get_project_path() {
  local remote
  remote=$(git remote get-url origin 2>/dev/null || echo "")
  if [ -z "$remote" ]; then
    echo "ERROR: Not in a git repo or no origin remote" >&2
    return 1
  fi
  # Extract path from URL: https://gitlab.com/group/project.git -> group%2Fproject
  local path
  path=$(echo "$remote" | sed -E 's|.*://[^/]+/||;s|\.git$||' | sed 's|/|%2F|g')
  echo "$path"
}

# Get project path (unencoded) for glab --project flag
get_project_slug() {
  local remote
  remote=$(git remote get-url origin 2>/dev/null || echo "")
  echo "$remote" | sed -E 's|.*://[^/]+/||;s|\.git$||'
}

# Get label ID by name
get_label_id() {
  local name="$1"
  local project_path
  project_path=$(get_project_path)
  glab api "projects/${project_path}/labels" 2>/dev/null | \
    python3 -c "import sys,json; labels=json.load(sys.stdin); [print(l['id']) for l in labels if l['name']=='${name}']" 2>/dev/null | head -1
}

# Get board ID (first board)
get_board_id() {
  local project_path
  project_path=$(get_project_path)
  glab api "projects/${project_path}/boards" 2>/dev/null | \
    python3 -c "import sys,json; boards=json.load(sys.stdin); print(boards[0]['id'] if boards else '')" 2>/dev/null
}

# Format issue list as table
format_issues() {
  python3 -c "
import sys, json
issues = json.load(sys.stdin)
if not issues:
    print('No issues found.')
    sys.exit(0)
print(f'{'ID':<6} {'Title':<60} {'Labels':<20} {'Milestone':<20}')
print('-' * 106)
for i in issues:
    labels = ', '.join(l['name'] for l in i.get('labels', []))
    ms = i.get('milestone', {})
    ms_title = ms.get('title', '-') if ms else '-'
    print(f'#{i[\"iid\"]:<5} {i[\"title\"][:58]:<60} {labels[:18]:<20} {ms_title[:18]:<20}')
" 2>/dev/null
}

case "${1:-help}" in
  project-path)
    get_project_path
    ;;
  project-slug)
    get_project_slug
    ;;
  label-id)
    get_label_id "$2"
    ;;
  board-id)
    get_board_id
    ;;
  format-issues)
    format_issues
    ;;
  *)
    echo "Usage: glab-helper.sh <project-path|project-slug|label-id|board-id|format-issues>"
    ;;
esac
