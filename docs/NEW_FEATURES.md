# Lancee Workspace Builder
## Product Design Document

**Version:** 2.0

---

# Vision

Lancee is designed for freelancers, independent professionals, startups, and small businesses.

Unlike traditional business platforms that overwhelm users with features, Lancee starts with only the tools a business needs today and grows alongside it.

> **Start with only what you need. Add more as you grow.**

The onboarding experience should feel less like configuring software and more like hiring an assistant who understands your business.

---

# Core Principles

## Simplicity First

The onboarding should be conversational.

Users should never be asked technical questions unless absolutely necessary.

Instead of:

> Which modules would you like to install?

Ask:

> Tell us about your business.

---

## AI is Used Last

The majority of the workspace should be created using predefined business profiles and decision trees.

AI is only responsible for understanding unique business requirements that cannot be handled by predefined templates.

Benefits

- Faster
- Predictable
- Reliable
- Lower AI cost
- Easier maintenance

---

## Progressive Growth

Users should never feel overwhelmed.

Start with a minimal workspace.

As users adopt Lancee, recommend additional tools based on actual usage.

---

# Workspace Builder Flow

```text
Welcome
    │
    ▼
Business Information
    │
    ▼
Business Activities
    │
    ▼
Current Tools
    │
    ▼
Team & Clients
    │
    ▼
Business Processes
    │
    ▼
Recommended Workspace
    │
    ▼
AI Customisation
    │
    ▼
Workspace Generation
    │
    ▼
Launch Lancee
```

---

# Step 1 — Welcome

## Goal

Explain the Lancee philosophy.

---

Welcome to Lancee.

We'll build your workspace in just a few minutes.

Instead of giving you hundreds of features, we'll learn how you work and create a workspace tailored to your business.

Typical setup time

**3–5 minutes**

Button

**Build My Workspace**

---

# Step 2 — Business Information

Collect basic information.

Questions

- Business name
- Industry
- Business size
- Country
- Timezone
- Logo (optional)

Business Size

- Just me
- 2–5
- 6–20
- 21–50
- 50+

---

# Step 3 — Business Activities

Question

**What do you spend most of your day doing?**

Multiple selection.

Examples

- Managing projects
- Working with clients
- Managing documents
- Sending quotations
- Tracking invoices
- Site inspections
- Equipment management
- Team collaboration
- Scheduling meetings
- Customer support
- Content creation
- Procurement
- Maintenance
- CRM
- Internal administration

Each selection activates a predefined workspace profile.

---

# Step 4 — Current Tools

Question

**Which services would you like Lancee to connect with?**

## Email

- Gmail

## Calendar

- Google Calendar
- Calendly

## Meetings

- Zoom
- Google Meet

## Storage

- Google Drive
- Dropbox
- Box

## Accounting

- Xero
- QuickBooks
- Sage

## CRM

- HubSpot
- Salesforce

## Communication

- Slack
- WhatsApp Business
- Discord
- Telegram

Only selected integrations are configured.

---

# Step 5 — Team & Clients

Questions

Who do you work with?

- Clients
- Contractors
- Employees
- Suppliers
- Just me

Do you want to invite your team now?

Optional.

---

# Step 6 — Business Processes

Ask practical questions.

Examples

Do you require approvals?

Do clients approve work?

Do you regularly schedule meetings?

Do you manage recurring projects?

Do you create quotations?

Do you work from documents?

Do you track equipment?

Do you submit reports?

Each answer activates predefined workflows.

---

# Step 7 — Recommended Workspace

Lancee now recommends the smallest useful workspace.

Example

Modules

✅ Projects

✅ Clients

✅ Tasks

✅ Files

✅ Calendar

✅ Dashboard

Suggested Integrations

✅ Gmail

✅ Google Calendar

✅ Google Drive

Suggested Automations

✅ Create task from meeting

✅ Notify when approval is completed

✅ Archive completed projects

Users can enable or disable recommendations.

---

# Step 8 — AI Customisation

Only now is AI introduced.

Prompt

Tell us anything unique about your business.

Example

Every client project needs two approvals before completion.

AI response

Suggested Workflow

Trigger

Project Ready

↓

Manager Approval

↓

Client Approval

↓

Close Project

Users must approve every AI suggestion.

---

# Step 9 — Workspace Generation

Generate

- Modules
- Dashboards
- Permissions
- Workflows
- Integrations
- Templates
- Notifications
- Sample Data (optional)

Display progress while generating.

---

# Step 10 — Launch

Instead of an empty workspace, users see

Welcome to Lancee.

Your workspace is ready.

