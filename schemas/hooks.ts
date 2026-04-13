/** Shared Zod schemas for Claude Code hooks

    This module provides type-safe schemas for all hook input and output
    formats.

    Documentation: https://code.claude.com/docs/en/hooks
 */

import { z } from "zod";
import { postTool, preTool } from "./tools.ts";

/** Current permission mode. */
export const permissionMode = z.enum([
  "default",
  "plan",
  "acceptEdits",
  "bypassPermissions",
]);

/** Attributes common to all input payloads.
 */
export const genericInput = z.object({
  hook_event_name: z.string(),

  /** Unique identifier for the session. */
  session_id: z.string(),

  /** Path to conversation JSON. */
  transcript_path: z.string(),

  /** The current working directory when the hook is invoked */
  cwd: z.string(),
});

/** Attributes common to all output payloads.
 */
export const genericOutput = z
  .object({
    /** Hide stdout from transcript mode.

        @default false
     */
    suppressOutput: z.boolean().optional().default(false),

    /** Optional warning message shown to the user. */
    systemMessage: z.string().optional(),
  })
  .and(
    z.discriminatedUnion("continue", [
      z.object({
        /** Stop processing after all hooks are run.

            Overrides any `"decision": "block"` output.
         */
        continue: z.literal(false),

        /** Message shown to the user when `continue` is false.

            The text is printed directly to the terminal and is not visible to
            Claude.
         */
        stopReason: z.string().optional(),
      }),
      z.object({
        /** Continue processing.
         */
        continue: z.literal(true).optional(),
      }),
    ]),
  );

export const preToolUseInput = genericInput
  .extend({
    hook_event_name: z.literal("PreToolUse"),
    /** Current permission mode. */
    permission_mode: permissionMode,
  })
  .and(preTool);

export const preToolUseOutput = genericOutput.and(
  z.object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("PreToolUse"),

        /** A text description shown to the user.

            Claude only sees this text when `permissionDecision` is `deny`.
         */
        permissionDecisionReason: z.string(),
      })
      .and(
        z.discriminatedUnion("permissionDecision", [
          z.object({
            /** Prevents the tool call from executing. */
            permissionDecision: z.literal("deny"),
          }),
          z.object({
            permissionDecision: z.enum([
              /** Bypasses the permission system. */
              "allow",
              /** Asks the user to confirm the tool call in the UI. */
              "ask",
            ]),

            /** Modifications to tool inputs prior to execution by Claude. */
            updatedInput: z.record(z.string(), z.any()).optional(),
          }),
        ]),
      ),
  }),
);

export const postToolUseInput = genericInput
  .extend({
    hook_event_name: z.literal("PostToolUse"),
    /** Current permission mode. */
    permission_mode: permissionMode,
  })
  .and(postTool);

export const postToolUseOutput = genericOutput.and(
  z
    .object({
      /** Additional context for Claude to consider. */
      hookSpecificOutput: z
        .object({
          hookEventName: z.literal("PostToolUse"),
          /** Additional context for Claude to consider. */
          additionalContext: z.string(),
        })
        .optional(),
    })
    .and(
      z.discriminatedUnion("decision", [
        z.object({
          decision: z.literal("block"),
          /** Explanation for decision. */
          reason: z.string(),
        }),
        z.object({
          decision: z.literal("allow").optional(),
        }),
      ]),
    ),
);

export const notificationInput = genericInput.extend({
  hook_event_name: z.literal("Notification"),

  /** Message payload intended for user display.

      @example "Task completed successfully"
   */
  message: z.string(),
});

export const notificationOutput = genericOutput;

export const userPromptSubmitInput = genericInput.extend({
  hook_event_name: z.literal("UserPromptSubmit"),
  /** Current permission mode. */
  permission_mode: permissionMode,

  /** The prompt submitted by the user. */
  prompt: z.string(),
});

