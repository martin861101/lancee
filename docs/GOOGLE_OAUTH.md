# Google OAuth Setup

Here is how to generate a **Client ID** and **Client Secret** for the per-file
Google Drive integration. lancee requests the non-sensitive `drive.file` scope;
it does not request full read access to every file in the account.

After signing in to Google Cloud Console:
 
 1. Create a Google Cloud Project
   Go to the Google Cloud Console. Click the project drop-down menu in the top navigation bar and select New Project. Name it and click Create.
 2. Enable the Google Drive API
   In the left sidebar, navigate to APIs & Services > Library. Search for Google Drive API, select it, and click Enable.
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
   https://agents.hygridtech.co.za/oauth/callback
   ```

   Use the matching local `PUBLIC_ORIGIN` plus
   `/oauth/callback` for development. Google requires an exact
   scheme/host/path match.
 5. Copy Your Credentials
   Store them only in the server-side `.env` file:

   ```dotenv
   GOOGLE_DRIVE_CLIENT_ID=
   GOOGLE_DRIVE_CLIENT_SECRET=
   GOOGLE_DRIVE_REDIRECT_URI=https://agents.hygridtech.co.za/oauth/callback
   ```

   Restart the server after changing these values. The browser receives an
   authorization URL but never the client secret. Refresh tokens are encrypted
   at rest. The legacy `/api/google-drive/oauth/callback` path remains accepted
   only for deployment compatibility.
 6. Configure Drive UI Integration
   Optional — for 'Open with' / 'New' menus
   If you want your app to appear natively inside the Google Drive interface, go to APIs & Services > Enabled APIs & services, click Google Drive API, and navigate to the Drive UI integration tab to enter your webhooks and app icons.
