# Data model

> **Status: proposal for the live D2L sync phase, not implemented yet.** The current app stores one JSONB workspace per user (`supabase/schema.sql`). See [how this relates to the current app](README.md#how-this-relates-to-the-current-app).

Eight tables in Supabase Postgres. The SQL that creates them is in [supabase-setup.md](supabase-setup.md).

```
auth.users (managed by Supabase)
   │
   ├── profiles        one row per user: D2L domain, iCal URL, last sync time
   ├── courses         one row per course the user is enrolled in
   │     ├── items          everything with a date: assignments, quizzes, discussions, events
   │     │     └── submissions   what the user turned in for an assignment
   │     ├── announcements  course news posts
   │     ├── grades         one row per graded item
   │     └── documents      syllabus and other course files
   └── sync_runs       a log of every sync: when, from where, did it work
```

## Rules that apply to every table

- **`user_id`** on every row, defaulting to the logged-in user (`auth.uid()`). The extension never has to send it.
- **Row Level Security** is on for every table: a user can only read and write rows where `user_id` is their own ID.
- **Unique keys on D2L IDs** (e.g. `unique (user_id, d2l_org_unit_id)`) so a sync can safely *upsert*: insert new rows and update existing ones, without duplicates.
- **`raw jsonb`** holds the original D2L response on main tables. If we later need a field we didn't map, it's already saved.
- **`updated_at`** is set automatically on every update.
- All times are **`timestamptz`** (stored in UTC, shown in the user's time zone).

## Tables

### `profiles`
| Column | Type | Meaning |
|---|---|---|
| `id` | uuid, PK | Same as `auth.users.id` |
| `display_name` | text | Name to show in the dashboard |
| `d2l_domain` | text | e.g. `d2l.yourschool.edu` |
| `d2l_user_id` | bigint | From `whoami` |
| `ical_url` | text | Private calendar feed URL. Secret |
| `last_synced_at` | timestamptz | Last successful sync |

Created automatically when someone signs up.

### `courses`
| Column | Type | Meaning |
|---|---|---|
| `id` | uuid, PK | Our ID |
| `d2l_org_unit_id` | bigint | D2L's course ID. Unique per user |
| `name`, `code` | text | e.g. "Intro to Biology", "BIO-110-01" |
| `starts_at`, `ends_at` | timestamptz | Term dates |
| `is_active` | boolean | Current term? |
| `home_url` | text | Link to the course in D2L |
| `color` | text | Color the user picked in the dashboard |
| `final_grade_display`, `final_grade_points`, `final_grade_out_of` | text, numeric, numeric | Final grade, once released |

### `items`
One table for everything that has a date, so "what's due" is a single query.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid, PK | |
| `course_id` | uuid → courses | Can be null for iCal events we can't match to a course |
| `source` | `d2l_api` · `ical` · `manual` | Where the row came from |
| `external_id` | text | D2L item ID or iCal UID |
| `type` | `assignment` · `quiz` · `discussion` · `event` · `content` · `checklist` · `survey` · `other` | |
| `title` | text | |
| `instructions_text`, `instructions_html` | text | Assignment instructions |
| `opens_at`, `due_at`, `closes_at` | timestamptz | Availability window and due date |
| `url` | text | Direct link into D2L |
| `points_possible` | numeric | |
| `completed_at` | timestamptz | When D2L marked it done |
| `is_exempt` | boolean | Instructor exempted the user |
| `feedback_text`, `feedback_html`, `feedback_score`, `feedback_at` | | Instructor feedback, once released |
| `dismissed_at` | timestamptz | User hid it in the dashboard (ClassSync only, never sent to D2L) |

Unique key: `(user_id, source, type, external_id)`.

### `submissions`
| Column | Type | Meaning |
|---|---|---|
| `item_id` | uuid → items | The assignment |
| `d2l_submission_id` | bigint | |
| `submitted_at` | timestamptz | |
| `comment` | text | Comment the user left |
| `files` | jsonb | File names and sizes |

### `announcements`
| Column | Type | Meaning |
|---|---|---|
| `course_id` | uuid → courses | |
| `d2l_news_id` | bigint | Unique per user + course |
| `title`, `body_text`, `body_html` | text | `body_html` must be sanitized before display |
| `posted_at` | timestamptz | |
| `attachments` | jsonb | |
| `read_at` | timestamptz | Set when the user opens it in ClassSync |
| `search` | tsvector (generated) | Full-text search over title + body, for the chatbot |

### `grades`
| Column | Type | Meaning |
|---|---|---|
| `course_id` | uuid → courses | |
| `d2l_grade_object_id` | bigint | Unique per user + course |
| `name` | text | e.g. "Quiz 3" |
| `grade_type` | text | e.g. "Numeric", "Category" |
| `points_earned`, `points_possible` | numeric | Either can be null if not graded yet |
| `displayed_grade` | text | What D2L shows, e.g. "88 %" |
| `comments` | text | Instructor comment on the grade |

### `documents`
| Column | Type | Meaning |
|---|---|---|
| `course_id` | uuid → courses | |
| `d2l_topic_id` | bigint | Unique per user + course |
| `title` | text | |
| `kind` | `syllabus` · `file` · `link` · `other` | |
| `url` | text | Link in D2L |
| `storage_path` | text | Path in Supabase Storage, if we downloaded the file |
| `extracted_text` | text | Text pulled out of the PDF/Word file |
| `search` | tsvector (generated) | Full-text search, for the chatbot |

### `sync_runs`
| Column | Type | Meaning |
|---|---|---|
| `source` | `extension` · `ical` | Who ran the sync |
| `started_at`, `finished_at` | timestamptz | |
| `status` | `running` · `ok` · `error` · `needs_login` | `needs_login` = D2L session expired |
| `error` | text | |
| `counts` | jsonb | e.g. `{"courses": 4, "items": 31}` |

## Views (ready-made queries)

| View | What it returns |
|---|---|
| `upcoming_items` | Not done, not exempt, not dismissed, due from now on, sorted by due date, with the course name |
| `overdue_items` | Same, but due date has passed |

## Sync order (extension)

1. `whoami` → update `profiles`
2. `myenrollments` → upsert `courses`
3. `myItems/due` + `overdueItems/myItems` → upsert `items`
4. For each course: `news` → `announcements`, `dropbox/folders` → `items` + `submissions`, `myGradeValues` → `grades`, `content/toc` → `documents`
5. Write a `sync_runs` row with the counts (or the error).

Courses have to exist before anything else, because the other tables need `course_id`.
