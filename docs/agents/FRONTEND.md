# Frontend product guide

Latest UI update: chat is now a collapsible drawer on desktop and mobile, superseding the permanent third column described below. See the chat drawer update in DECISIONS.md.

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

## Simplicity and usability

The main goal is a simple, friendly dashboard with three clear sections: Sync / To-do list on the left, centered announcements, and ClassSync AI on the right. Put the logo at the top left. Keep top tabs obvious and controls plainly labeled. Avoid duplicate deadlines, promotional cards, extra metrics, and competing actions. Keep the three Home sections left to right at every viewport size. Use a minimum usable workspace width with horizontal scrolling on narrow phones; never stack them top to bottom.

## Brand and visual system

- Product: **ClassSync**. Tagline: **All your classes. One place.**
- Logo: a simple **brain** icon or SVG beside the product name at the upper left. Use Lucide React's Brain icon or a small accessible SVG. Do not use a cloud; replace the existing graduation cap when implementing this branding change.
- Light mode: white and light-gray surfaces, charcoal text, blue primary accents, purple AI accents. Preserve dark-mode support with readable contrast.
- Use rounded cards, subtle shadows, clean typography, consistent spacing, and restrained hover transitions.
- Build dialogs, menus, tabs, toasts and similar controls from shadcn/ui (decision 5), themed by the CSS tokens in `src/app/globals.css`; avoid scattered hard-coded theme variants. Use existing Tailwind support where useful.
- Desktop: horizontal top navigation with Home, My Assignments, and Lecture Notes / Material; ClassSync brain logo at the top left; center workspace and persistent right-side chat. Secondary pages live under More. Mobile: wrapping top tabs and a collapsible chat drawer, without horizontal overflow.
- Use semantic controls, visible focus, associated labels, keyboard-accessible dialogs, readable contrast, and reduced-motion support. Icons alone need accessible names. Color must not be the only status signal.

## Pages and routing

These route names are recommended mappings into the existing application, not a request to replace its router. Preserve existing links or provide aliases when changing visible navigation names.

| Page | Route | Required behavior |
| --- | --- | --- |
| Home | `/` | Centered announcement feed, filters and sort controls, Sync classes → To-do list, right-side chat |
| My Assignments | `/assignments` | Unified coursework, search/filter/sort, completion, add/edit/delete |
| Lecture Notes | `/notes` (new) | Course-linked notes, keyword search, editor, create/edit/delete, summary action |
| To-Do List | `/tasks` (new) | Personal tasks, Today/Upcoming/Completed groups, progress, persistence |
| Calendar | `/calendar` | Course-colored deadlines, quizzes, exams, personal tasks, clickable details |
| My Classes | `/courses` | Add and remove course cards; removing a course confirms and deletes its linked assignments, materials, and announcements |
| Course detail | `/courses/[id]` | Preserve assignments, notes/materials, syllabus, and grades |
| Study assistant | `/assistant` | Preserve study tools alongside the global chatbot |
| Grades | `/grades` | Card per class: current grade, letter, graded count, weight-total check |
| Class grade calculator | `/grades/[id]` (also the class page's Grades tab) | Category weights/averages/contributions, editable scores, points and categories, what-if mode with hypothetical items, target-grade solver, weights from syllabus text |
| Settings | `/settings` | Preserve account, cloud save/load, and backup controls |

### Home

The approved sketch places announcements in the center and chat in a dedicated right column. Announcements are visible on arrival. Provide real Class, Priority, Read status, and Sort by controls; combine filters, offer Reset, and show a useful empty state. Sort by newest, oldest, or priority with stable tie-breaks. Use high/medium/low announcement priority; legacy records without priority use medium. Keep coursework in a dedicated left Sync / To-do section. Clicking Sync classes reveals its class-filtered list without a modal on Home. Do not duplicate deadlines below the center feed. Do not restore the left sidebar, dashboard course-card grid, or a floating desktop chat overlay.


- Suggested welcome: “Good morning! Here’s everything happening with your classes.” If time-specific, derive the greeting from the student's local time.
- Home prioritizes the announcement feed over summary cards. Coursework counts remain derived from shared data where displayed. Due Soon means today through the next seven local calendar days, excluding completed work.
- Announcements: course, LMS source (D2L or Canvas), title, short description, posted date, and read/unread status. Sort newest first and persist read state.
- Upcoming Deadlines: incomplete work sorted by due date; make overdue work visible separately.
- **Sync classes** reveals the To-do list in the left section immediately. It shows current incomplete assignments with a class filter and completion controls. The sync operation is a future integration hook; this button does not import data or claim a successful sync.

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
- Desktop: open by default in a reserved right column, with its own scrolling history and composer anchored at the bottom. It must not overlay the center feed or trap keyboard focus.
- Right panel: brain icon, **ClassSync AI** heading, honest mode label, conversation history, message bubbles, input, and Send. Collapse controls are for mobile.
- On mobile, show the floating purple **Ask ClassSync AI** launcher and an appropriately sized drawer; do not obscure navigation or make the input inaccessible. Manage focus on open/close and support keyboard use.
- Read current shared course and assignment state, including changes made after the panel opened.
- Without a real API, answer deadline/course questions from local data and label the mode **Local assistant / rule-based**. Unsupported questions should explain the limitation, not invent facts.
- With an API, call the authenticated server endpoint; never put provider credentials in browser code. The design is the DigitalOcean model with browser-run tool calling (decisions 3–4 in DECISIONS.md).

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

## Empty sync state

Remove all historical generated class IDs, including math210, psych101, eng102 and the later demo set, along with their linked sample coursework. Preserve real courses by identity, never by name. When Sync classes is clicked with no courses, show: “Sync unsuccessful. Please log in to your student portal to sync classes.” Do not fabricate classes, show a successful sync, or show an all-caught-up result. Actual portal synchronization remains a future integration.

### Notes and material uploads (implemented)

The shared uploader accepts PDF, Word (.doc/.docx), and PNG/JPG/WebP/GIF images only, with a 10 MB limit, extension and signature validation, file picker, and drag/drop. Text may still be entered manually. Save the original file in IndexedDB, keyed by the shared material ID; never encode binary files into localStorage. Show image previews and download links. Attached binaries are local to this browser and are not included in cloud saves or workspace JSON exports; explain that beside the uploader. Uploading does not extract text or run OCR/AI.

### Workspace polish (2026-10-24)

The shared header places the brain branding and tagline on the left, the three primary tabs beside a keyboard-accessible More menu, and the theme control on the right. More includes Connect your school and marks secondary routes as active. It dismisses on selection, outside click, or Escape and restores focus through Radix. A skip link targets the main content.

Home keeps Sync / To-do and Announcements side by side, with a minimum width of 720px and horizontal scrolling on narrower viewports. Chat starts collapsed on every page and opens from Ask ClassSync AI in a right-side Sheet. It traps focus while open and closes via its close button, Escape, or backdrop, returning focus to the launcher. Conversation and drafts remain in the mounted Chatbot state when the Sheet closes. Other pages wrap their navigation. The workspace uses consistent control sizes, readable light/dark text tokens, quieter surfaces, and explicit empty-state actions. Announcement filters compose and reset; read state remains reversible. School connection and import review are unchanged. The chat welcome and three starter prompts appear only before a conversation.

Shared Button, DropdownMenu and Sheet components in `src/components/ui/` follow shadcn/ui composition and the existing theme; other controls are migrated as needed. Existing native dialogs retain their focus handling and now have accessible names.
