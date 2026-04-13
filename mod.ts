/**
 * Type-safe Deno library for building [Claude Code](https://code.claude.com) hooks
 * with runtime validation. Using this lib you can write self-contained hook
 * scripts with LSP completions and editor squiggles to guide you.
 *
 * ## Quick Start
 *
 * The example below will teach Claude Code to use the `say` command on macOS to
 * announce when it's compacting. The announcement is a bit terser if compaction
 * was user-initiated via `/compact`.
 *
 * ```typescript
 * #!/usr/bin/env -S deno run --allow-env --allow-read --allow-write --allow-run
 * import { preCompact } from "jsr:@chrisbarrett/claude-code-hook";
 * import $ from "jsr:@david/dax";
 *
 * preCompact(async (input) => {
 *   const message = input.trigger === "auto"
 *     ? "Auto-compaction started"
 *     : "Compacting";
 *
 *   await $`nohup -- say ${message}`;
 * });
 * ```
 *
 * Don't forget to `chmod +x`!
 *
 * **Configure in `~/.claude/settings.json`:**
 *
 * ```json
 * {
 *   "hooks": {
 *     "PreCompact": [
 *       {
 *         "hooks": [
 *           {
 *             "type": "command",
 *             "command": "/path/to/your/script"
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * ## Testing Your Hooks
 *
 * The `runHook` function from `@chrisbarrett/claude-code-hook/testing` helps
 * you write tests for your hooks. You pass an object representing the JSON
 * input, and get back an object you can write assertions against.
 *
 * ```typescript
 * import { expect } from "jsr:@std/expect";
 * import { runHook } from "jsr:@chrisbarrett/claude-code-hook/testing";
 *
 * const hookPath = import.meta.resolve("./hooks/pre-compact.ts");
 *
 * Deno.test("preCompact hook handles auto trigger", async () => {
 *   const result = await runHook(hookPath, {
 *     hook_event_name: "PreCompact",
 *     session_id: "test-session",
 *     transcript_path: "/tmp/transcript.json",
 *     cwd: "/tmp",
 *     trigger: "auto",
 *   });
 *
 *   expect(result).toMatchObject({
 *     status: 0,
 *     stdout: "",
 *   });
 * });
 * ```
 *
 * As a convenience, if stdout or stderr happen to start with a '{' they will be
 * parsed as JSON objects, making it convenient to write object matchers against
 * your hook output.
 *
 * ## Logging & Debugging
 *
 * The library provides structured logging via [LogTape](https://jsr.io/@logtape/logtape).
 *
 * A logger is passed to your handlers via the `context` parameter--you should
 * use that rather than logging to the console directly, since Claude Code uses
 * stdout as its comms channel. :)
 *
 * ```typescript
 * import { sessionStart } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * sessionStart(async (input, ctx) => {
 *   ctx.logger.info("Hello, world!")
 * });
 * ```
 *
 * Logs are written to `~/.claude/hooks.log` (or `/tmp/claude/hooks.log` if `HOME`
 * is not set) and to stderr.
 *
 * ## Environment Variables
 *
 * ### CLAUDE_CODE_HOOK_STDIN_MAX_BUF_LEN
 *
 * Controls the maximum buffer size for stdin reads (default: 10 MiB).
 *
 * **Example:**
 * ```bash
 * export CLAUDE_CODE_HOOK_STDIN_MAX_BUF_LEN=20971520  # 20 MiB
 * ```
 *
 * ### CLAUDE_CODE_HOOK_LOG_FILE
 *
 * Sets the file path used for logging output. If unset, logs are written to
 * `~/.claude/hooks.log` (or `/tmp/claude/hooks.log` if `HOME` is not set).
 *
 * ### CLAUDE_ENV_FILE
 *
 * Available only in `SessionStart` hooks. Path to a file where environment
 * variables can be persisted for subsequent bash commands.
 *
 * You can use the {@link persistEnvVar} helper in {@link sessionStart}'s
 * context to write to this file:
 *
 * ```typescript
 * import { sessionStart } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * sessionStart(async (input, ctx) => {
 *   await ctx.persistEnvVar("MY_API_KEY", "secret-value");
 *   // MY_API_KEY now available in all subsequent bash commands
 * });
 * ```
 *
 * ## Permission Requirements
 *
 * Hooks require explicit Deno permissions:
 *
 * - `--allow-read` - stdin operations (always required)
 * - `--allow-write` - file operations (e.g., {@link persistEnvVar})
 * - `--allow-env` - environment variable access
 *
 * @module
 * @see {@link https://code.claude.com/docs/en/hooks | Claude Code Hooks Documentation}
 */
