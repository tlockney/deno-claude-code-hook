/** Schema round-trip tests for hooks added beyond the original set.
 *
 * These tests validate that each new hook's input and output schemas accept
 * minimal well-formed payloads. End-to-end tests (via `runHook`) exist for
 * the original hooks and can be added as needed for these as well.
 */

import { expect } from "@std/expect";
import * as schemas from "../schemas/hooks.ts";

const base = {
  session_id: "s",
  transcript_path: "/tmp/t.json",
  cwd: "/tmp",
};

Deno.test("instructionsLoaded input parses", () => {
  const parsed = schemas.instructionsLoadedInput.parse({
    ...base,
    hook_event_name: "InstructionsLoaded",
    file_path: "/proj/CLAUDE.md",
    memory_type: "project",
    load_reason: "session_start",
  });
  expect(parsed.file_path).toEqual("/proj/CLAUDE.md");
});

Deno.test("stopFailure input parses", () => {
  const parsed = schemas.stopFailureInput.parse({
    ...base,
    hook_event_name: "StopFailure",
    error: { kind: "rate_limit" },
  });
  expect(parsed.error).toEqual({ kind: "rate_limit" });
});

Deno.test("permissionRequest round-trips", () => {
  schemas.permissionRequestInput.parse({
    ...base,
    hook_event_name: "PermissionRequest",
    permission_mode: "default",
    tool_name: "Bash",
    tool_input: { command: "ls" },
  });
  schemas.permissionRequestOutput.parse({
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "deny", message: "nope" },
    },
  });
});

Deno.test("permissionDenied round-trips", () => {
  schemas.permissionDeniedInput.parse({
    ...base,
    hook_event_name: "PermissionDenied",
    permission_mode: "default",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    reason: "classifier rejected",
  });
  schemas.permissionDeniedOutput.parse({
    hookSpecificOutput: {
      hookEventName: "PermissionDenied",
      retry: true,
    },
  });
});

Deno.test("postToolUseFailure round-trips", () => {
  schemas.postToolUseFailureInput.parse({
    ...base,
    hook_event_name: "PostToolUseFailure",
    permission_mode: "default",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    error: "nonzero exit",
  });
  schemas.postToolUseFailureOutput.parse({
    hookSpecificOutput: {
      hookEventName: "PostToolUseFailure",
      additionalContext: "it failed",
    },
  });
});

Deno.test("elicitation + elicitationResult round-trip", () => {
  schemas.elicitationInput.parse({
    ...base,
    hook_event_name: "Elicitation",
    server_name: "mcp-server",
  });
  schemas.elicitationOutput.parse({
    hookSpecificOutput: {
      hookEventName: "Elicitation",
      action: "accept",
      content: { answer: 42 },
    },
  });
  schemas.elicitationResultInput.parse({
    ...base,
    hook_event_name: "ElicitationResult",
  });
  schemas.elicitationResultOutput.parse({
    hookSpecificOutput: {
      hookEventName: "ElicitationResult",
      action: "cancel",
    },
  });
});

Deno.test("subagentStart round-trips", () => {
  schemas.subagentStartInput.parse({
    ...base,
    hook_event_name: "SubagentStart",
    agent_id: "a1",
    agent_type: "Explore",
  });
  schemas.subagentStartOutput.parse({
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: "hi",
    },
  });
});

Deno.test("teammateIdle round-trips", () => {
  schemas.teammateIdleInput.parse({
    ...base,
    hook_event_name: "TeammateIdle",
  });
  schemas.teammateIdleOutput.parse({ decision: "block", reason: "keep busy" });
});

Deno.test("taskCreated round-trips", () => {
  schemas.taskCreatedInput.parse({
    ...base,
    hook_event_name: "TaskCreated",
    task_id: "t1",
    task_subject: "do thing",
  });
  schemas.taskCreatedOutput.parse({});
});

Deno.test("taskCompleted round-trips", () => {
  schemas.taskCompletedInput.parse({
    ...base,
    hook_event_name: "TaskCompleted",
    task_id: "t1",
  });
  schemas.taskCompletedOutput.parse({ decision: "block", reason: "not yet" });
});

Deno.test("fileChanged parses", () => {
  schemas.fileChangedInput.parse({
    ...base,
    hook_event_name: "FileChanged",
    file_path: "/proj/.env",
    change_type: "modified",
  });
});

Deno.test("cwdChanged parses", () => {
  schemas.cwdChangedInput.parse({
    ...base,
    hook_event_name: "CwdChanged",
    old_cwd: "/a",
    new_cwd: "/b",
  });
});

Deno.test("configChange round-trips", () => {
  schemas.configChangeInput.parse({
    ...base,
    hook_event_name: "ConfigChange",
    config_source: "project_settings",
    changed_fields: ["hooks"],
  });
  schemas.configChangeOutput.parse({ decision: "block", reason: "denied" });
});

Deno.test("postCompact parses manual + auto", () => {
  schemas.postCompactInput.parse({
    ...base,
    hook_event_name: "PostCompact",
    trigger: "auto",
  });
  schemas.postCompactInput.parse({
    ...base,
    hook_event_name: "PostCompact",
    trigger: "manual",
    custom_instructions: "focus on errors",
  });
});

Deno.test("worktreeCreate round-trips", () => {
  schemas.worktreeCreateInput.parse({
    ...base,
    hook_event_name: "WorktreeCreate",
  });
  schemas.worktreeCreateOutput.parse({
    hookSpecificOutput: {
      hookEventName: "WorktreeCreate",
      worktreePath: "/tmp/wt",
    },
  });
});

Deno.test("worktreeRemove parses", () => {
  schemas.worktreeRemoveInput.parse({
    ...base,
    hook_event_name: "WorktreeRemove",
    worktree_path: "/tmp/wt",
  });
});
