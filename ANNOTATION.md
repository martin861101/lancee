You are a senior React + TypeScript engineer.

Your task is to install, configure, and integrate @annotorious/react into my existing React application.

DO NOT create a separate demo page.
Integrate it into my existing workflow.

## Existing workflow

My application works similar to Trello.

- Once a job is being briefed or done its sent to client for approval where they either comment or approve. as an additional feature if there were to be designers or similar usecases where they need to annotate areas in a image and sent back.
- The fliw is alreadu set up and working
- I need you to integrate @annotorious/react into the workflow logic

One enhancement I'd strongly recommend is not sending the raw image to the client. Instead, generate a review session with a unique token:
Designer
   ↓
Artwork
   ↓
Create Review
   ↓
Review Session
   ├── reviewId
   ├── artworkVersionId
   ├── expiresAt
   ├── clientToken
   ├── status
   └── annotations[]
The client would visit a URL like:
/review/:reviewId?token=xxxxx

## Technology

Use

@annotorious/react

and install every dependency required.

Use the latest recommended API.

If Annotorious requires additional CSS imports, include them.

Use React functional components.

Use hooks.

TypeScript.

Do not use deprecated APIs.

--------------------------------------------------

## Architecture

Create reusable components.

Suggested structure:

src/
    components/
        annotations/
            ArtworkAnnotator.tsx
            AnnotationToolbar.tsx
            AnnotationSidebar.tsx
            AnnotationComment.tsx
            AnnotationList.tsx

    hooks/
        useAnnotations.ts

    services/
        annotationService.ts

    types/
        annotation.ts

Adjust if needed.

--------------------------------------------------

## Features

### Designer View

Displays artwork.

Has button:

Send to Client

When clicked:

Artwork status becomes:

Pending Client Review

Generate review session.

--------------------------------------------------

### Client View

Client opens artwork.

Display image inside Annotorious.

Client can

• draw rectangle
• draw polygon (if supported)
• click to create annotation
• edit annotation
• delete annotation before submission

Every annotation supports:

Comment
Priority

Low
Medium
High

Category

Design
Typography
Spacing
Color
Content
Other

Status

Open

--------------------------------------------------

## Annotation Sidebar

On the right side show all annotations.

Each item displays

Annotation number

Comment

Priority badge

Created time

Clicking an annotation should

focus
zoom
highlight

the corresponding image annotation.

--------------------------------------------------

## Data Model

Create TypeScript models.

Example:

Review

Artwork

Annotation

Comment

ReviewStatus

Priority

Category

--------------------------------------------------

Example annotation

{
    id,
    artworkId,
    reviewId,
    geometry,
    body,
    comment,
    priority,
    category,
    createdBy,
    createdAt
}

--------------------------------------------------

## Persistence

Abstract persistence into

annotationService.ts

Initially implement with mock async functions.

Functions:

createReview()

getReview()

saveAnnotations()

loadAnnotations()

submitReview()

closeReview()

Use local state but structure code so replacing with an API later is trivial.

--------------------------------------------------

## Submission Workflow

When client clicks

Submit Review

Perform:

Validate every annotation has a comment.

Freeze editing.

Set review status:

Submitted

Return payload like:

{
    reviewId,
    artworkId,
    submittedAt,
    annotations:[]
}

Designer view should automatically become read-only.

--------------------------------------------------

## Designer Review

Designer can

View all annotations

Filter by

Priority

Category

Status

Click annotation

Highlight annotation

Mark annotation

Resolved

Rejected

In Progress

--------------------------------------------------

## UX

Responsive layout.

Desktop:

Image left

Sidebar right

Mobile:

Sidebar below image.

--------------------------------------------------

## State Management

Use React Context if appropriate.

Otherwise use hooks.

Avoid Redux unless already present.

--------------------------------------------------

## Code Quality

Strong typing.

No any.

Reusable hooks.

Small focused components.

Meaningful names.

Error boundaries where appropriate.

--------------------------------------------------

## Styling

If project already uses:

Tailwind

then use Tailwind.

Otherwise use existing styling system.

Keep styling consistent.

--------------------------------------------------

## Accessibility

Keyboard accessible.

ARIA labels.

Visible focus states.

--------------------------------------------------

## Deliverables

1. Install required packages.

2. Configure Annotorious.

3. Create reusable annotation components.

4. Integrate into artwork detail page.

5. Replace "Send to Client" workflow.

6. Create review state management.

7. Implement mock persistence service.

8. Implement sidebar.

9. Implement annotation comments.

10. Implement submit review workflow.

11. Make designer view read-only after submission.

12. Leave TODO comments where backend API endpoints should be connected.

--------------------------------------------------

## Future API Contracts

Design services assuming these future endpoints:

POST /reviews

GET /reviews/:id

POST /reviews/:id/annotations

GET /reviews/:id/annotations

POST /reviews/:id/submit

PATCH /annotations/:id

DELETE /annotations/:id

Do not implement HTTP calls yet.

--------------------------------------------------

## Important

Work incrementally.

After each major step verify the app still compiles.

Do not rewrite unrelated files.

Do not remove existing functionality.

Preserve existing project architecture where possible.

If conflicts exist, adapt the implementation rather than replacing existing code.

When finished, provide:

• file tree
• packages installed
• modified files
• new files
• explanation of architecture
• any TODOs for backend integration