export const userPromptSubmitOutput = genericOutput.and(
  z.discriminatedUnion("decision", [
    z.object({
      /** Prevents the prompt from being processed. */
      decision: z.literal("block"),

      /** Explanation for decision. It is shown to the user but not added to
          context.
       */
      reason: z.string(),
    }),
    z.object({
      decision: z.literal("allow").optional(),

      /** Additional context for Claude to consider. */
      hookSpecificOutput: z
        .object({
          hookEventName: z.literal("UserPromptSubmit"),
          /** Additional context for Claude to consider. */
          additionalContext: z.string(),
        })
        .optional(),
    }),
  ]),
);

export const stopInput = genericInput.extend({
  hook_event_name: z.literal("Stop"),
  /** Current permission mode. */
  permission_mode: permissionMode,

  /** `true` when Claude Code is already continuing as a result of a stop
       hook.

       Check this value or process the transcript to prevent Claude Code from
       running indefinitely.
   */
  stop_hook_active: z.boolean(),
});

export const stopOutput = genericOutput.and(
  z.discriminatedUnion("decision", [
    z.object({
      /** Prevent Claude from stopping. */
      decision: z.literal("block"),

      /** Tell Claude how to proceed. */
      reason: z.string(),
    }),
    z.object({
      decision: z.literal("allow").optional(),
    }),
  ]),
);

export const subagentStopInput = genericInput.extend({
  hook_event_name: z.literal("SubagentStop"),

  /** `true` when Claude Code is already continuing as a result of a stop
       hook.

       Check this value or process the transcript to prevent Claude Code
       from running indefinitely.
   */
  stop_hook_active: z.boolean(),
});

export const subagentStopOutput = genericOutput.and(
  z.discriminatedUnion("decision", [
    z.object({
      /** Prevent Claude from stopping. */
      decision: z.literal("block"),

      /** Tell Claude how to proceed. */
      reason: z.string(),
    }),
    z.object({
      decision: z.literal("allow").optional(),
    }),
  ]),
);

export const preCompactInput = genericInput
  .extend({
    hook_event_name: z.literal("PreCompact"),
  })
  .and(
    z.discriminatedUnion("trigger", [
      z.object({
        /** Invoked from auto-compact (due to full context window). */
        trigger: z.literal("auto"),
      }),
      z.object({
        /** Invoked manually via `/compact`. */
        trigger: z.literal("manual"),

        /** Arguments given to `/compact` by the user for a `manual`
            compaction.
        */
        custom_instructions: z
          .string()
          .transform((it) => (it.length === 0 ? undefined : it)),
      }),
    ]),
  );

export const preCompactOutput = genericOutput;

export const sessionStartInput = genericInput.extend({
  hook_event_name: z.literal("SessionStart"),
  source: z.enum([
    /** Invoked from startup. */
    "startup",
    /** Invoked from `--resume`, `--continue`, or `/resume`. */
    "resume",
    /** Invoked from `/clear` */
    "clear",
    /** Invoked from auto or manual compact. */
    "compact",
  ]),
});

export const sessionStartOutput = genericOutput.and(
  z.object({
    /** Additional context for Claude to consider. */
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("SessionStart"),

        /** Additional context for Claude to consider.

            Multiple hooks' `additionalContext` values are concatenated.
         */
        additionalContext: z.string(),
      })
      .optional(),
  }),
);

export const sessionEndInput = genericInput.extend({
  hook_event_name: z.literal("SessionEnd"),
  reason: z.enum([
    /** Session cleared with `/clear` command. */
    "clear",
    /** User logged out. */
    "logout",
    /** User exited while prompt input was visible. */
    "prompt_input_exit",
    /** Other exit reasons. */
    "other",
    /** Not documented, but shown in example. */
    "exit",
  ]),
});

export const sessionEndOutput = genericOutput;

export const instructionsLoadedInput = genericInput.extend({
  hook_event_name: z.literal("InstructionsLoaded"),

  /** Absolute path to the loaded instruction file. */
  file_path: z.string(),

  /** The kind of memory that was loaded (e.g. "project", "user"). */
  memory_type: z.string(),

  /** Why the file was loaded (e.g. "session_start", "nested_traversal"). */
  load_reason: z.string(),

  /** Globs that matched, when applicable. */
  globs: z.array(z.string()).optional(),

  /** Path that triggered the load (for nested/glob matches). */
  trigger_file_path: z.string().optional(),

  /** Parent file when the load came from an `@include` directive. */
  parent_file_path: z.string().optional(),
});

