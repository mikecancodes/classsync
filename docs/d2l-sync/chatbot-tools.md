# Chatbot tools

> **Status: proposal for the live D2L sync phase, not implemented yet.** The current app stores one JSONB workspace per user (`supabase/schema.sql`). See [how this relates to the current app](README.md#how-this-relates-to-the-current-app).

The chatbot doesn't get all of the user's data pasted into its prompt. It gets a few **tools** (functions it can ask us to run). Our code runs the query against Supabase as the logged-in user and hands back a small result.

This keeps answers accurate ("what's due Friday" comes from a real query, not the model's memory) and keeps prompts small, which matters for local models.

> **Implemented (DECISIONS.md 3–4)** in `src/lib/chat-tools.ts` and `/api/ai/chat`: the DigitalOcean model (OpenAI-compatible), with tools run **in the browser** against the local workspace rather than Supabase tables. This page is the original design; the code is the source of truth for tool names.

## Which model

The current app calls OpenAI from the server (`src/app/api/ai/route.ts`), which works when hosted. A local model (e.g. Ollama) only works when the app runs on your own computer, because a hosted server can't reach `localhost` on your machine. The tools below work the same with either.

## The tools

| Tool | Parameters | Answers questions like | Query |
|---|---|---|---|
| `list_courses` | none | "What classes am I taking?" | `courses` where `is_active` |
| `get_due_items` | `from`, `to` (ISO dates), `course?` | "What's due this week?" | `upcoming_items` where `due_at` between `from` and `to` |
| `get_overdue_items` | `course?` | "Am I behind on anything?" | `overdue_items` |
| `get_recent_announcements` | `since?`, `course?`, `unread_only?` | "Any new announcements?" | `announcements` ordered by `posted_at desc` |
| `get_grades` | `course?` | "What's my grade in Bio?" | `grades` + `courses.final_grade_*` |
| `get_feedback` | `course?`, `since?` | "Did I get feedback on my essay?" | `items` where `feedback_at is not null` |
| `search_course_text` | `query` | "What's the late policy?" "When is the midterm?" | `rpc('search_text', { q })` |

`course` is a name or code the user typed ("bio", "MATH 201"). Resolve it with `ilike` against `courses.name` / `courses.code`.

## Tool definitions

OpenAI and most local model runners (Ollama included) accept tools in this JSON Schema format:

```json
[
  {
    "type": "function",
    "function": {
      "name": "get_due_items",
      "description": "List assignments, quizzes and other items that are not done yet and are due between two dates. Use for questions about what is due or coming up.",
      "parameters": {
        "type": "object",
        "properties": {
          "from":   { "type": "string", "description": "Start date, ISO 8601, e.g. 2026-10-24" },
          "to":     { "type": "string", "description": "End date, ISO 8601" },
          "course": { "type": "string", "description": "Optional course name or code to filter by" }
        },
        "required": ["from", "to"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_course_text",
      "description": "Full-text search over announcements and course documents such as the syllabus. Use for policy questions, exam dates mentioned in text, or anything an instructor wrote.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "A few keywords, e.g. 'late policy' or 'midterm exam'" }
        },
        "required": ["query"]
      }
    }
  }
]
```

Define the rest the same way, from the table above.

## Running a tool

```js
async function runTool(name, args) {
  switch (name) {
    case "get_due_items": {
      let q = supabase
        .from("upcoming_items")
        .select("title, type, due_at, url, course_name")
        .gte("due_at", args.from)
        .lte("due_at", args.to);
      if (args.course) q = q.or(`course_name.ilike.%${args.course}%,course_code.ilike.%${args.course}%`);
      const { data, error } = await q;
      return error ? { error: error.message } : data;
    }
    case "search_course_text": {
      const { data, error } = await supabase.rpc("search_text", { q: args.query });
      return error ? { error: error.message } : data;
    }
    // ...one case per tool
  }
}
```

Return only the columns the model needs. Fewer tokens means faster, more accurate answers.

## The conversation loop

1. Send the model: a system prompt, the tool definitions, and the user's message.
2. If the model replies with a tool call, run it with `runTool`, append the result as a `tool` message, and send everything back.
3. Repeat until the model replies with plain text. Show that to the user.

### System prompt (starting point)

```
You are ClassSync, a study assistant for one student.
Today is {today} and the student's time zone is {timezone}.
Answer only from tool results. If the tools return nothing relevant, say so; never guess dates or grades.
When you mention an assignment or announcement, include its link.
Keep answers short.
```

Fill in `{today}` and `{timezone}` in code. Models don't know the current date, and "this week" depends on it.

## Safety notes

- Tools are **read-only**. None of them write to the database or to D2L.
- Tools run with the user's own Supabase session, so RLS limits them to that user's data, even if the model asks for something odd.
- Announcement text is written by instructors and goes into the model's input. Treat what comes back as text to show, never as commands for the app to run.
