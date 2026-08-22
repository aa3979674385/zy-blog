import { createServerFn } from "@tanstack/react-start";
import {
  DeleteSearchDocSchema,
  UpsertSearchDocSchema,
} from "@/features/search/search.schema";
import * as SearchService from "@/features/search/service/search.service";
import { getRebuildStatus } from "@/features/search/model/store";
import { adminMiddleware, dbMiddleware } from "@/lib/middlewares";

export const buildSearchIndexFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => {
    // 通过 Workflow 异步分批重建，支持万级文章量
    await context.env.SEARCH_REBUILD_WORKFLOW.create({ params: {} });
    return { triggered: true };
  });

export const getRebuildStatusFn = createServerFn()
  .middleware([adminMiddleware])
  .handler(async ({ context }) => {
    return await getRebuildStatus(context.env);
  });

export const upsertSearchDocFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(UpsertSearchDocSchema)
  .handler(({ data, context }) => SearchService.upsert(context, data));

export const deleteSearchDocFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(DeleteSearchDocSchema)
  .handler(({ data, context }) => SearchService.deleteIndex(context, data));

export const getIndexVersionFn = createServerFn()
  .middleware([dbMiddleware])
  .handler(({ context }) => SearchService.getIndexVersion(context));
