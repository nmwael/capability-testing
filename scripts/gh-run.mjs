#!/usr/bin/env node
// gh-run.mjs — the ONLY place this tooling shells out to `gh`.
//
// WHY THIS FILE EXISTS: gh-lib.mjs is pure so its parser can be tested offline.
// Everything that touches the network lives here instead, so that "did the
// network call happen" is answerable by reading one small module rather than
// grepping three scripts. It also centralises the auth precondition, which is
// the failure mode this tooling must never soft-fail on: a write path that
// silently no-ops when unauthenticated produces a green run and an empty
// tracker, which is worse than a hard error.
//
// Measured environment notes, because they shaped this file:
//   * `gh` is 2.45.0, which has NO `--body-file` on `issue create`/`issue edit`.
//     Long bodies therefore go through `gh api --input -` with JSON on stdin
//     rather than through `--body`, sidestepping both argv length limits and
//     shell quoting.
//   * There is no `~/.config/gh` on this box, so `gh` needs GH_TOKEN in the
//     environment. `requireAuth` reports that precisely instead of the
//     misleading "not logged in" that `gh` alone gives.
//
// No writes, no state: every function is a thin, inspectable wrapper.

import { spawnSync } from "node:child_process"

/** Run `gh` and capture stdout. Throws on a non-zero exit unless allowFail. */
export function gh(args, { input, allowFail = false } = {}) {
  const res = spawnSync("gh", args, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  if (res.error) {
    throw new Error(`gh failed to start (${res.error.code || res.error.message}); is it installed and on PATH?`)
  }
  if (res.status !== 0 && !allowFail) {
    const detail = (res.stderr || res.stdout || "").trim().split("\n").slice(0, 6).join("\n")
    throw new Error(`gh ${args[0]} exited ${res.status}:\n${detail}`)
  }
  return res
}

/** Run `gh` and parse stdout as JSON. */
export function ghJson(args, opts) {
  const res = gh(args, opts)
  const text = (res.stdout || "").trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`gh ${args[0]} did not return JSON: ${text.slice(0, 200)}`)
  }
}

/**
 * Fail loudly unless `gh` is actually authenticated to a host.
 *
 * A missing credential is the loop's single point of failure, so the message
 * names both the symptom and the two supported fixes rather than echoing gh's
 * generic "not logged in" (which is what you get with no GH_TOKEN and no
 * ~/.config/gh, the state this box starts in).
 *
 * @returns {{login:string, scopes:string[]}}
 */
export function requireAuth() {
  const res = gh(["auth", "status"], { allowFail: true })
  if (res.status !== 0) {
    throw new Error(
      [
        "gh is not authenticated — refusing to run, because a write that silently no-ops",
        "would report success and leave the tracker empty.",
        "",
        "  Fix: export GH_TOKEN=<token with 'repo' scope>, or run `gh auth login`.",
        "",
        `  gh said: ${(res.stderr || res.stdout || "").trim().split("\n")[0] || "(nothing)"}`,
      ].join("\n"),
    )
  }
  // `gh auth status` prints to stderr and its wording varies by version, so the
  // identity comes from the API (the same call the scope header arrives on).
  const out = gh(["api", "-i", "user"], { allowFail: true })
  if (out.status !== 0) throw new Error("gh is configured but the API rejected the credential")
  const login = (out.stdout.match(/"login"\s*:\s*"([^"]+)"/) || [])[1] || "(unknown)"
  const scopeHeader = (out.stdout.match(/^x-oauth-scopes:\s*(.+)$/im) || [])[1] || ""
  const scopes = scopeHeader.split(",").map((s) => s.trim()).filter(Boolean)
  return { login, scopes }
}

/** `owner/name` for the repo in the current directory. */
export function repoSlug() {
  const slug = (gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).stdout || "").trim()
  if (!slug.includes("/")) throw new Error(`could not determine repo slug (got ${JSON.stringify(slug)})`)
  return slug
}