import * as schemas from "./schemas/hooks.ts";
import { defineHook, type HookDef } from "./define-hook.ts";
import { persistEnvVar } from "./env.ts";

/**
 * Runs after Claude creates tool parameters and before processing the tool call.
 *
 * The result determines whether the tool call is allowed to proceed.
 * stdout is shown in the Ctrl-R transcript.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#pretooluse | PreToolUse Hook Documentation}
 *
 * @example Block specific tools
 * ```typescript
 * import { preToolUse } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * preToolUse(async (input) => {
 *   const blockedTools = ["Write", "Edit"];
 *
 *   if (blockedTools.includes(input.tool.tool_name)) {
 *     return {
 *       hookSpecificOutput: {
 *         hookEventName: "PreToolUse",
 *         shouldProceed: false,
 *         blockedMessage: `Tool ${input.tool.tool_name} not allowed in production`,
 *       },
 *     };
 *   }
 * });
 * ```
 *
 * @example Validate file paths
 * ```typescript
 * import { preToolUse } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * preToolUse(async (input) => {
 *   if (input.tool.tool_name === "Read") {
 *     const filePath = input.tool.tool_input.file_path;
 *
 *     if (filePath.includes("secrets")) {
 *       return {
 *         hookSpecificOutput: {
 *           hookEventName: "PreToolUse",
 *           shouldProceed: false,
 *           blockedMessage: "Cannot read files in secrets directory",
 *         },
 *       };
 *     }
 *   }
 * });
 * ```
 *
 * @example Add context before tool execution
 * ```typescript
 * import { preToolUse } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * preToolUse(async (input) => {
 *   if (input.tool.tool_name === "Bash") {
 *     return {
 *       hookSpecificOutput: {
 *         hookEventName: "PreToolUse",
 *         additionalContext: "Running in staging environment",
 *       },
 *     };
 *   }
 * });
 * ```
 */
export const preToolUse: HookDef<
  typeof schemas.preToolUseInput,
  typeof schemas.preToolUseOutput
> = defineHook(schemas.preToolUseInput, schemas.preToolUseOutput, {});

/**
 * Runs immediately after a tool completes successfully.
 *
 * The result provides feedback to Claude after tool execution.
 * stdout is shown in the Ctrl-R transcript.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#posttooluse | PostToolUse Hook Documentation}
 *
 * @example Check bash command exit codes
 * ```typescript
 * import { postToolUse } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * postToolUse(async (input) => {
 *   if (input.tool.tool_name === "Bash") {
 *     const exitCode = input.tool.tool_response.exit_code;
 *
 *     if (exitCode !== 0) {
 *       return {
 *         hookSpecificOutput: {
 *           hookEventName: "PostToolUse",
 *           additionalContext: `Command failed with exit code ${exitCode}`,
 *         },
 *       };
 *     }
 *   }
 * });
 * ```
 *
 * @example Log file modifications
 * ```typescript
 * import { postToolUse } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * postToolUse(async (input) => {
 *   if (input.tool.tool_name === "Write" || input.tool.tool_name === "Edit") {
 *     const filePath = input.tool.tool_input.file_path;
 *     console.log(`Modified: ${filePath}`);
 *   }
 * });
 * ```
 */
