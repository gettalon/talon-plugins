# GitLab Scrum Plugin

Manage GitLab Scrum/Kanban workflows via `glab` CLI — issues, milestones (sprints), boards, and wiki.

## Skills

| Skill | Trigger | What it does |
|-------|---------|-------------|
| `/gitlab-scrum` | "create issue", "list issues", "scrum", "backlog" | Core issue + label + milestone management |
| `/gitlab-sprint` | "sprint planning", "new sprint", "close sprint" | Sprint lifecycle — create, populate, track, close |
| `/gitlab-board` | "board", "kanban", "move issue" | Board setup and issue movement |
| `/gitlab-wiki` | "wiki", "documentation", "diagram" | Wiki CRUD with Mermaid diagrams |

## Prerequisites

- `glab` CLI installed (`brew install glab`)
- Authenticated (`glab auth login`)
- In a git repo with GitLab remote

## Quick Start

```
/gitlab-sprint plan Sprint 2026-W14
/gitlab-scrum create issue "Implement feature X" --label "To Do"
/gitlab-board setup
/gitlab-wiki create "Architecture" with sequence diagram
```