export const instructionsLoadedOutput = genericOutput;

export const stopFailureInput = genericInput.extend({
  hook_event_name: z.literal("StopFailure"),

  /** Details about the API error that ended the turn. */
  error: z.record(z.string(), z.unknown()),
});

export const stopFailureOutput = genericOutput;

const permissionDecisionBehavior = z.discriminatedUnion("behavior", [
  z.object({
    behavior: z.literal("allow"),
    /** Modifications to tool inputs prior to execution. */
    updatedInput: z.record(z.string(), z.unknown()).optional(),
    /** Permission rules to persist for the session. */
    updatedPermissions: z.array(z.unknown()).optional(),
    /** Message shown to the user. */
    message: z.string().optional(),
  }),
  z.object({
    behavior: z.literal("deny"),
    message: z.string().optional(),
  }),
]);

export const permissionRequestInput = genericInput
  .extend({
    hook_event_name: z.literal("PermissionRequest"),
    /** Current permission mode. */
    permission_mode: permissionMode,

    /** Suggestions surfaced alongside the permission prompt. */
    permission_suggestions: z.array(z.unknown()).optional(),
  })
  .and(preTool);

export const permissionRequestOutput = genericOutput.and(
  z.object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("PermissionRequest"),
        decision: permissionDecisionBehavior,
      })
      .optional(),
  }),
);

export const permissionDeniedInput = genericInput
  .extend({
    hook_event_name: z.literal("PermissionDenied"),
    permission_mode: permissionMode,

    /** Why the auto-mode classifier denied the call. */
    reason: z.string(),
  })
  .and(preTool);

export const permissionDeniedOutput = genericOutput.and(
  z.object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("PermissionDenied"),
        /** When true, the tool call is retried. */
        retry: z.boolean(),
      })
      .optional(),
  }),
);

export const postToolUseFailureInput = genericInput
  .extend({
    hook_event_name: z.literal("PostToolUseFailure"),
    permission_mode: permissionMode,

    /** Details about the tool-execution failure. */
    error: z.unknown(),

    /** True when the failure was caused by a user interrupt. */
    is_interrupt: z.boolean().optional(),
  })
  .and(preTool);

export const postToolUseFailureOutput = genericOutput.and(
  z.object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("PostToolUseFailure"),
        additionalContext: z.string(),
      })
      .optional(),
  }),
);

const elicitationAction = z.enum(["accept", "decline", "cancel"]);

export const elicitationInput = genericInput.extend({
  hook_event_name: z.literal("Elicitation"),

  /** MCP server that issued the elicitation request. */
  server_name: z.string().optional(),

  /** Opaque request payload from the MCP server. */
  request: z.unknown().optional(),
});

export const elicitationOutput = genericOutput.and(
  z.object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("Elicitation"),
        action: elicitationAction,
        /** Form field values when `action` is "accept". */
        content: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  }),
);

export const elicitationResultInput = genericInput.extend({
  hook_event_name: z.literal("ElicitationResult"),
  server_name: z.string().optional(),

  /** Opaque user-response payload. */
  response: z.unknown().optional(),
});

export const elicitationResultOutput = genericOutput.and(
  z.object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("ElicitationResult"),
        action: elicitationAction,
        content: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  }),
);

export const subagentStartInput = genericInput.extend({
  hook_event_name: z.literal("SubagentStart"),

  /** Unique id of the spawned subagent. */
  agent_id: z.string(),

  /** Type of agent (e.g. "Bash", "Explore", "Plan", or a custom name). */
  agent_type: z.string(),
});

export const subagentStartOutput = genericOutput.and(
  z.object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("SubagentStart"),
        additionalContext: z.string(),
      })
      .optional(),
  }),
);

