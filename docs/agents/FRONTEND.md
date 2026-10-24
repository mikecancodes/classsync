# Frontend product guide

## Purpose and priorities

Build ClassSync as a working academic dashboard for a one-day university hackathon. Students should see their next deadlines, act on coursework, and get useful help without setup. Prioritize in this order:

1. Home dashboard.
2. My Assignments.
3. Collapsible ClassSync AI chatbot.
4. To-Do List.
5. Lecture Notes.
6. Calendar.
7. My Classes.
8. Advanced AI and LMS integrations.

Keep the existing grade calculator and course workflows functional throughout. Build actual interactions and persistence, not decorative controls.

## Brand and visual system

- Product: **ClassSync**. Tagline: **All your classes. One place.**
- Logo: a simple **brain** icon or SVG beside the product name at the upper left. Use Lucide React's Brain icon or a small accessible SVG. Do not use a cloud; replace the existing graduation cap when implementing this branding change.
- Light mode: white and light-gray surfaces, charcoal text, blue primary accents, purple AI accents. Preserve dark-mode support with readable contrast.
- Use rounded cards, subtle shadows, clean typography, consistent spacing, and restrained hover transitions.
- Maintain the CSS tokens in `src/app/globals.css`; avoid scattered hard-coded theme variants. Use existing Tailwind support where useful.
- Desktop: fixed left navigation and a clear content hierarchy. Mobile: collapsible navigation, reachable primary actions, no unintended horizontal overflow.
- Use semantic controls, visible focus, associated labels, keyboard-accessible dialogs, readable contrast, and reduced-motion support. Icons alone need accessible names. Color must not be the only status signal.

## Pages and routing

These route names are recommended mappings into the existing application, not a request to replace its router. Preserve existing links or provide aliases when changing visible navigation names.

| Page | Route | Required behavior |
| --- | --- | --- |
| Home | `/` | Search, student profile, Demo Sync, welcome message, assignment counts, announcements, upcoming deadlines |
| My Assignments | `/assignments` | Unified coursework, search/filter/sort, completion, add/edit/delete |
| Lecture Notes | `/notes` (new) | Course-linked notes, keyword search, editor, create/edit/delete, summary action |
| To-Do List | `/tasks` (new) | Personal tasks, Today/Upcoming/Completed groups, progress, persistence |
| Calendar | `/calendar` | Course-colored deadlines, quizzes, exams, personal tasks, clickable details |
| My Classes | `/courses` | Course cards and links to associated assignments and notes |
| Course detail | `/courses/[id]` | Preserve assignments, notes/materials, syllabus, and grades |
| Study assistant | `/assistant` | Preserve study tools alongside the global chatbot |
| Grade calculator | `/grades` | Preserve deterministic grade calculations and scenarios |
| Settings | `/settings` | Preserve account, cloud save/load, and backup controls |

### Home

- Suggested welcome: “Good morning! Here’s everything happening with your classes.” If time-specific, derive the greeting from the student's local time.
- Summary cards: **Total Assignments**, **Due Soon**, **Completed Assignments**, derived from current state. Use one documented Due Soon range everywhere; a proposed MVP convention is today through the next seven calendar days, excluding completed work.
- Announcements: course, LMS source (D2L or Canvas), title, short description, posted date, and read/unread status. Sort newest first and persist read state.
- Upcoming Deadlines: incomplete work sorted by due date; make overdue work visible separately.
- Sync must say **Demo Sync** or otherwise clearly identify simulated connections. It refreshes normalized sample imports, with a visible success/error result.

### My Assignments

Show title, course, LMS platform (or Manual), due date, priority, completion status, estimated completion time, and description. Support course, due-date, platform, priority, and completion filters. Default to nearest deadline, with a stable tie-breaker. Provide empty results and a clear way to reset filters.

Creation, editing, deletion, and completion must update every relevant view immediately. Preserve earned/possible points and grading categories used by the existing calculator. Completion must not manufacture a grade.

### Lecture Notes

Create, view, edit, delete, associate with a course, and search notes by keyword. Use a simple labeled editor. Reuse course materials rather than maintaining two conflicting copies of a note. Offer **AI Summary** only when a working service is configured; otherwise explain availability or provide a separately labeled local excerpt tool. Do not label a rule-based result as generated AI.

### To-Do List

Fields: task name, optional course, due date, priority, completion. Include Add Task, completion checkbox, and Delete. Group as Today, Upcoming, and Completed, with an explicit overdue section or clear overdue indicator so past tasks never disappear. Show completed/total progress; handle an empty list without division by zero. Personal tasks remain distinct from graded assignments.

### Calendar

Month view is required; week view is optional if feasible. Include assignment deadlines, quizzes, exams, and personal tasks. Color by course, label event types, and show details on selection. Use a neutral style for tasks without a course. Ensure the mobile calendar remains usable and all dates use the shared local-date helpers.

### My Classes

Show course name, instructor when available, LMS platform, assignment count, and upcoming deadlines. Selecting a card opens its assignments and notes. Existing syllabus and grade features remain accessible.

## Global ClassSync AI panel

This is a high-priority target feature, distinct from the existing assistant page.

- Mount once in the application shell so it is accessible on every page.
- Collapsed: floating purple **Ask ClassSync AI** button at the bottom right.
- Expanded: right panel with brain icon, **ClassSync AI** heading, conversation history, message bubbles, input, Send, and Collapse controls.
- On mobile, use an appropriately sized drawer; do not obscure navigation or make the input inaccessible. Manage focus on open/close and support keyboard use.
- Read current shared course and assignment state, including changes made after the panel opened.
- Without a real API, answer deadline/course questions from local data and label the mode **Local assistant / rule-based**. Unsupported questions should explain the limitation, not invent facts.
- With an API, call the authenticated server endpoint; never put provider credentials in browser code.

Required example questions:

- “What assignments are due tomorrow?”
- “What should I work on today?”
- “What assignments am I missing?”
- “What do I have due this week?”
- “Help me organize my study schedule.”
- “What assignments do I have for Computer Networks?”

For the demo, explain that “missing” means overdue and incomplete, rather than claiming knowledge of an instructor's missing-work record. Clarify ambiguous course names or dates.

## Plan My Week

Analyze incomplete assignments using due date, priority, estimated completion time, and remaining workload. Return a daily study plan with a suggested order and explain the ordering in the chatbot. Keep the planner deterministic without an API. Clearly state available-time assumptions; surface overload and overdue work instead of promising everything fits. A plan must never silently complete, reschedule, or submit coursework.

## Demo content

Use Computer Networks, Data Structures, Criminal Justice, Computer Architecture, and Algorithm Analysis. Include Socket Programming Lab, Priority Queue Assignment, Chapter 5 Quiz, Cache Memory Discussion, and Algorithm Analysis Homework, plus multiple notes and announcements across D2L and Canvas.

Generate demo dates relative to the current date. Changing the sample fixture must not overwrite user-created coursework or silently replace a saved workspace. Provide explicit demo refresh behavior as described in ARCHITECTURE.md.