export const postToolUse: HookDef<
  typeof schemas.postToolUseInput,
  typeof schemas.postToolUseOutput
> = defineHook(schemas.postToolUseInput, schemas.postToolUseOutput, {});

/**
 * Runs when Claude Code sends notifications.
 *
 * Notifications are sent when:
 *
 * 1. Claude needs your permission to use a tool. Example: "Claude needs your
 *    permission to use Bash"
 *
 * 2. The prompt input has been idle for at least 60 seconds. "Claude is
 *    waiting for your input"
 *
 * stdout is only shown when Claude is run with `--debug`.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#notification | Notification Hook Documentation}
 */
export const notification: HookDef<
  typeof schemas.notificationInput,
  typeof schemas.notificationOutput
> = defineHook(schemas.notificationInput, schemas.notificationOutput, {});

/**
 * Runs when the user submits a prompt, before Claude processes it.
 *
 * Allows you to add additional context based on the prompt/conversation,
 * validate prompts, or block certain types of prompts.
 *
 * If blocked, the submitted prompt is erased from the context.
 * stdout is added as context for Claude.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#userpromptsubmit | UserPromptSubmit Hook Documentation}
 *
 * @example Add dynamic context based on working directory
 * ```typescript
 * import { userPromptSubmit } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * userPromptSubmit(async (input) => {
 *   const isTestDir = input.workingDirectory.includes("/tests/");
 *
 *   if (isTestDir) {
 *     return {
 *       hookSpecificOutput: {
 *         hookEventName: "UserPromptSubmit",
 *         additionalContext: "You are working in the tests directory. Prioritize test-related suggestions.",
 *       },
 *     };
 *   }
 * });
 * ```
 *
 * @example Block prompts containing sensitive patterns
 * ```typescript
 * import { userPromptSubmit } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * userPromptSubmit(async (input) => {
 *   const prompt = input.prompt.toLowerCase();
 *
 *   if (prompt.includes("delete production") || prompt.includes("drop database")) {
 *     return {
 *       hookSpecificOutput: {
 *         hookEventName: "UserPromptSubmit",
 *         shouldProceed: false,
 *         blockedMessage: "Dangerous operations blocked in production environment",
 *       },
 *     };
 *   }
 * });
 * ```
 */
export const userPromptSubmit: HookDef<
  typeof schemas.userPromptSubmitInput,
  typeof schemas.userPromptSubmitOutput
> = defineHook(
  schemas.userPromptSubmitInput,
  schemas.userPromptSubmitOutput,
  {},
);

/** A general-purpose hook that can be used for any event.
 */
export const generic: HookDef<
  typeof schemas.genericInput,
  typeof schemas.genericOutput
> = defineHook(schemas.genericInput, schemas.genericOutput, {});

/**
 * Runs when the main Claude Code agent has finished responding. The output
 * controls whether Claude must continue.
 *
 * Does not run if the stoppage occurred due to a user interrupt.
 *
 * stdout is shown in the Ctrl-R transcript.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#stop | Stop Hook Documentation}
 */
export const stop: HookDef<
  typeof schemas.stopInput,
  typeof schemas.stopOutput
> = defineHook(schemas.stopInput, schemas.stopOutput, {});

/**
 * Runs when a Claude Code subagent (Task tool call) has finished responding.
 * The output controls whether Claude must continue.
 *
 * It is not documented whether this is run when a user interrupts a subagent.
 *
 * stdout is shown in the Ctrl-R transcript.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#subagentstop | SubagentStop Hook Documentation}
 */
export const subagentStop: HookDef<
  typeof schemas.subagentStopInput,
  typeof schemas.subagentStopOutput
> = defineHook(schemas.subagentStopInput, schemas.subagentStopOutput, {});

/**
 * Runs before Claude Code is about to run a compact operation.
 *
 * Compaction may be initiated by the user via the `/compact` command, or it
 * may be initiated automatically by Claude Code when context limits are
 * reached.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#precompact | PreCompact Hook Documentation}
 */