export const teammateIdleInput = genericInput.extend({
  hook_event_name: z.literal("TeammateIdle"),

  /** Teammate identity and state. */
  teammate: z.record(z.string(), z.unknown()).optional(),
});

export const teammateIdleOutput = genericOutput.and(
  z.discriminatedUnion("decision", [
    z.object({
      decision: z.literal("block"),
      reason: z.string(),
    }),
    z.object({
      decision: z.literal("allow").optional(),
    }),
  ]),
);

export const taskCreatedInput = genericInput.extend({
  hook_event_name: z.literal("TaskCreated"),

  task_id: z.string(),
  task_subject: z.string(),
  task_description: z.string().optional(),
  teammate_name: z.string().optional(),
  team_name: z.string().optional(),
});

export const taskCreatedOutput = genericOutput.and(
  z.discriminatedUnion("decision", [
    z.object({
      decision: z.literal("block"),
      reason: z.string(),
    }),
    z.object({
      decision: z.literal("allow").optional(),
    }),
  ]),
);

export const taskCompletedInput = genericInput.extend({
  hook_event_name: z.literal("TaskCompleted"),

  task_id: z.string(),
  task_subject: z.string().optional(),
  teammate_name: z.string().optional(),
  team_name: z.string().optional(),
});

export const taskCompletedOutput = genericOutput.and(
  z.discriminatedUnion("decision", [
    z.object({
      decision: z.literal("block"),
      reason: z.string(),
    }),
    z.object({
      decision: z.literal("allow").optional(),
    }),
  ]),
);

export const fileChangedInput = genericInput.extend({
  hook_event_name: z.literal("FileChanged"),

  /** Absolute path to the file that changed. */
  file_path: z.string(),

  /** Kind of change detected (e.g. "created", "modified", "deleted"). */
  change_type: z.string(),
});

export const fileChangedOutput = genericOutput;

export const cwdChangedInput = genericInput.extend({
  hook_event_name: z.literal("CwdChanged"),

  /** Previous working directory. */
  old_cwd: z.string(),

  /** New working directory. */
  new_cwd: z.string(),
});

export const cwdChangedOutput = genericOutput;

export const configChangeInput = genericInput.extend({
  hook_event_name: z.literal("ConfigChange"),

  /** Which config scope changed. */
  config_source: z.enum([
    "user_settings",
    "project_settings",
    "local_settings",
    "policy_settings",
    "skills",
  ]),

  /** Fields that changed. */
  changed_fields: z.array(z.string()).optional(),
});

export const configChangeOutput = genericOutput.and(
  z.discriminatedUnion("decision", [
    z.object({
      decision: z.literal("block"),
      reason: z.string(),
    }),
    z.object({
      decision: z.literal("allow").optional(),
    }),
  ]),
);

export const postCompactInput = genericInput
  .extend({
    hook_event_name: z.literal("PostCompact"),
  })
  .and(
    z.discriminatedUnion("trigger", [
      z.object({
        /** Follow-up to an auto-compact. */
        trigger: z.literal("auto"),
      }),
      z.object({
        /** Follow-up to a manual `/compact`. */
        trigger: z.literal("manual"),
        custom_instructions: z
          .string()
          .optional()
          .transform((it) => (it && it.length > 0 ? it : undefined)),
      }),
    ]),
  );

export const postCompactOutput = genericOutput;

export const worktreeCreateInput = genericInput.extend({
  hook_event_name: z.literal("WorktreeCreate"),

  /** Requested parameters for the new worktree. */
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const worktreeCreateOutput = genericOutput.and(
  z.object({
    hookSpecificOutput: z
      .object({
        hookEventName: z.literal("WorktreeCreate"),

        /** Path of the created worktree. */
        worktreePath: z.string(),
      })
      .optional(),
  }),
);

export const worktreeRemoveInput = genericInput.extend({
  hook_event_name: z.literal("WorktreeRemove"),

  /** Path of the worktree being removed. */
  worktree_path: z.string().optional(),
});

export const worktreeRemoveOutput = genericOutput;
