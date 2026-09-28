# A tour of BASE

BASE is built around one loop: **capture → score → plan → focus.** This page walks through
each screen and explains the ideas behind it.

*All screenshots show the built-in test data.*

---

## Home

![Home](screenshots/home.png)

Your projects, with progress and value, and one big button: **Smart Start**.

**Smart Start** builds today's queue for you. Tell it how many hours you have; it takes the
highest-scoring tasks that fit. Two rules make it trustworthy:

- **Prerequisites come first, or not at all.** A task that is waiting on another only enters
  the queue *together with* what it waits on, prerequisites ordered first, and only if the
  whole chain fits in your hours.
- **It shows what it left out, and why.** Tasks held back by a missing prerequisite are listed
  separately, and you can add one anyway.

If you'd rather choose yourself, **New session** lets you pick today's tasks by hand.

---

## Projects, lists and tasks

![Project board](screenshots/project-board.png)

A **project** holds **lists**, which hold **tasks**, which can hold **subtasks**, nested as deep
as you like. Every project starts with three built-in lists: *Action Steps*, *Backburner* and
*Reference Materials*.

- **Board or list view**, with a "Show done" toggle.
- **Drag and drop** within a list and between lists, by mouse, touch (press and hold) or
  keyboard.
- **"Waiting on"**: link a task to the tasks it depends on. A blocked task shows a lock and
  what it's waiting for, and won't start until they're done.
- **Money**: give a list or project a value; the header adds it up.
- **Tags**, a description, an estimate, a deadline and a repeat rule on every task.
- A **task sheet** with every field opens from any task, anywhere in the app.

---

## The priority score

![Needs attention](screenshots/priority-score.png)

Every task gets a number. The **Needs attention** screen walks through tasks that are missing
information, and shows exactly how the score is built.

Seven factors, each capped:

| Factor | Up to | Comes from |
|---|---|---|
| Importance | 9 | the one judgement you make yourself (0–9) |
| Emergency | 5 | a flag you set (0–5) |
| Deadline | 5 | how close the **latest start** is |
| Overdue | 5 | how far past the deadline it is |
| Bottleneck | 5 | how much other work is waiting on it |
| Avoided | 5 | how many times you've deferred it |
| Duration | 1 | short tasks get a small nudge |

Three ideas shape the maths:

1. **Time is measured to the latest start, not the deadline.** A two-hour task due at six and
   a two-week task due at six are not equally urgent at four o'clock. *Latest start* =
   deadline − how long it takes.
2. **Adding, then multiplying.** Far from its latest start, a task's factors add up: calm and
   predictable, out of 35. As the latest start gets close, a smooth curve shifts the formula
   toward *multiplying* the time-sensitive factors. So a task that is late *and* blocking
   others *and* an emergency climbs past one that is merely important. The switch-over takes
   about six days.
3. **Blockers inherit urgency.** A 15-minute task standing in front of your most important
   work is your most urgent task. A floor makes a blocker always outrank what it blocks, in
   proportion to how cheap it is.

---

## Plan the session: Select → Deadlines → Focus

![Set deadlines](screenshots/set-deadlines.png)

A session is three steps, shown at the top of each screen:

1. **Select** today's tasks, or let Smart Start do it.
2. **Set deadlines.** Set your work window (4 hours, say), then give each task its time box.
   **The run** on the right shows when each task starts and ends, and how much of the window
   is left unplanned.
3. **Focus.**

---

## Focus

![Focus](screenshots/focus.png)

One task on the screen. Nothing else.

- A big countdown for this task, and a bar for the whole session.
- **+5m / +15m** if you need more time. **Mark done** when it's finished.
- **Defer** moves on, and is counted: the task's *Avoided* score goes up, so the thing you
  keep putting off rises to the top.
- **Subtasks** tick off on the right. Nested steps show their own time.
- Leave the screen and a small **focus pill** keeps the timer with you.

---

## Deadlines that move themselves

