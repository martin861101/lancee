# Implimentation of a functional platform

**1. Quick Fixes:**

- Mobile view of the landing page has no visible sign in section
- signin/signup page's "hero" section needs to be themed the same as the rest of the app.
- Platform flashes in white as each page loads for the firstbtime after login, assuming its the previous light color that was implimented.


---
 
**2. Next Core Phases:**

- Implementation is a real Core execution layer with permission-checked tool calls,
- step execution, persisted execution events.
- Execution-log API/UI added implimentations
- Tests thatt verify actual side effects rather than only status === "completed".
- UI additions: Create new Send for approval button on jobcards, Create a new bucket category in projects called "Client Comments"
- Workflow and Automations pages needs to be kept seperate and not integrate or navigate to eachnother
- Impliment full backend scripting, additional DB tables, columns, data entry logic.
- Create all Current API endpoints.
- Create a new Sidebar tab and page in dashboard called Services.
- Services page lists the always-active local Lancee MCP tools. Playwright, web search, and research are implemented as Lancee adapters/workers rather than separate MCP servers.
- Platform chat widget with AI integration has secure access to platform data and actions through workspace-scoped Lancee tools. A PostgreSQL MCP server must not be added; database access stays behind Lancee's fixed readers.
- AI may perform the followng actions without human in loop: describe_table, list_tables, list_schemas, query, and connect_db. Human approval is required for execute.
- Apply any other neccesary actions/implimentations that are neccesary. 
---
**3. Fiest workflow implimentation:**

**Workflow:**

- 1. When a prjoject is created, ad draft invoice is imediately created (assigned to client with project details. 
- 2. New button added to jobcard: "Send For Approval".
- 3. Button onSelect action: Sends professional formatted email to client with jobcard details and attachment. 
- 4. Email body stipulates a button: Review for your approval
- 5. When "Reviev for your approval" is clicked a new tab opens with attachment and an approve as well as a comment button
- 6. If the "Comment" button is selcted, a text box opens, client enters text, and then selects "Submit", triggers a notification in the dashboard stipulating comment recieved which moves the jobcard into "Client Review" container for review.
- 7. If "Approve" button is selected, auto invoice is geneeated with a platform notification for review, once reviewed/edited, platform user selects " Send" which then sends the invouce to client with a "Pay Invoice" button (this can be mock data for now).
- 8. Project marked as done.
