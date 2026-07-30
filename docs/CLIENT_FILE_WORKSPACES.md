# Client and file workspaces

## Client-first Work flow

Clients are durable workspace records rather than repeated project text.
Existing project client names are promoted to client records automatically
during database startup, so prior projects remain available.

In **Work**:

1. Add or select a client in the client strip.
2. The board opens only that client’s projects.
3. Projects remain grouped into the draggable In progress, In review, Waiting
   on client, and Ready buckets.
4. Create a project from the selected client, or move an existing project to a
   different client from the edit dialog.
5. Drive folders and files linked to the client appear in its workspace;
   project-specific Drive resources appear in the project dialog.

## Expandable Google Drive tree

The **Files** page lists Picker-authorized Drive resources as a tree. Select the
chevron next to a folder to load its children without leaving the current view.
Folder contents are fetched only when expanded and remain cached until Drive is
refreshed.

Select **Link** on a file or folder, choose a client, and optionally choose one
of that client’s projects. Relationships are persisted in
`google_drive_resource_links`; removing a relationship never deletes the
Google Drive resource.

Google OAuth continues to use the non-sensitive `drive.file` scope. A folder
can expose only the children Google has made available to the lancee OAuth
client; use **Choose Drive files** when a child is not visible.
The real Picker overlay requires the browser-restricted
`GOOGLE_PICKER_API_KEY` and Google Cloud project number in
`GOOGLE_PICKER_APP_ID`.

## Document uploads

The upload panel accepts PDF, DOC, DOCX, Markdown, plain text, and image files
up to 10 MB. Choose one destination:

- **lancee only** stores an authenticated workspace copy.
- **Google Drive only** uploads directly through the server.
- **lancee + Google Drive** stores both and records the Drive copy.

PDFs and images open in the in-app viewer. DOCX and Markdown files open in the
lancee editor. A local edit clears its previous sync marker because the Drive
copy is no longer guaranteed to match; use **Sync to Drive** to publish a new
copy. Removing a local document does not delete an already-created Drive copy.

All local downloads and editor routes require the workspace session. File
content is stored inside the authenticated application data boundary and is
never embedded in public cloud-link metadata.

Run `npm run verify:client-files` to verify durable clients, projects, Drive
relationships, local document content, and sync metadata.
