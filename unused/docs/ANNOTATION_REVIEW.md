# Tokenized artwork review

The Projects workspace now supports image-specific client review without
attaching the raw artwork to an email.

## Flow

1. A designer attaches a PNG, JPG, GIF, WEBP, or SVG file in Projects.
2. **Send to client** creates a `client_approvals` record and a related
   `review_sessions` record.
3. The response contains a URL shaped like
   `/review/<reviewId>?token=<opaque-token>`. Only the SHA-256 token hash is
   stored in PostgreSQL.
4. The client page loads the review with the token, then fetches the selected
   image through the separately authorized image endpoint.
5. Annotorious manages rectangle and polygon geometry. The application stores
   the Annotorious annotation plus comment, priority, category, and status in
   `review_annotations`.
6. Submission validates that every annotation has a comment and changes the
   review to `submitted`, making the client view read-only.
7. Designers open the Review tab in the same project workspace to filter and
   resolve annotations.

## Server routes

- `POST /api/projects/:id/approvals` creates the approval and review session.
- `GET /api/public/reviews/:reviewId?token=…` loads public review metadata and
  annotations.
- `GET /api/public/reviews/:reviewId/image?token=…` streams the authorized
  artwork and does not expose an unauthenticated file URL.
- `POST`, `PATCH`, and `DELETE`
  `/api/public/reviews/:reviewId/annotations` manage client annotations while
  the review is open.
- `POST /api/public/reviews/:reviewId/submit` validates and freezes feedback.
- `POST /api/public/reviews/:reviewId/approve` preserves the existing approval
  workflow.
- `GET /api/projects/:id/reviews` and
  `PATCH /api/reviews/:reviewId/annotations/:annotationId` power the designer
  view.

The frontend boundary is `src/services/annotationService.ts`, so the UI does
not need to know whether persistence is provided by the current Express/
PostgreSQL API or a future review service. `closeReview()` is retained for the
future explicit close action.

## Dependencies

- `@annotorious/react` 3.8.8 with its current `Annotorious` /
  `ImageAnnotator` API and CSS import.
- `openseadragon` 6.0.2, required by Annotorious React's bundled bindings.

No MongoDB integration is introduced. The current stack remains PostgreSQL
first, with the repository's existing SQLite development fallback.
