import "server-only";
import { z } from "zod";
import { J, zId } from "./schema";
import { fail, ok, type ToolContext, type ToolDefinition } from "./types";

const MAX_MEMORIES = 100;
const zContent = z.string().trim().min(1).max(500);

async function loadOwnMemory(ctx: ToolContext, id: string) {
  const { data } = await ctx.db.from("user_memories").select("id, content").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
  return data as { id: string; content: string } | null;
}

const saveInput = z.object({ content: zContent });

export const saveMemory: ToolDefinition<typeof saveInput> = {
  name: "save_memory",
  description:
    "Remember a durable fact or preference the user wants you to keep in mind (e.g. \"I prefer studying in the morning\"). Write it in the user's voice, one fact per memory.",
  parameters: J.object({ content: J.string("The fact or preference, e.g. \"I prefer studying in the morning.\"") }),
  input: saveInput,
  risk: "direct",
  runningLabel: () => "Saving that…",
  async execute(ctx, args) {
    const { data: existing, count } = await ctx.db.from("user_memories").select("content", { count: "exact" }).eq("user_id", ctx.userId);
    if ((existing ?? []).some((m) => String(m.content).trim().toLowerCase() === args.content.toLowerCase())) {
      return ok("I already have that saved.");
    }
    if ((count ?? 0) >= MAX_MEMORIES) return fail("limit", "I'm already remembering a lot — remove something in Settings first.");
    const { data, error } = await ctx.db
      .from("user_memories")
      .insert({ user_id: ctx.userId, content: args.content, kind: "preference", source: "assistant" })
      .select("id")
      .single();
    if (error || !data) return fail("server_error", "I couldn't save that.");
    return ok(`I'll remember: “${args.content}”`, { memory_id: data.id });
  },
};

const updateInput = z.object({ memory_id: zId, content: zContent });

export const updateMemory: ToolDefinition<typeof updateInput> = {
  name: "update_memory",
  description: "Correct or replace something you remember about the user.",
  parameters: J.object({ memory_id: J.string("Id of the memory"), content: J.string("The corrected fact or preference") }),
  input: updateInput,
  risk: "direct",
  runningLabel: () => "Updating that…",
  async execute(ctx, args) {
    const memory = await loadOwnMemory(ctx, args.memory_id);
    if (!memory) return fail("not_found", "I couldn't find that in what I remember.");
    const { error } = await ctx.db.from("user_memories").update({ content: args.content }).eq("id", memory.id).eq("user_id", ctx.userId);
    if (error) return fail("server_error", "I couldn't update that.");
    return ok(`Updated: “${args.content}”`, { memory_id: memory.id });
  },
};

const idInput = z.object({ memory_id: zId });

export const deleteMemory: ToolDefinition<typeof idInput> = {
  name: "delete_memory",
  description: "Forget something you remember about the user. Requires the user's confirmation — this only proposes it.",
  parameters: J.object({ memory_id: J.string("Id of the memory") }),
  input: idInput,
  risk: "confirm",
  runningLabel: () => "Preparing to forget that…",
  async describe(ctx, args) {
    const memory = await loadOwnMemory(ctx, args.memory_id);
    return memory ? `Forget “${memory.content}”` : null;
  },
  async execute(ctx, args) {
    const memory = await loadOwnMemory(ctx, args.memory_id);
    if (!memory) return fail("not_found", "I couldn't find that in what I remember.");
    const { error } = await ctx.db.from("user_memories").delete().eq("id", memory.id).eq("user_id", ctx.userId);
    if (error) return fail("server_error", "I couldn't remove that.");
    return ok(`Forgot “${memory.content}”.`, { memory_id: memory.id });
  },
};
