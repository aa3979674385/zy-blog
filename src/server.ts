import { handleQueueBatch } from "@/lib/queue/queue.handler";

export { CommentModerationWorkflow } from "@/features/comments/workflows/comment-moderation";
export { PostAutoSnapshotWorkflow } from "@/features/posts/workflows/post-auto-snapshot";
export { PostProcessWorkflow } from "@/features/posts/workflows/post-process";
export { ScheduledPublishWorkflow } from "@/features/posts/workflows/scheduled-publish";
export { SearchRebuildWorkflow } from "@/features/search/workflows/search-rebuild-workflow";
export { PasswordHasher } from "@/lib/do/password-hasher";
export { RateLimiter } from "@/lib/do/rate-limiter";

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        env: Env;
        executionCtx: ExecutionContext<unknown>;
      };
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const { handleRootRequest } = await import("@/lib/worker/root-handler");
    return handleRootRequest(request, env, ctx);
  },
  async queue(batch, env, ctx) {
    await handleQueueBatch(batch, env, ctx);
  },
  async scheduled(event, env, ctx) {
    const { handleScheduled } = await import("@/lib/worker/scheduled-handler");
    await handleScheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env>;
