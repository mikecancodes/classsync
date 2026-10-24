# D2L data sources

> **Status: proposal for the live D2L sync phase, not implemented yet.** The current app stores one JSONB workspace per user (`supabase/schema.sql`). See [how this relates to the current app](README.md#how-this-relates-to-the-current-app).

ClassSync gets data from two places:

1. **The D2L (Brightspace) REST API**, called by the browser extension using the student's logged-in session.
2. **The D2L calendar iCal feed**, a private URL the student copies from D2L, fetched by a server job.

> Field names below come from the D2L API docs (docs.valence.desire2learn.com). Schools run different
> versions, so confirm against real responses with a test script before relying on a field.

> The extension is **out of scope for the current frontend MVP** (see `AGENTS.md`). The app already has a validation contract for imports, `POST /api/imports/preview` with `source: "d2l"`, which a future extension can send data through for student review before saving.

## API basics

- **Base URL:** the school's D2L domain, e.g. `https://d2l.yourschool.edu`. Every school is different.
- **Auth (extension):** the browser's D2L session cookie. Requests are same-origin `fetch()` calls from a content script, or `credentials: "include"` calls from the extension's background worker.
- **Auth (future):** OAuth 2.0, if the school's Brightspace admin registers ClassSync. Same endpoints, a bearer token instead of the cookie.
- **Versions:** `GET /d2l/api/versions/` lists what the school supports. The routes below need roughly `lp` **1.49+** and `le` **1.82+**. Store the versions in config; don't hard-code them everywhere.
- **Read only:** ClassSync only ever sends `GET` requests to D2L.
- **Rate limits:** D2L returns `429 Too Many Requests` when called too often. Sync at most every ~30 minutes.
- **Dates:** D2L returns UTC ISO-8601 strings (`2026-10-24T03:59:00.000Z`). Store them as `timestamptz`.
- **Paging:** some routes return a *paged result set*:
  ```json
  { "PagingInfo": { "Bookmark": "12345", "HasMoreItems": true }, "Items": [ ... ] }
  ```
  Keep calling with `?bookmark=<Bookmark>` until `HasMoreItems` is `false`.

## Endpoints we use

`(lp)` / `(le)` = the API version numbers. `(ou)` = a course's org unit ID.

### Who am I
`GET /d2l/api/lp/(lp)/users/whoami`

| Field | Use |
|---|---|
| `Identifier` | D2L user ID → `profiles.d2l_user_id` |
| `FirstName`, `LastName` | Display name |

### Courses
`GET /d2l/api/lp/(lp)/enrollments/myenrollments/?orgUnitTypeId=3&isActive=true` (paged)

`orgUnitTypeId=3` is "Course Offering" on most schools' setups.

| Field | → Column |
|---|---|
| `OrgUnit.Id` | `courses.d2l_org_unit_id` |
| `OrgUnit.Name` | `courses.name` |
| `OrgUnit.Code` | `courses.code` |
| `OrgUnit.HomeUrl` | `courses.home_url` |
| `Access.StartDate` / `Access.EndDate` | `courses.starts_at` / `courses.ends_at` |
| `Access.IsActive` | `courses.is_active` |

### What's due (all courses at once)
`GET /d2l/api/le/(le)/content/myItems/due/?orgUnitIdsCSV=1,2,3`
`GET /d2l/api/le/(le)/overdueItems/myItems?orgUnitIdsCSV=1,2,3`

Returns a list of `ScheduledItem` (overdue: `OverdueItem`), sorted by due date.

| Field | → Column |
|---|---|
| `OrgUnitId` | find `courses.id` |
| `ItemId` | `items.external_id` |
| `ItemType` / `ActivityType` | `items.type` (map numbers to names in code; log unknown values) |
| `ItemName` | `items.title` |
| `ItemUrl` | `items.url` |
| `StartDate` / `DueDate` / `EndDate` | `items.opens_at` / `items.due_at` / `items.closes_at` |
| `DateCompleted` | `items.completed_at` |
| `IsExempt` | `items.is_exempt` |

### Announcements
`GET /d2l/api/le/(le)/(ou)/news/`

| Field | → Column |
|---|---|
| `Id` | `announcements.d2l_news_id` |
| `Title` | `announcements.title` |
| `Body.Text` / `Body.Html` | `announcements.body_text` / `announcements.body_html` |
| `StartDate` (fall back to `CreatedDate`) | `announcements.posted_at` |
| `Attachments` | `announcements.attachments` (JSON) |

`Body.Html` is written by instructors. **Sanitize it (e.g. DOMPurify) before putting it on a page.**

### Assignments
`GET /d2l/api/le/(le)/(ou)/dropbox/folders/`

| Field | → Column |
|---|---|
| `Id` | `items.external_id` (with `type = 'assignment'`) |
| `Name` | `items.title` |
| `CustomInstructions.Text` / `.Html` | `items.instructions_text` / `items.instructions_html` |
| `DueDate` | `items.due_at` |
| `Availability.StartDate` / `.EndDate` | `items.opens_at` / `items.closes_at` |
| `Assessment.ScoreDenominator` | `items.points_possible` |

### My submissions and feedback
`GET /d2l/api/le/(le)/(ou)/dropbox/folders/(folderId)/submissions/mysubmissions/`

Returns `EntityDropbox` blocks: your submissions, plus feedback once the instructor releases it.

| Field | → Column |
|---|---|
| `Submissions[].Id` | `submissions.d2l_submission_id` |
| `Submissions[].SubmissionDate` | `submissions.submitted_at` |
| `Submissions[].Comment.Text` | `submissions.comment` |
| `Submissions[].Files` | `submissions.files` (JSON) |
| `Feedback.Score` | `items.feedback_score` |
| `Feedback.Feedback.Text` / `.Html` | `items.feedback_text` / `items.feedback_html` |

### Grades
`GET /d2l/api/le/(le)/(ou)/grades/values/myGradeValues/`
`GET /d2l/api/le/(le)/(ou)/grades/final/values/myGradeValue` (404 until the final grade is released)

| Field | → Column |
|---|---|
| `GradeObjectIdentifier` | `grades.d2l_grade_object_id` |
| `GradeObjectName` | `grades.name` |
| `GradeObjectTypeName` | `grades.grade_type` |
| `PointsNumerator` / `PointsDenominator` | `grades.points_earned` / `grades.points_possible` (can be `null`) |
| `DisplayedGrade` | `grades.displayed_grade` |
| `Comments.Text` | `grades.comments` |

Final grade → `courses.final_grade_display`, `courses.final_grade_points`, `courses.final_grade_out_of`.

### Course materials (syllabus, readings)
`GET /d2l/api/le/(le)/(ou)/content/toc`

A tree of `Modules[]`, each with `Topics[]` and nested `Modules[]`. Walk it recursively.

| Field | → Column |
|---|---|
| Topic `TopicId` / `Identifier` | `documents.d2l_topic_id` |
| Topic `Title` | `documents.title` |
| Topic `Url` | `documents.url` |

A title containing "syllabus" → `documents.kind = 'syllabus'`. Downloading the file and extracting its text into `documents.extracted_text` is a later step.

### Calendar (optional, overlaps with "what's due")
`GET /d2l/api/le/(le)/calendar/events/myEvents/?orgUnitIdsCSV=…&startDateTime=…&endDateTime=…`
→ `items` with `type = 'event'`.

### Quizzes and discussions (permissions vary by school; test first)
- `GET /d2l/api/le/(le)/(ou)/quizzes/`
- `GET /d2l/api/le/(le)/(ou)/discussions/forums/`

Most quiz and discussion due dates already arrive through `content/myItems/due/`.

## iCal feed

The student enables it in D2L: **Calendar → Settings → Enable Calendar Feeds → Subscribe → All Calendars and Tasks**, then pastes the URL into ClassSync. It's stored in `profiles.ical_url`. **Treat it like a password**: anyone with the URL can read the calendar.

| iCal field | → Column |
|---|---|
| `UID` | `items.external_id` (with `source = 'ical'`) |
| `SUMMARY` | `items.title` |
| `DTSTART` / `DTEND` | `items.opens_at` / `items.due_at` |
| `URL` | `items.url` |
| `DESCRIPTION` | `items.instructions_text` |

The same assignment can show up from both the API and iCal. Keep both rows (they have different `source`). The dashboard shows the `d2l_api` row when both exist.

## Not available from either source

- Homework on publisher sites (Pearson, McGraw-Hill Connect, Cengage, zyBooks): D2L only has a link.
- Structured syllabus dates: the syllabus is a file. Dates have to be extracted from its text.
- Anything unreleased or hidden from students.
- Video lectures in Kaltura, YuJa or Panopto: link only.