/** Every issue (open + closed) as {number,title,body,state}. PRs are excluded. */
export function listIssues(slug, limit = 2000) {
  const out = ghJson([
    "issue", "list",
    "--repo", slug,
    "--state", "all",
    "--limit", String(limit),
    "--json", "number,title,body,state",
  ])
  return Array.isArray(out) ? out : []
}

/** One issue by number, as {number,title,body,state,labels}. */
export function getIssue(slug, number) {
  return ghJson(["api", `repos/${slug}/issues/${number}`])
}

/** Post a comment on an issue; returns the created comment {id, html_url, body}. */
export function createIssueComment(slug, number, body) {
  return ghJson(["api", "-X", "POST", `repos/${slug}/issues/${number}/comments`, "--input", "-"], {
    input: JSON.stringify({ body }),
  })
}

/** Every comment on an issue, oldest first. */
export function listIssueComments(slug, number) {
  const out = ghJson(["api", `repos/${slug}/issues/${number}/comments?per_page=100`])
  return Array.isArray(out) ? out : []
}

/**
 * One issue comment by id, as {id, body, html_url}.
 *
 * Read as JSON and never through `--jq`: jq appends a trailing newline, which
 * would change the bytes an attestation's sha256 was taken over and make a
 * sound envelope fail verification.
 */
export function getIssueComment(slug, commentId) {
  return ghJson(["api", `repos/${slug}/issues/comments/${commentId}`])
}

/** Create an issue from a JSON payload; returns the new issue number. */
export function createIssue(slug, payload) {
  const res = gh(["api", "-X", "POST", `repos/${slug}/issues`, "--input", "-"], {
    input: JSON.stringify(payload),
  })
  const created = JSON.parse(res.stdout)
  return created.number
}

/** Patch an issue's title/body/labels. */
export function updateIssue(slug, number, payload) {
  gh(["api", "-X", "PATCH", `repos/${slug}/issues/${number}`, "--input", "-"], {
    input: JSON.stringify(payload),
  })
}

/** Close an issue. */
export function closeIssue(slug, number, reason = "not planned") {
  gh(["issue", "close", String(number), "--repo", slug, "--reason", reason])
}

/** Close an issue via the API (one call, no second process). */
export function setIssueState(slug, number, state, reason) {
  gh(["api", "-X", "PATCH", `repos/${slug}/issues/${number}`, "--input", "-"], {
    input: JSON.stringify({ state, state_reason: reason }),
  })
}

/** Existing milestones, by title. */
export function listMilestones(slug) {
  const out = ghJson(["api", `repos/${slug}/milestones?state=all&per_page=100`])
  return Array.isArray(out) ? out : []
}

/** Create a milestone; returns it. */
export function createMilestone(slug, { title, description }) {
  return ghJson(["api", "-X", "POST", `repos/${slug}/milestones`, "--input", "-"], {
    input: JSON.stringify({ title, description }),
  })
}

/** Patch a milestone's description. */
export function updateMilestone(slug, number, { description }) {
  gh(["api", "-X", "PATCH", `repos/${slug}/milestones/${number}`, "--input", "-"], {
    input: JSON.stringify({ description }),
  })
}

/** Existing labels, by name. */
export function listLabels(slug) {
  const out = ghJson(["api", `repos/${slug}/labels?per_page=100`])
  return Array.isArray(out) ? out : []
}

/** Create a label. */
export function createLabel(slug, { name, color, description }) {
  gh(["api", "-X", "POST", `repos/${slug}/labels`, "--input", "-"], {
    input: JSON.stringify({ name, color, description }),
  })
}

/** Patch a label's colour/description. */
export function updateLabel(slug, name, { color, description }) {
  gh(["api", "-X", "PATCH", `repos/${slug}/labels/${encodeURIComponent(name)}`, "--input", "-"], {
    input: JSON.stringify({ new_name: name, color, description }),
  })
}
