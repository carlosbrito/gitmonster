import { z } from "zod";
import { AI_PROVIDERS, type AiProvider } from "../shared/types";

/** Validação nas bordas: tudo que chega do renderer é não confiável. */
export const rootSchema = z.string().min(1).max(32_767);

const pathSchema = z.string().min(1).max(4096);

/** Id de item do menu da aplicação (ver `shared/appMenu`). */
export const menuIdSchema = z.string().min(1).max(64);

export const logArgsSchema = z.object({
  root: rootSchema,
  skip: z.number().int().min(0),
  limit: z.number().int().min(1).max(5000),
});

export const diffArgsSchema = z.object({
  root: rootSchema,
  target: z.object({ path: pathSchema, staged: z.boolean(), untracked: z.boolean() }),
});

export const pathsArgsSchema = z.object({
  root: rootSchema,
  paths: z.array(pathSchema).min(1).max(5000),
});

export const hunkArgsSchema = z.object({
  root: rootSchema,
  hunk: z.object({
    path: pathSchema,
    hunkIndex: z.number().int().min(0).max(100_000),
    hunkHeader: z.string().min(1).max(2000),
  }),
});

export const commitArgsSchema = z.object({
  root: rootSchema,
  message: z.string().max(100_000),
  amend: z.boolean(),
});

const nameSchema = z.string().min(1).max(255);
const hashSchema = z.string().min(7).max(40);

export const remoteCheckoutPlanArgsSchema = z.object({ root: rootSchema, name: nameSchema });
export const checkoutArgsSchema = z.object({
  root: rootSchema,
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("local"), name: nameSchema }),
    z.object({ kind: z.literal("remote"), name: nameSchema, matchRemote: z.boolean().optional() }),
    z.object({ kind: z.literal("commit"), hash: z.string().min(7).max(40) }),
  ]),
});

export const createBranchArgsSchema = z.object({
  root: rootSchema,
  name: nameSchema,
  startPoint: nameSchema.nullable(),
  checkout: z.boolean(),
});

export const deleteBranchArgsSchema = z.object({ root: rootSchema, name: nameSchema, force: z.boolean() });

export const mergeArgsSchema = z.object({ root: rootSchema, name: nameSchema });

export const rebaseBranchArgsSchema = z.object({ root: rootSchema, branch: nameSchema, onto: nameSchema });
export const mergeIntoArgsSchema = z.object({ root: rootSchema, source: nameSchema, target: nameSchema });

export const stashPushArgsSchema = z.object({
  root: rootSchema,
  message: z.string().max(1000),
  includeUntracked: z.boolean(),
});

export const stashIndexArgsSchema = z.object({ root: rootSchema, index: z.number().int().min(0).max(100_000) });

export const commitDetailArgsSchema = z.object({ root: rootSchema, hash: hashSchema });

export const commitFileDiffArgsSchema = z.object({ root: rootSchema, hash: hashSchema, path: pathSchema });

export const resetArgsSchema = z.object({ root: rootSchema, hash: hashSchema, mode: z.enum(["soft", "mixed", "hard"]) });

export const createTagArgsSchema = z.object({
  root: rootSchema,
  name: nameSchema,
  hash: hashSchema.nullable(),
  message: z.string().max(10_000),
});

export const cloneArgsSchema = z.object({ url: z.string().max(2048) });

export const addRemoteArgsSchema = z.object({ root: rootSchema, name: z.string().min(1).max(100), url: z.string().max(2048) });

export const removeRemoteArgsSchema = z.object({ root: rootSchema, name: z.string().min(1).max(100) });

export const renameBranchArgsSchema = z.object({ root: rootSchema, oldName: nameSchema, newName: nameSchema });

export const deleteRemoteBranchArgsSchema = z.object({ root: rootSchema, remote: z.string().min(1).max(100), branch: nameSchema });

export const gitProfileGetArgsSchema = z.object({ root: rootSchema.nullable() });

