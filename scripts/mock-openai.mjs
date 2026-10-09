#!/usr/bin/env node
/**
 * A scripted, deterministic stand-in for the OpenAI Responses API — for
 * automated tests only. The app talks to it through the test-only
 * OPENAI_BASE_URL (honoured only for loopback addresses and never on a
 * Vercel production deployment; see src/lib/env.ts), so every test runs the
 * REAL pipeline: the app builds the real context and history, the mock
 * replies or calls a tool, the app runs the real tool against the database,
 * and the mock's final reply is built from what the tool actually returned.
 *
 * It never invents data: replies are computed from the context and messages
 * the app sent (tasks, times, calendar, memories, pending changes).
 *
 *   node scripts/mock-openai.mjs [--port 4010]
 *   OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:4010/v1 npm start
 *
 * Test controls (not part of the OpenAI API):
 *   GET  /__requests        what the app sent (summaries + the context text)
 *   POST /__reset           clear captured requests and scripted behaviour
 *   POST /__script {lie?: true, status?: 500}
 *        lie:    the next final reply claims success no matter what the tool
 *                returned (to prove the server's honesty guard)
 *        status: answer the next request with this HTTP error
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------- reading the app's input

const toMin = (t12) => {
  const m = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(t12.trim());
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + Number(m[2]);
};
const t12 = (min) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n, noun) => `${WORDS[n] ?? n} ${noun}${n === 1 ? "" : "s"}`;
const text = (content) => (typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c.text ?? "").join("") : "");

function section(ctx, name) {
  const start = ctx.indexOf(`## ${name}`);
  if (start < 0) return "";
  const rest = ctx.slice(start);
  const end = rest.indexOf("\n## ", 3);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Parse the rendered user context (src/lib/ai/context-format.ts). */
export function parseContext(ctx) {
  const nowLine = section(ctx, "Now").split("\n")[1] ?? "";
  const nowMatch = /(\d{4}-\d{2}-\d{2}), (\d{1,2}:\d{2} [AP]M)/.exec(nowLine);
  const tasks = section(ctx, "Today's tasks")
    .split("\n")
    .map((l) => /^- \[(\w+)\] (.+?)(?: at (\d{1,2}:\d{2} [AP]M))?(?: \((\d+) min\))?( — priority)?(?: → (.+?))?(?: \(task id: ([0-9a-f-]{36})\))?$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ status: m[1], title: m[2], start: m[3] ? toMin(m[3]) : null, duration: m[4] ? Number(m[4]) : null, priority: Boolean(m[5]), goal: m[6] ?? null, id: m[7] ?? null }));
  const cal = section(ctx, "Calendar");
  const todayCal = cal.split(/\nTomorrow \(/)[0];
  const events = todayCal
    .split("\n")
    .map((l) => /^- (\d{1,2}:\d{2} [AP]M)–(\d{1,2}:\d{2} [AP]M|midnight): (.+?)(?: @ .+?)?(?: \(.*)?$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ start: toMin(m[1]), end: m[2] === "midnight" ? 1440 : toMin(m[2]), title: m[3].trim() }));
  const windowsLine = /Remaining free windows today: (.+?)(?: \(|$)/m.exec(section(ctx, "Schedule"));
  const windows = windowsLine && windowsLine[1] !== "none"
    ? windowsLine[1].split(", ").map((w) => w.split("–").map(toMin)).filter(([a, b]) => a != null && b != null).map(([start, end]) => ({ start, end }))
    : [];
  const memories = section(ctx, "Things the user asked you to remember")
    .split("\n")
    .map((l) => /^- (.+?) \(memory id: ([0-9a-f-]{36})\)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ content: m[1], id: m[2] }));
  const goals = section(ctx, "Active goals")
    .split("\n")
    .map((l) => /^\d+\. (.+?) \(goal id: [^)]+\).*?progress: ([^;\n]+?)(?: \((behind|on track|ahead|done)\))?(?:;|$)/.exec(l))
    .filter(Boolean)
    .map((m) => ({ title: m[1], progress: m[2], pace: m[3] ?? null }));
  const changes = section(ctx, "Changes made today").split("\n").slice(1).filter((l) => l.startsWith("- "));
  return { date: nowMatch?.[1] ?? null, now: nowMatch ? toMin(nowMatch[2]) : null, tasks, events, windows, memories, goals, changes };
}