Summary

Installed

- Projects
- Clients
- Tasks
- Files
- Calendar

Integrations

- Gmail
- Google Calendar
- Google Drive

Automations

8

Ready to invite your team?

Buttons

Invite Team

Explore Workspace

---

# Configuration Engine

The Workspace Builder uses predefined business profiles.

Each profile contains

- Modules
- Workflows
- Dashboards
- Permissions
- Automations
- Notifications
- Templates
- Integrations

AI extends these profiles.

AI never replaces them.

---

# Success Metrics

- Onboarding completion rate
- Average onboarding time
- Modules accepted
- AI suggestions accepted
- Time to first completed task
- Seven-day retention
- Thirty-day retention

---

# Future Enhancements

- Workspace templates by industry
- Import data from CSV
- Workspace preview before creation
- AI Workspace Health Check
- Growth recommendations
- One-click feature recommendations

---

# Core Philosophy

> Lancee doesn't ask users to learn the platform.

> Lancee learns the business first.

> Then it builds the platform around the business.

---

# Connectors

## Email

- Gmail

---

## Calendar

- Google Calendar
- Calendly

---

## Meetings

- Zoom
- Google Meet

---

## Cloud Storage

- Google Drive
- Dropbox
- Box

---

## Accounting

- Xero
- QuickBooks
- Sage

---

## CRM

- HubSpot
- Salesforce

---

## Communication

- Slack
- WhatsApp Business
- Discord
- Telegram

---

# Core Modules

## Projects

Manage projects, milestones and deliverables.

---

## Clients

Store customer information and relationships.

---

## Tasks

Personal and team task management.

---

## Calendar

Meetings, deadlines and schedules.

---

## Files

Central document storage with version history.

---

## Notes

Personal and shared notes.

---

## Approvals

Configurable approval workflows.

---

## Workflows

Visual workflow automation.

---

## Dashboards

Customisable widgets.

---

## Forms

Dynamic forms for any process.

---

## Knowledge Base

Internal documentation and SOPs.

---

## Assets

Track equipment, vehicles and resources.

---

## Quotes

Create and manage quotations.

---

## Invoices

Track invoices and payment status.

---

## Time Tracking

Billable and non-billable hours.

---

## Client Portal

Secure client collaboration.

---

## Whiteboard

Visual planning and brainstorming.

---

## Templates

Reusable project and document templates.

---

## Annotations

Annotate PDFs, images and documents.

Convert annotations directly into

- Tasks
- Approvals
- Comments
- Issues

---

# Feature Library

Every module can optionally support

- Comments
- Mentions
- Attachments
- AI Assistant
- Activity Timeline
- Relationships
- Tags
- Status
- Priority
- Due Dates
- Checklists
- Notifications
- Automations
- Approvals
- Custom Fields
- Templates
- Version History
- Search
- Audit Log

---

# Automation Engine

## Trigger

Something happens.

↓

## Conditions

Optional checks.

↓

## Actions

One or more actions execute.

---

# Example Triggers

- Task created
- Task completed
- Task overdue
- Approval requested
- Approval completed
- File uploaded
- Annotation added
- Comment added
- Meeting scheduled
- Meeting completed
- Form submitted
- Client created
- Quote accepted
- Invoice paid
- Workflow completed
- Status changed
- Due date reached
- Reminder due
- User invited

---

# Conditions

- Project
- Client
- Assigned User
- Priority
- Status
- Date
- Amount
- Tag
- Custom Field
- File Type
- Team
- Business Hours

---

# Actions

- Create task
- Update task
- Assign user
- Send email
- Send WhatsApp notification
- Send Slack notification
- Schedule meeting
- Create calendar event
- Generate PDF
- Generate document
- Request approval
- Archive project
- Duplicate template
- Create folder
- Upload document
- Update status
- Add comment
- Notify users
- Create reminder
- Create follow-up task
- Create recurring task
- Start another workflow
- Call AI assistant

---

# Smart Recommendations

Instead of a marketplace, Lancee learns how users work.

Examples

You've created 50 recurring tasks.

→ Enable recurring workflows?

You've uploaded hundreds of documents.

→ Enable document versioning?

You're manually requesting approvals.

→ Enable Approval Workflows?

You schedule lots of meetings.

→ Connect Zoom?

You repeatedly create similar projects.

→ Create a Project Template?

---

# Long-Term Vision

Lancee is not another project management platform.

Lancee is a modular business workspace that starts simple, grows naturally, and adapts to the way people work.

Users never need to install dozens of features.

Lancee recommends the right tools at the right time based on how the business evolves.
