# Google OAuth Setup

Here is how to generate a **Client ID** and **Client Secret** for the per-file
Google Drive integration. lancee requests the non-sensitive `drive.file` scope;
it does not request full read access to every file in the account. The Files
page launches Google Picker so each user explicitly chooses the files and
folders lancee may list.

After signing in to Google Cloud Console:
 
 1. Create a Google Cloud Project
   Go to the Google Cloud Console. Click the project drop-down menu in the top navigation bar and select New Project. Name it and click Create.
 2. Enable the Google Drive API
   In the left sidebar, navigate to APIs & Services > Library. Search for
   **Google Drive API**, select it, and click Enable. Repeat this for
   **Google Picker API**; the per-file selection screen requires both APIs.
 3. Configure the OAuth Consent Screen
   Go to APIs & Services > OAuth consent screen. Select External (unless restricting to your Google Workspace organization) and click Create. Fill in the required fields (App name, User support email, Developer contact information) and click Save and Continue through the scopes and test user screens.
   Under **Data access**, add only:

   ```text
   https://www.googleapis.com/auth/drive.file
   ```

   Remove `drive.readonly` if it was previously added. If the publishing status
   is **Testing**, add every account that will connect under **Audience → Test
   users**. Otherwise Google blocks accounts that are not on that list.
 4. Create Credentials (Client ID)
   Navigate to APIs & Services > Credentials. Click + Create Credentials and
   select OAuth client ID. Choose **Web application** and add this exact
   production redirect URI:

   ```text
   https://lancee.hookitupservices.com/oauth/callback
   ```

   Use the matching local `PUBLIC_ORIGIN` plus
   `/oauth/callback` for development. Google requires an exact
   scheme/host/path match.
 5. Create Picker credentials
   Create an **API key** in the same Google Cloud project. Restrict it to the
   production website/referrer and to the Google Picker API. Copy the Google
   Cloud **project number** (not the project name) as the Picker App ID.
 6. Copy Your Credentials
   Store the OAuth secret and Picker values in the server-side `.env` file:

   ```dotenv
   GOOGLE_DRIVE_CLIENT_ID=
   GOOGLE_DRIVE_CLIENT_SECRET=
   GOOGLE_DRIVE_REDIRECT_URI=https://lancee.hookitupservices.com/oauth/callback
   GOOGLE_PICKER_API_KEY=
   GOOGLE_PICKER_APP_ID=
   ```

   Restart the server after changing these values. The browser receives an
   authorization URL but never the client secret. Refresh tokens are encrypted
   at rest. The legacy `/api/google-drive/oauth/callback` path remains accepted
   only for deployment compatibility.
 7. Configure Drive UI Integration
   Optional — for 'Open with' / 'New' menus
   If you want your app to appear natively inside the Google Drive interface, go to APIs & Services > Enabled APIs & services, click Google Drive API, and navigate to the Drive UI integration tab to enter your webhooks and app icons.

## How file selection works

Connecting first completes Google's OAuth consent. After the redirect,
**Choose Drive files** launches Google's real Picker overlay using a short-lived
access token and the browser-restricted Picker key. Google grants the app
access only to the selected items, and lancee refreshes the Files tree after
the Picker closes. An empty list means no files have been shared with lancee
yet. Existing `drive.file` connections do not need a broader scope, but they
must run Picker once before pre-existing Drive files become visible.

## In-app document workspace

Selected files open inside lancee instead of being presented only as external
links:

- Google Docs and DOCX files open in the rich-text editor and save back to the
  original Drive item.
- Markdown files open in a source editor with a sanitized rendered preview.
- PDFs and image files open in authenticated, same-origin viewers.
- Other file types retain an **Open in Google Drive** fallback.

The same `drive.file` grant covers reading and updating the items selected in
Google Picker; lancee does not request full-account Drive access. Saves verify
the Drive file version first and reject stale edits rather than overwriting a
newer revision. Editable source is limited to 5 MB.

Google Docs and DOCX are converted through semantic HTML. Normal headings,
lists, links, tables, images, and emphasis are supported. Advanced
word-processing features such as suggestions, tracked changes, custom page
layout, and some complex styling can be simplified during a save.

## Browsing a selected folder

Choose a folder in Google Picker, then expand its chevron in the Files tree.
lancee lazy-loads items whose Drive `parents` collection contains that folder
ID and keeps nested folders visible in place. Select **Edit** or **View** on any
supported child file, or **Link** to associate the item with a client and
optional project.

The `drive.file` permission only exposes items Google has shared with this app.
If a selected folder returns no accessible children, use **Choose Drive files**
and explicitly select the required files from that folder. lancee shows this
access limitation as an empty-state action instead of claiming the folder
itself is empty.