When a task's deadline moves past the deadline of a task waiting on it, the waiting task
can't finish on time any more. BASE pushes it back: at least one day after its latest
prerequisite, all the way down the chain.

- Deadlines are only **pushed later, never pulled earlier**.
- A task marked **fixed** doesn't move. BASE reports a *conflict* instead.
- Completed tasks and tasks without a deadline are left alone.
- Nothing moves silently: a banner lists what moved and why.

---

## Repeating tasks

Any iCalendar repeat rule works: every weekday, every 2 weeks on Monday and Thursday, the last
Friday of every month. Four common presets are one tap away.

Each date is **counted from the first one**, not from the previous one. That's why a monthly
task on the 31st lands on the 28th in February and goes back to the 31st in March. When you
complete one, the next one appears. Un-complete it and the next one disappears again, as long
as you haven't touched it.

---

## Notifications and Google Calendar

![Notifications](screenshots/notifications.png)

**Push reminders** arrive at the moment a task's work has to *start* (deadline minus
estimate), not when it's already due. One 5-minute snooze. If a reminder couldn't be delivered
on time, it's reported as missed rather than sent late, and a day's missed ones collapse into
one summary.

**Google Calendar**: every task with a deadline becomes a block of work, from its latest start
to its deadline, so your calendar shows when the work happens. Repeating tasks become repeating
events. Finished tasks keep a ✓ block, so the calendar records what you actually did. The sync
compares everything and only writes what differs, in batches of fifty.

**Quick reminders**: a one-off "remind me at 5" that isn't a task.

---

## Share links

![Client view](screenshots/share-client-view.png)

Share any task, list or project as a link. Nobody needs an account to open it. Three modes:

- **List**: a read-only view.
- **Client view**: progress, next deadline, estimate, budget, and **who is working on what
  right now**, with a live timer. For keeping a client in the loop.
- **Outsourcing**: people can claim tasks and hand in their work (a link and a note). Their
  details are visible to you only.

A link can have an end date, after which it shows nothing. You can take it down at any time.

---

## The assistant

![Assistant](screenshots/assistant.png)

A chat that can act on your tasks: find them, create and edit them, complete them, and put
them into or take them out of today's queue.

- Every tool call is shown as a chip you can expand.
- **Revert** undoes everything one turn changed.
- An **AI** button on projects, lists and tasks opens it in a side panel with that item as
  context.
- Answers can be read aloud, and you can talk to it.

It runs on **Google Gemini** by default. It can also run on a **local model** on your own
computer, through the separate Atlas program. There it gets a larger set of tools: breaking
tasks into steps, moving them between lists, projects and share links, web search, and
asking you with a **question card** instead of guessing. The screenshot above is an Atlas
chat. See [SETUP.md](SETUP.md#part-7-local-ai-and-mcp).

---

## Command palette and shortcuts

![Command palette](screenshots/command-palette.png)

**Ctrl+K** from anywhere: jump to any task or project, start a session, create a project, ask
the assistant. Single-key shortcuts can be rebound in Settings, and you can put your own
commands on a key.

---

## Trash and Archive

![Trash](screenshots/trash.png)

**Delete** moves things to the Trash for 30 days. Deleting a project takes its lists and tasks
with it and tidies up everything that pointed at them: today's queue, "waiting on" links, share
links, calendar blocks. **Restore** puts it all back.

**Archive** is for finished work you want to keep: it leaves every screen, stays forever, and
can be put back. An archived item's share link stays up.

---

## Settings, admin and the rest

![Settings](screenshots/settings.png)

- **Storage**: everything you own syncs as one Firestore document, capped at 1 MB. Settings
  shows how full it is.
- **Keys**: your own Gemini key, if the admin has put you on your own key.
- **App**: the running version, update status, and a test push notification.
- **Admin** (the owner only): every account, and switches for who may use the assistant and
  on whose key.

**Installable and offline.** Add BASE to your home screen and it opens like an app, even with
no connection. A new version waits until you tap the update banner, so it never reloads under
you.

![Tablet](screenshots/tablet-home.png)
