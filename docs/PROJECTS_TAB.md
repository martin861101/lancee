I actually think this is one of the few places where Trello/ClickUp/Jira start to break down for client work.

A **client comment is not work**.
It's **feedback on work**.

So instead of giving it its own Kanban bucket, I'd make it a completely different layer of the UI.

---

## Option 1 (What I'd build) — Review Mode

Keep your board only for work.

```
Project Brief
In Progress
Waiting on Client
Review
Completed
```

Then add another top navigation.

```
Board | Details | Files | Reviews | Activity
```

When the user clicks **Reviews**, they see something like

```
──────────────────────────────────────────────
Pending Review Request #12
──────────────────────────────────────────────

Sent:
Aug 7

Recipient:
Vusi Sithole

Status:
Waiting for client

Included buckets

☑ Logo Design
☑ Flyer
☑ Email Signature

----------------------------------------------

Logo Design

✓ Approved

Comments

"This looks great.
Can we make the gold darker?"

-------------------------

Flyer

Needs Changes

Comments

"Move the QR code."

-------------------------

Email Signature

Approved

```

Now every review contains comments grouped by the bucket that generated them.

---

# Bucket cards show review state

Instead of a Client Comments column...

Every bucket gets a status.

```
Website

🟢 Approved

2 comments
```

or

```
Logo

🟡 Waiting review

Sent yesterday
```

or

```
Flyer

🔴 Needs changes

4 comments
```

Now feedback belongs to the work.

Not to a random column.

---

# Sending for review

The top right button

```
Send for approval
```

opens

```
──────────────────────────────

Select buckets

☑ Logo

☑ Flyer

☐ Invoice

☐ Website

☑ Email Signature

──────────────────────────────

Message

Hi Vusi,

Please review the selected deliverables.

──────────────────────────────

Deadline

Friday

──────────────────────────────

Send

```

Now one approval request can contain any combination of buckets.

---

# The Review timeline

Under Reviews

```
Review History

────────────────────────────

Review #10

Website
Logo

Approved

----------------------------

Review #11

Invoice

Needs Changes

----------------------------

Review #12

Logo
Flyer
Email Signature

Waiting

```

This becomes a permanent audit log.

---

# Comments live inside cards

Each card gets a small badge.

```
Create Flyer

💬 4

```

Opening it

```
──────────────────────────

Task

Create Flyer

──────────────────────────

Internal Notes

...

──────────────────────────

Client Feedback

Aug 5

"Can the excavator be larger?"

---------------------------

Aug 6

"Looks much better."

```

Notice how comments belong to the task that generated them.

---

# Even better... Review Packages

Instead of "Send for Approval"

Call them

> **Review Packages**

A Review Package is simply

```
Review Package

Contains

✓ Logo
✓ Flyer
✓ Invoice
✓ Website

```

The client opens ONE page.

They don't know about buckets.

They just scroll.

```
Logo

Approve

Comment

------------------

Flyer

Approve

Comment

------------------

Website

Approve

Comment

```

Press Submit.

Done.

---

# Then your board becomes much cleaner

```
-------------------------------------------------------

Project Brief

In Progress

Waiting on Client

Review

Completed

-------------------------------------------------------
```

No Client Comments column.

Instead the cards simply gain states.

```
Logo

Waiting Review

💬 2

----------------

Flyer

Approved

💬 5

----------------

Invoice

Needs Changes

💬 1

```

---

## I think Lancee can go one step further

I wouldn't model this around Kanban at all.

I'd introduce a first-class entity:

```
Project
│
├── Buckets
│     ├── Tasks
│     ├── Files
│     └── Links
│
├── Review Packages
│     ├── Bucket A
│     ├── Bucket C
│     ├── Bucket D
│     └── Client Responses
│
└── Activity Feed
```

That architecture gives you a lot of flexibility:

* One review package can include multiple buckets.
* A bucket can be included in multiple review rounds.
* Every comment is tied to the specific bucket and review round.
* You get a complete approval history and audit trail.
* Later you can support annotations on PDFs, images, videos, websites, and documents without changing the project structure.

For a platform like **Lancee**, this scales much better than treating client comments as another Kanban stage. The Kanban board should represent **how your team works**, while Reviews should represent **how clients interact with the work**. Those are related, but they're fundamentally different workflows.

## VISUAL:

There is a visual image added in **publick/img/projects.png** of what this needs to look like exactly. Attached images to taks or buckets myust view a preview.

## NB:

**Tick of the task list as soon as you are done with it**
**Dont leave anything broken if you run out of tokens**

## Implementation checklist

- [x] Keep the Kanban board focused on Project Brief, In Progress, Waiting on Client, Review, and Completed.
- [x] Remove Client Comments as a Kanban stage.
- [x] Add Board, Details, Files, Reviews, and Activity project navigation.
- [x] Add durable review packages containing any selected combination of buckets.
- [x] Add the package message, deadline, recipient, included buckets, and permanent review history.
- [x] Show Waiting review, Needs changes, Approved, and comment counts on related work cards.
- [x] Keep client comments attached to their review item and bucket.
- [x] Let the client review and respond to every included item on one secure page.
- [x] Keep image annotations available for focused artwork feedback.
- [x] Show previews for attached images and review-package images.
- [x] Persist task completion checkboxes and show task-level client feedback.
- [x] Add focused verification and implementation documentation.