export const gitProfileSetArgsSchema = z.object({
  root: rootSchema.nullable(),
  scope: z.enum(["global", "local"]),
  name: z.string().max(400),
  email: z.string().max(400),
});

export const openInEditorArgsSchema = z.object({ root: rootSchema, path: pathSchema });

export const openFolderArgsSchema = z.object({ root: rootSchema });

export const githubStatusArgsSchema = z.object({ root: rootSchema.nullable() });

export const githubConnectArgsSchema = z.object({ token: z.string().min(1).max(512) });

export const githubPullsArgsSchema = z.object({ root: rootSchema, state: z.enum(["open", "closed", "all"]) });

export const githubPullArgsSchema = z.object({ root: rootSchema, number: z.number().int().min(1).max(1_000_000_000) });

export const githubCreatePullArgsSchema = z.object({
  root: rootSchema,
  title: z.string().max(1000),
  body: z.string().max(100_000),
  base: z.string().max(255),
  draft: z.boolean(),
});

export const searchArgsSchema = z.object({
  root: rootSchema,
  field: z.enum(["message", "author", "hash", "file", "content"]),
  query: z.string().min(1).max(200),
});

export const fileHistoryArgsSchema = z.object({
  root: rootSchema,
  path: pathSchema,
  skip: z.number().int().min(0),
  limit: z.number().int().min(1).max(5000),
});

export const blameArgsSchema = z.object({ root: rootSchema, path: pathSchema, rev: z.string().min(1).max(255).nullable() });

export const conflictPathArgsSchema = z.object({ root: rootSchema, path: pathSchema });

export const conflictResolveArgsSchema = z.object({
  root: rootSchema,
  path: pathSchema,
  content: z.string().max(10_000_000),
});

export const conflictSideArgsSchema = z.object({ root: rootSchema, path: pathSchema, side: z.enum(["ours", "theirs"]) });

export const pullArgsSchema = z.object({ root: rootSchema, mode: z.enum(["ff-only", "merge", "rebase"]) });

export const rebaseArgsSchema = z.object({ root: rootSchema, onto: nameSchema });

export const rebaseInteractiveArgsSchema = z.object({
  root: rootSchema,
  onto: nameSchema,
  steps: z
    .array(z.object({ action: z.enum(["pick", "squash", "fixup", "drop"]), hash: hashSchema }))
    .min(1)
    .max(500),
});

const aiProviderSchema = z.enum(AI_PROVIDERS as [AiProvider, ...AiProvider[]]);
const aiRequestId = z.string().min(1).max(100);

/** As preferências inteiras são validadas a fundo em `saveAiSettings`; aqui só se garante que é um objeto. */
export const aiSettingsSetArgsSchema = z.object({}).passthrough();
export const aiKeySetArgsSchema = z.object({ provider: aiProviderSchema, key: z.string().min(1).max(1024) });
export const aiKeyClearArgsSchema = z.object({ provider: aiProviderSchema });
export const aiTestArgsSchema = z.object({ provider: aiProviderSchema, baseUrl: z.string().max(2048), key: z.string().max(1024).nullable() });
export const aiCommitMessageArgsSchema = z.object({ root: rootSchema, amend: z.boolean(), requestId: aiRequestId });
export const aiExplainArgsSchema = z.object({
  root: rootSchema,
  target: z.discriminatedUnion("kind", [z.object({ kind: z.literal("worktree") }), z.object({ kind: z.literal("commit"), hash: hashSchema })]),
  requestId: aiRequestId,
});
export const aiStashMessageArgsSchema = z.object({ root: rootSchema, includeUntracked: z.boolean(), requestId: aiRequestId });
export const aiConflictArgsSchema = z.object({ root: rootSchema, path: pathSchema, requestId: aiRequestId });
export const aiPullRequestArgsSchema = z.object({ root: rootSchema, base: z.string().max(255), requestId: aiRequestId });
export const aiCancelArgsSchema = z.object({ requestId: aiRequestId });