export const preCompact: HookDef<
  typeof schemas.preCompactInput,
  typeof schemas.preCompactOutput
> = defineHook(schemas.preCompactInput, schemas.preCompactOutput, {});

/**
 * Runs when Claude Code starts a new session or resumes an existing session.
 *
 * Useful for loading development context like existing issues or recent changes,
 * installing dependencies, or setting up environment variables.
 *
 * SessionStart hooks have access to {@link CLAUDE_ENV_FILE}, which provides a
 * file path where you can persist environment variables for subsequent bash commands.
 *
 * stdout is added as context for Claude.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#sessionstart | SessionStart Hook Documentation}
 *
 * @example Load git context
 * ```typescript
 * import { sessionStart } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * sessionStart(async (input) => {
 *   const decoder = new TextDecoder();
 *   const gitBranch = new Deno.Command("git", {
 *     args: ["branch", "--show-current"],
 *     cwd: input.workingDirectory,
 *   });
 *   const { stdout } = await gitBranch.output();
 *   const branch = decoder.decode(stdout).trim();
 *
 *   return {
 *     hookSpecificOutput: {
 *       hookEventName: "SessionStart",
 *       additionalContext: `Current git branch: ${branch}`,
 *     },
 *   };
 * });
 * ```
 *
 * @example Set environment variables for bash commands
 * ```typescript
 * import { persistEnvVar, sessionStart } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * sessionStart(async (input, ctx) => {
 *   await ctx.persistEnvVar("NODE_ENV", "development");
 *   await ctx.persistEnvVar("API_URL", "https://staging.example.com");
 *
 *   return {
 *     hookSpecificOutput: {
 *       hookEventName: "SessionStart",
 *       additionalContext: "Environment configured for staging",
 *     },
 *   };
 * });
 * ```
 *
 * @example Load issue tracking context
 * ```typescript
 * import { sessionStart } from "jsr:@chrisbarrett/claude-code-hook";
 *
 * sessionStart(async (input) => {
 *   const client = new IssueTrackerClient(Deno.env.get("ISSUE_TRACKER_AUTH_TOKEN"));
 *   const response = await client.getIssues()
 *   const issueList = issues.map((i) => `- ${i.id}: ${i.title}`).join("\n");
 *
 *   return {
 *     hookSpecificOutput: {
 *       hookEventName: "SessionStart",
 *       additionalContext: `Open issues:\n${issueList}`,
 *     },
 *   };
 * });
 * ```
 */
export const sessionStart: HookDef<
  typeof schemas.sessionStartInput,
  typeof schemas.sessionStartOutput,
  {
    /**
     * Persist an environment variable to {@link CLAUDE_ENV_FILE}.
     *
     * Makes the environment variable available in all subsequent bash commands
     * executed by Claude Code during the session.
     *
     * **Only available in `SessionStart` hooks.**
     *
     * @param name - Environment variable name (must match POSIX: [a-zA-Z_][a-zA-Z0-9_]*)
     * @param value - Environment variable value (automatically escaped for shell safety)
     *
     * @throws {Error} If name is invalid or CLAUDE_ENV_FILE is not set
     *
     * @example Basic usage
     * ```typescript
     * import { sessionStart } from "jsr:@chrisbarrett/claude-code-hook";
     *
     * sessionStart(async (input, ctx) => {
     *   await ctx.persistEnvVar("DATABASE_URL", "postgresql://localhost/mydb");
     *   await ctx.persistEnvVar("LOG_LEVEL", "debug");
     * });
     * ```
     */
    persistEnvVar: typeof persistEnvVar;
  }
> = defineHook(schemas.sessionStartInput, schemas.sessionStartOutput, {
  persistEnvVar,
});

/**
 * Runs when a Claude Code session ends. Useful for cleanup tasks, logging
 * session statistics, or saving session state.
 *
 * stdout is only shown when Claude is run with `--debug`.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#sessionend | SessionEnd Hook Documentation}
 */