function readInput(body) {
  const items = Array.isArray(body.input) ? body.input : [];
  const system = items.filter((i) => i.role === "system").map((i) => text(i.content));
  const context = system.find((s) => s.startsWith("# User context")) ?? "";
  const pending = [...system.join("\n").matchAll(/confirmation id ([0-9a-f-]{36}): (.+?) \(proposed/g)].map((m) => ({ id: m[1], summary: m[2] }));
  const focus = /# What the user is acting on[\s\S]*?\(task id: ([0-9a-f-]{36})/.exec(system.join("\n"))?.[1] ?? null;
  const dialogue = items.filter((i) => i.role === "user" || i.role === "assistant").map((i) => ({ role: i.role, content: text(i.content) }));
  const lastUser = [...dialogue].reverse().find((m) => m.role === "user")?.content ?? "";
  const last = items[items.length - 1];
  const outputs = items.filter((i) => i.type === "function_call_output").map((i) => ({ call_id: i.call_id, ...JSON.parse(i.output) }));
  const calls = items.filter((i) => i.type === "function_call");
  return { items, system, context, pending, focus, dialogue, lastUser, roundTwo: last?.type === "function_call_output", outputs, calls };
}

// ---------------------------------------------------------------- deciding what to say / do

const call = (name, args) => ({ call: { name, args } });
const say = (reply) => ({ reply });

const findTask = (c, words) => {
  const w = words.toLowerCase().replace(/["“”]/g, "").replace(/^(my|the)\s+/, "").trim();
  return c.tasks.find((t) => t.title.toLowerCase() === w) ?? c.tasks.find((t) => t.title.toLowerCase().includes(w) || w.includes(t.title.toLowerCase()));
};
const parseClock = (s) => {
  const m = /(?:at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (!m[3] && h >= 1 && h <= 6) h += 12; // "at 5:30" means the afternoon
  return hhmm(h * 60 + Number(m[2] ?? 0));
};
const quotedTitle = (s) => /“([^”]+)”/.exec(s)?.[1] ?? null;

function pickNext(c) {
  const pending = c.tasks.filter((t) => t.status === "pending");
  return (
    pending.find((t) => t.priority) ??
    pending.filter((t) => t.start != null && t.start >= (c.now ?? 0) - 30).sort((a, b) => a.start - b.start)[0] ??
    pending.find((t) => t.start == null) ??
    pending[0]
  );
}

function whatNow(c) {
  const pending = c.tasks.filter((t) => t.status === "pending");
  const next = c.events.find((e) => e.start > (c.now ?? 0));
  if (!pending.length) {
    return next
      ? `Nothing's left on your list. Your next commitment is ${next.title} at ${t12(next.start)} — is there something you want to get done before it?`
      : "Nothing's left on today's plan. What would you like to get done before the evening?";
  }
  const pick = pickNext(c);
  const why = pick.priority ? "it's your priority" : pick.start != null ? `it's planned for ${t12(pick.start)}` : "it's the next open item";
  const gap = next && c.now != null ? next.start - c.now : null;
  const before = next && gap >= 20 ? ` You have ${gap} minutes before ${next.title} at ${t12(next.start)}.` : next ? ` ${next.title} is at ${t12(next.start)}.` : "";
  return `It's ${t12(c.now)}. You have ${count(pending.length, "task")} left today. I'd start with “${pick.title}” now — ${why}.${before}`;
}

function overwhelmed(c) {
  const pending = c.tasks.filter((t) => t.status === "pending");
  if (!pending.length) return "There's nothing left on today's list. Take a breath — nothing else needs you right now.";
  const focus = pickNext(c);
  if (pending.length === 1) return `There's only “${focus.title}” left today. Just that — nothing else needs you right now.`;
  const rest = pending.filter((t) => t !== focus);
  const drop = [...rest].sort((a, b) => (b.start ?? 9999) - (a.start ?? 9999))[0];
  const why = focus.priority ? " — it's your priority" : focus.goal ? ` — it moves “${focus.goal}” forward` : "";
  return `You have ${count(pending.length, "task")} left today. “${focus.title}” is the one that matters most${why}. I'd do that and leave “${drop.title}” for tomorrow. Want me to move it?`;
}

function laterToday(c, task) {
  const dur = task.duration ?? 30;
  const from = (c.now ?? 0) + 15;
  const slot = c.windows.map((w) => ({ start: Math.ceil(Math.max(w.start, from) / 5) * 5, end: w.end })).find((w) => w.end - w.start >= dur);
  return slot ? hhmm(slot.start) : null;
}

/** Round one: reply, or call one tool. */
function decide(req, script) {
  const c = parseContext(req.context);
  const u = req.lastUser.trim();
  const low = u.toLowerCase();
  const focusTask = req.focus ? c.tasks.find((t) => t.id === req.focus) : null;

  if (req.pending.length && /^(yes|yep|yeah|ok|okay|sure|go ahead|do it|use it)\b/.test(low)) return call("confirm_action", { confirmation_id: req.pending[0].id });
  if (req.pending.length && /^(no|nope|not now|cancel|don't)\b/.test(low)) return call("decline_action", { confirmation_id: req.pending[0].id });

  if (/what should i do/.test(low)) return say(whatNow(c));
  if (/overwhelm|too much|so much to do/.test(low)) return say(overwhelmed(c));

  const moveLater = /^move "(.+)" to later today/i.exec(u);
  if (moveLater) {
    const task = focusTask ?? findTask(c, moveLater[1]);
    if (!task?.id) return say(`I couldn't find “${moveLater[1]}” on today's list — which task do you mean?`);
    const at = laterToday(c, task);
    return at ? call("reschedule_task", { task_id: task.id, date: "today", start_time: at }) : say(`There's no free time left today for “${task.title}”. Want me to move it to tomorrow?`);
  }

  const move = /move (?:my |the )?(.+?) to (tomorrow|today)(?:\s+(?:at|morning))?(.*)$/i.exec(u);
  if (move) {
    const task = focusTask ?? findTask(c, move[1]);
    if (!task?.id) {
      if (script.lie) return call("reschedule_task", { task_id: "00000000-0000-4000-8000-000000000000", date: move[2].toLowerCase(), start_time: "keep" });
      return say(`I couldn't find “${move[1]}” on today's list — which task do you mean?`);
    }
    const rest = `${move[3] ?? ""}`;
    const time = /morning/i.test(u) && !/\d/.test(rest) ? "09:00" : parseClock(rest);
    return call("reschedule_task", { task_id: task.id, date: move[2].toLowerCase(), start_time: time ?? "keep" });
  }

  const unfinished = /(?:didn'?t|did not|couldn'?t) (?:finish|do|get to) (?:my |the )?(.+?)[.!]?$/i.exec(u);
  if (unfinished) {
    const task = findTask(c, unfinished[1]);
    if (!task) return say(`Which task do you mean? I don't see “${unfinished[1]}” on today's list.`);
    if (task.status === "done") return say(`“${task.title}” is already marked done today — did you mean something else?`);
    const w = c.windows.find((x) => x.end - x.start >= (task.duration ?? 30));
    return say(`“${task.title}” is still open.${w ? ` You have a free window from ${t12(w.start)} to ${t12(w.end)} today.` : ""} Want me to move it to tomorrow morning, or keep it for later today?`);
  }

  // A follow-up that refers back to the task named in the previous reply ("Tomorrow at 9").
  const prev = [...req.dialogue].reverse().find((m) => m.role === "assistant");
  const referent = prev ? quotedTitle(prev.content) : null;
  if (referent && /^(tomorrow|move it|later today)/i.test(low)) {
    const task = findTask(c, referent);
    if (task?.id) {
      if (/later today/.test(low)) {
        const at = laterToday(c, task);
        if (at) return call("reschedule_task", { task_id: task.id, date: "today", start_time: at });
      }
      const time = /morning/.test(low) && !/\d/.test(low) ? "09:00" : parseClock(u.replace(/^[^\d]*/, "")) ?? "09:00";
      return call("reschedule_task", { task_id: task.id, date: "tomorrow", start_time: time });
    }
  }

  if (/plan (the rest of )?(my|the) day|redo my day|replan/.test(low)) return call("replan_today", { available_start: null, available_end: null, note: u.slice(0, 200) });

  const remember = /^(?:remember(?: that)?|please remember(?: that)?)\s+(.+)$/i.exec(u) ?? (/^i (?:always |usually )?prefer /i.test(u) ? [u, u] : null);
  if (remember) return call("save_memory", { content: remember[1].replace(/\.$/, "") + "." });

  const forget = /^forget (?:that|it|about (.+))/i.exec(u);
  if (forget) {
    const memory = forget[1] ? c.memories.find((m) => m.content.toLowerCase().includes(forget[1].toLowerCase())) : c.memories[0];
    return memory ? call("delete_memory", { memory_id: memory.id }) : say("I don't have anything like that saved.");
  }

  if (/when should i (work ?out|exercise|do my workout)/.test(low)) {
    const pref = c.memories.find((m) => /evening/i.test(m.content) && /work ?out/i.test(m.content));
    if (!pref) return say("When do you usually like to work out — morning or evening?");
    const evening = c.windows.map((w) => ({ start: Math.max(w.start, 17 * 60), end: w.end })).find((w) => w.end - w.start >= 45);
    return say(`You told me you prefer working out in the evening${evening ? `, so I'd do it at ${t12(evening.start)} — you're free then` : ""}.`);
  }

  const didI = /did i (?:finish|do|complete) (?:the |my )?(.+?)\??$/i.exec(u);
  if (didI) {
    const task = findTask(c, didI[1]);
    if (!task) return say(`I don't see “${didI[1]}” on today's list.`);
    return say(task.status === "done" ? `Yes — “${task.title}” is marked done.` : task.status === "skipped" ? `“${task.title}” was skipped today.` : `Not yet — “${task.title}” is still open.`);
  }

  if (/what (did i|have i) (just )?ask|what have we talked about/.test(low)) {
    const earlier = req.dialogue.filter((m) => m.role === "user").slice(0, -1);
    return say(earlier.length ? `Earlier in this conversation you asked: “${earlier[earlier.length - 1].content}”` : "This is a new conversation — you haven't asked me anything else here yet.");
  }

  // Money questions are answered only from the "## Money" summary the app sent (read-only).
  if (/recurring|subscriptions|afford|emergency fund|how long until|net worth|debt-to-income|financial situation|spending each month|spend each month|spend a month/.test(low)) {
    const money = section(req.context, "Money");
    if (!money) return say("I don't have your money details yet — you can connect your accounts on the Money screen.");
    const line = (start) => money.split("\n").find((l) => l.startsWith(start)) ?? null;
    if (/financial situation/.test(low)) return say([line("Net worth:") ?? line("Connected asset accounts:"), line("This month so far"), line("Typical month")].filter(Boolean).join(" "));
    if (/spending each month|spend each month|spend a month/.test(low)) return say(line("Typical month") ?? line("Last month:") ?? "I don't have a full month of spending yet.");
    if (/recurring|subscriptions/.test(low)) return say(line("Recurring payments:") ?? "I don't see any recurring payments yet.");
    if (/emergency fund|how long until/.test(low)) {
      const goal = money.split("\n").find((l) => l.startsWith("- ") && /→ projected|reached|no monthly amount/.test(l) && (!/emergency/.test(low) || /emergency/i.test(l)));
      return say(goal ? `Here's where it stands: ${goal.slice(2)}. That's an estimate at that monthly amount, not a promise.` : "I don't see a goal like that yet.");
    }
    if (/afford/.test(low)) return say([line("This month so far"), line("Budget:")].filter(Boolean).join(" ") + " Based on that, here's what's realistic — and it's your call, not financial advice.");
    if (/debt-to-income/.test(low)) return say(line("Debt payments:") ?? "I can't tell yet.");
    return say(line("Net worth:") ?? line("Connected asset accounts:") ?? "I can't tell yet.");
  }

  return say("Tell me a bit more — what would help most right now?");
}

/** Round two: say what the tools actually did. */
function finish(req, script) {
  if (script.lie) return "Done! I've taken care of that.";
  return req.outputs
    .map((o) => {
      if (o.status === "succeeded") return `Done — ${/^I\b/.test(o.message) ? o.message : o.message.charAt(0).toLowerCase() + o.message.slice(1)}`;
      if (o.status === "needs_confirmation") return o.message.startsWith("New plan") ? "Here's a plan for the rest of today. Nothing moves until you say so." : `That needs your OK first: ${o.message.split("\n")[0]}.`;
      if (o.status === "info") return o.message;
      if (o.error === "partial_failure") return o.message;
      return `I couldn't do that: ${o.message} Nothing was changed.`;
    })
    .join(" ");
}

/** The planner's structured request ("daily_plan"): place the listed tasks in the free windows, in order. */
function plan(body) {
  const prompt = text((body.input ?? []).filter((i) => i.role === "user").pop()?.content);
  const windows = (/free windows \(24h local time\): (.+)/.exec(prompt)?.[1] ?? "")
    .split(", ")
    .map((w) => w.split("–").map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))))
    .filter(([a, b]) => b > a);
  const tasks = [...prompt.matchAll(/^- id=([0-9a-f-]{36}) "(.+?)"(?: \((\d+) min\))?$/gm)].map((m) => ({ id: m[1], title: m[2], duration: Number(m[3] ?? 30) }));
  const items = [];
  let wi = 0;
  let cursor = windows[0] ? Math.ceil(windows[0][0] / 5) * 5 : null;
  for (const t of tasks.slice(0, 5)) {
    while (wi < windows.length && cursor + t.duration > windows[wi][1]) {
      wi++;
      cursor = windows[wi] ? Math.ceil(windows[wi][0] / 5) * 5 : null;
    }
    if (cursor == null || wi >= windows.length) break;
    items.push({ task_id: t.id, title: t.title, goal_id: null, start_time: hhmm(cursor), duration_minutes: t.duration, is_priority: items.length === 0, rationale: null });
    cursor = Math.ceil((cursor + t.duration + 15) / 5) * 5;
  }
  return { needs_more_info: false, question: null, summary: items.length ? "The most important task first, with breathing room between blocks." : "Nothing needs scheduling.", items };
}

// ---------------------------------------------------------------- the Responses API surface

let seq = 0;
const usage = (inputChars, outputChars) => ({
  input_tokens: Math.ceil(inputChars / 4),
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: Math.ceil(outputChars / 4),
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: Math.ceil((inputChars + outputChars) / 4),
});
const messageItem = (t) => ({ type: "message", id: `msg_${++seq}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: t, annotations: [] }] });
const callItem = (name, args) => ({ type: "function_call", id: `fc_${++seq}`, call_id: `call_${seq}`, name, arguments: JSON.stringify(args), status: "completed" });

export function createMockOpenAI() {
  const requests = [];
  let script = {};

  function respond(body) {
    const req = readInput(body);
    const inputChars = JSON.stringify(body.input ?? "").length;
    const format = body.text?.format?.name ?? null;
    let output;
    let kind;
    if (format === "daily_plan") {
      kind = "plan";
      output = [messageItem(JSON.stringify(plan(body)))];
    } else if (format) {
      kind = "structured";
      output = [messageItem("{}")];
    } else if (!body.tools?.length) {
      kind = "other"; // conversation summaries and similar background calls
      output = [messageItem("The user and the assistant talked about today's plan.")];
    } else if (req.roundTwo) {
      kind = "chat:final";
      output = [messageItem(finish(req, script))];
      script = { ...script, lie: false };
    } else {
      kind = "chat";
      const d = decide(req, script);
      output = d.call ? [callItem(d.call.name, d.call.args)] : [messageItem(d.reply)];
    }
    const outText = output.filter((o) => o.type === "message").map((o) => o.content[0].text).join("");
    requests.push({
      kind,
      stream: Boolean(body.stream),
      lastUser: req.lastUser,
      userMessages: req.dialogue.filter((m) => m.role === "user").length,
      dialogue: req.dialogue.length,
      inputChars,
      contextChars: req.context.length,
      context: req.context,
      system: req.system,
      appGuidance: req.system.some((s) => s.includes("In the app — how to be useful right now")),
      focus: req.focus,
      tools: (body.tools ?? []).length,
      call: output.find((o) => o.type === "function_call") ? { name: output[0].name, args: JSON.parse(output[0].arguments) } : null,
      toolOutputs: req.outputs,
      reply: outText || null,
    });
    return {
      id: `resp_mock_${++seq}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model: body.model,
      output,
      output_text: outText,
      usage: usage(inputChars, outText.length),
    };
  }

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const json = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "GET" && req.url === "/__requests") return json(200, requests);
    if (req.method === "POST" && req.url === "/__reset") {
      requests.length = 0;
      script = {};
      return json(200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/__script") {
      script = { ...script, ...JSON.parse(raw || "{}") };
      return json(200, script);
    }
    if (req.method !== "POST" || !req.url?.endsWith("/responses")) return json(404, { error: { message: "Not found in the mock" } });
    if (script.status) {
      const status = script.status;
      script = { ...script, status: undefined };
      return json(status, { error: { message: "Mock upstream error", type: "server_error" } });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: { message: "Invalid JSON" } });
    }
    const response = respond(body);
    if (!body.stream) return json(200, response);

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    const pause = () => new Promise((r) => setTimeout(r, 25));
    send("response.created", { response: { ...response, status: "in_progress", output: [] } });
    for (const item of response.output) {
      if (item.type !== "message") continue;
      const t = item.content[0].text;
      const parts = t.match(/.{1,40}(\s|$)|.+/g) ?? [t];
      for (const delta of parts) {
        await pause();
        send("response.output_text.delta", { item_id: item.id, output_index: 0, content_index: 0, delta });
      }
    }
    send("response.completed", { response });
    res.end();
  });

  return {
    server,
    requests,
    listen: (port = 0) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}/v1`))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
    reset: () => {
      requests.length = 0;
      script = {};
    },
    script: (s) => {
      script = { ...script, ...s };
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : 4010;
  const mock = createMockOpenAI();
  const url = await mock.listen(port);
  console.log(`Mock OpenAI Responses API listening at ${url}`);
}
