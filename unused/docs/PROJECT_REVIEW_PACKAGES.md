# Project review packages

Project review packages separate internal work stages from client feedback. The
Kanban board remains a view of how the workspace delivers work; the **Reviews**
surface records how a client responds to selected deliverables.

## Workspace flow

The project navigation is **Board**, **Details**, **Files**, **Reviews**, and
**Activity**. The board contains the work stages Project Brief, In Progress,
Waiting on Client, Review, and Completed. Client comments are not a stage.
Instead, the latest review state appears on the related bucket and task cards:

- **Waiting review** means the item was sent and has no response yet.
- **Needs changes** means the client returned the item with a required comment.
- **Approved** means the client accepted that item.

Task checkboxes persist completion independently of review state. Image project
files render as previews on project cards and file rows. A selected image can
also be assigned as the preview for each review-package item.

**Send for approval** opens a package composer. The owner selects one or more
buckets, optionally assigns an image preview to each, writes the client message,
and chooses a deadline. Sending creates a new immutable review round and a
tokenized client URL. Previous rounds remain in the review history even when a
bucket is reviewed again.

## Client flow

The client opens one tokenized `/review/:reviewId?token=…` page. Each selected
bucket is shown as a separate deliverable with its image preview, response
history, comment field, **Request changes**, and **Approve** actions. Requesting
changes requires a comment. The package can be submitted only after every item
has a response. Existing image annotations remain available for focused visual
feedback.

Submitting a package produces one of two outcomes:

- all items approved: the approval and job card become approved, the project
  becomes Ready, and its invoice draft becomes ready for review;
- one or more items need changes: the approval becomes commented and the
  project remains In review.

## Persistence

`client_approvals` remains the package header and now stores `due_at`.
`review_package_items` stores the selected bucket, display title, item status,
position, optional preview file, and response timestamps for each round.
`project_comments` stores `review_item_id`, `bucket_id`, and optional `task_id`
so feedback is traceable to the work that generated it. `project_tasks` stores
`completed_at` for the persistent task checkbox. The schema is created for both
PostgreSQL and the SQLite development fallback.

Authenticated package history is returned from
`GET /api/projects/:id/approvals`. Package creation uses
`POST /api/projects/:id/approvals`. Public item responses use
`POST /api/public/reviews/:reviewId/items/:itemId/respond`; preview images are
served through a token-checked item endpoint and are never exposed by raw
storage keys.

## Verification

Run the focused lifecycle check with:

```bash
pnpm verify:project-reviews
```

It covers persistent task completion, package selection, image association,
item approval/change responses, bucket-linked comments, package submission, and
the permanent review history.