export const sessionEnd: HookDef<
  typeof schemas.sessionEndInput,
  typeof schemas.sessionEndOutput
> = defineHook(schemas.sessionEndInput, schemas.sessionEndOutput, {});

/**
 * Runs when a `CLAUDE.md` or `.claude/rules/*.md` file is loaded into context.
 *
 * Useful for auditing or logging which instruction files are active in a
 * session. Cannot block loading.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#instructionsloaded | InstructionsLoaded Hook Documentation}
 */
export const instructionsLoaded: HookDef<
  typeof schemas.instructionsLoadedInput,
  typeof schemas.instructionsLoadedOutput
> = defineHook(
  schemas.instructionsLoadedInput,
  schemas.instructionsLoadedOutput,
  {},
);

/**
 * Runs when a turn ends due to an API error (rate limit, auth failure, etc.).
 *
 * Useful for surfacing notifications on failure. Output is ignored.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#stopfailure | StopFailure Hook Documentation}
 */
export const stopFailure: HookDef<
  typeof schemas.stopFailureInput,
  typeof schemas.stopFailureOutput
> = defineHook(schemas.stopFailureInput, schemas.stopFailureOutput, {});

/**
 * Runs when the permission dialog appears for a tool call.
 *
 * Allows automated decisions in place of user interaction. Return
 * `hookSpecificOutput.decision.behavior` as `"allow"` or `"deny"`.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#permissionrequest | PermissionRequest Hook Documentation}
 */
export const permissionRequest: HookDef<
  typeof schemas.permissionRequestInput,
  typeof schemas.permissionRequestOutput
> = defineHook(
  schemas.permissionRequestInput,
  schemas.permissionRequestOutput,
  {},
);

/**
 * Runs when the auto-mode classifier denies a tool call.
 *
 * Return `hookSpecificOutput.retry: true` to retry the tool call. Cannot
 * otherwise block.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#permissiondenied | PermissionDenied Hook Documentation}
 */
export const permissionDenied: HookDef<
  typeof schemas.permissionDeniedInput,
  typeof schemas.permissionDeniedOutput
> = defineHook(
  schemas.permissionDeniedInput,
  schemas.permissionDeniedOutput,
  {},
);

/**
 * Runs after a tool execution fails.
 *
 * Can attach `additionalContext` for Claude to consider alongside the error.
 * Cannot block (the tool has already failed).
 *
 * @see {@link https://code.claude.com/docs/en/hooks#posttooluosefailure | PostToolUseFailure Hook Documentation}
 */
export const postToolUseFailure: HookDef<
  typeof schemas.postToolUseFailureInput,
  typeof schemas.postToolUseFailureOutput
> = defineHook(
  schemas.postToolUseFailureInput,
  schemas.postToolUseFailureOutput,
  {},
);

/**
 * Runs when an MCP server requests user input during a tool call.
 *
 * Return `hookSpecificOutput.action` of `"accept"`, `"decline"`, or `"cancel"`
 * (with `content` for accept) to respond on the user's behalf.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#elicitation | Elicitation Hook Documentation}
 */
export const elicitation: HookDef<
  typeof schemas.elicitationInput,
  typeof schemas.elicitationOutput
> = defineHook(schemas.elicitationInput, schemas.elicitationOutput, {});

/**
 * Runs after the user responds to an MCP elicitation, before the response is
 * sent to the server.
 *
 * Can transform or veto the user's response.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#elicitationresult | ElicitationResult Hook Documentation}
 */
export const elicitationResult: HookDef<
  typeof schemas.elicitationResultInput,
  typeof schemas.elicitationResultOutput
> = defineHook(
  schemas.elicitationResultInput,
  schemas.elicitationResultOutput,
  {},
);

/**
 * Runs when a subagent is spawned (before it begins work).
 *
 * Can attach `additionalContext` for the subagent.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#subagentstart | SubagentStart Hook Documentation}
 */
export const subagentStart: HookDef<
  typeof schemas.subagentStartInput,
  typeof schemas.subagentStartOutput
> = defineHook(schemas.subagentStartInput, schemas.subagentStartOutput, {});

/**
 * Runs when an agent-team teammate is about to go idle.
 *
 * Return `decision: "block"` with a `reason` to keep the teammate active.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#teammateidle | TeammateIdle Hook Documentation}
 */
export const teammateIdle: HookDef<
  typeof schemas.teammateIdleInput,
  typeof schemas.teammateIdleOutput
> = defineHook(schemas.teammateIdleInput, schemas.teammateIdleOutput, {});

/**
 * Runs when a task is being created via `TaskCreate`.
 *
 * Return `decision: "block"` with a `reason` to prevent the task.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#taskcreated | TaskCreated Hook Documentation}
 */
export const taskCreated: HookDef<
  typeof schemas.taskCreatedInput,
  typeof schemas.taskCreatedOutput
> = defineHook(schemas.taskCreatedInput, schemas.taskCreatedOutput, {});

/**
 * Runs when a task is being marked as completed.
 *
 * Return `decision: "block"` with a `reason` to prevent completion.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#taskcompleted | TaskCompleted Hook Documentation}
 */
export const taskCompleted: HookDef<
  typeof schemas.taskCompletedInput,
  typeof schemas.taskCompletedOutput
> = defineHook(schemas.taskCompletedInput, schemas.taskCompletedOutput, {});

/**
 * Runs when a watched file changes on disk.
 *
 * Configured with a filename matcher (e.g. `.envrc|.env`). Cannot block.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#filechanged | FileChanged Hook Documentation}
 */
export const fileChanged: HookDef<
  typeof schemas.fileChangedInput,
  typeof schemas.fileChangedOutput
> = defineHook(schemas.fileChangedInput, schemas.fileChangedOutput, {});

/**
 * Runs when the working directory changes during a session.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#cwdchanged | CwdChanged Hook Documentation}
 */
export const cwdChanged: HookDef<
  typeof schemas.cwdChangedInput,
  typeof schemas.cwdChangedOutput
> = defineHook(schemas.cwdChangedInput, schemas.cwdChangedOutput, {});

/**
 * Runs when a configuration file changes during a session.
 *
 * Return `decision: "block"` with a `reason` to reject the change.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#configchange | ConfigChange Hook Documentation}
 */
export const configChange: HookDef<
  typeof schemas.configChangeInput,
  typeof schemas.configChangeOutput
> = defineHook(schemas.configChangeInput, schemas.configChangeOutput, {});

/**
 * Runs after a compact operation completes.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#postcompact | PostCompact Hook Documentation}
 */
export const postCompact: HookDef<
  typeof schemas.postCompactInput,
  typeof schemas.postCompactOutput
> = defineHook(schemas.postCompactInput, schemas.postCompactOutput, {});

/**
 * Runs when a git worktree is being created.
 *
 * Return `hookSpecificOutput.worktreePath` (or print the path to stdout) to
 * supply the created worktree location. Any non-zero exit fails the creation.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#worktreecreate | WorktreeCreate Hook Documentation}
 */
export const worktreeCreate: HookDef<
  typeof schemas.worktreeCreateInput,
  typeof schemas.worktreeCreateOutput
> = defineHook(schemas.worktreeCreateInput, schemas.worktreeCreateOutput, {});

/**
 * Runs when a git worktree is being removed.
 *
 * Failures are only surfaced in debug mode.
 *
 * @see {@link https://code.claude.com/docs/en/hooks#worktreeremove | WorktreeRemove Hook Documentation}
 */
export const worktreeRemove: HookDef<
  typeof schemas.worktreeRemoveInput,
  typeof schemas.worktreeRemoveOutput
> = defineHook(schemas.worktreeRemoveInput, schemas.worktreeRemoveOutput, {});
