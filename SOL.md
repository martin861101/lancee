You are the lead frontend engineer and product designer responsible for a complete UI quality pass on the Lancee repository.

Your task is to inspect, repair, standardise, and verify the entire user interface. This is an implementation task, not merely an audit. Work through the repository methodically and make the necessary changes.

Primary objective

Bring Lancee back to a polished, cohesive, premium product standard across:

- Public landing and marketing pages
- Authentication and onboarding
- Main application shell
- Workspace home and Connected Intelligence
- Projects
- Clients
- Calendar
- Meetings
- Mail and communications
- Ideas
- Automations
- Invoices and payments
- Reports
- Integrations
- Team and workspace administration
- Settings
- Assistant and workflow interfaces
- Empty, loading, error, permission, and disconnected states
- Modals, drawers, popovers, dropdowns, tables, forms, navigation, and responsive layouts

Find and fix issues even when they are not explicitly listed below.

Important product direction

Lancee should feel:

- Premium
- Calm
- Intelligent
- Modern
- Professional
- Cohesive
- Spacious without wasting screen space
- Visually distinctive without becoming noisy
- Suitable for freelancers, independent professionals, and small teams

The product should not look like a generic admin template.

Preserve the established Lancee identity:

- Deep navy and dark blue foundations
- Controlled violet, blue, and warm accent colours
- Strong contrast and readable typography
- Refined gradients and soft ambient visual effects
- Consistent radii, borders, shadows, spacing, and surfaces
- A clear connection to the Connected Intelligence positioning
- Existing Lancee logo and brand assets
- Existing intentional animations, including the login experience

Do not perform an uncontrolled redesign. First understand the existing design language, identify the strongest existing screens or components, and use those as the visual baseline. Remove accidental inconsistency while retaining intentional variation between marketing, authentication, and application surfaces.

Non-negotiable instructions

1. Inspect the repository, current working tree, project documentation, AGENTS.md files, design tokens, global styles, routing, component library, and recent relevant changes before editing.
2. Preserve unrelated user changes. Do not reset, revert, overwrite, or discard work you did not create.
3. Do not stop after producing a list of problems.
4. Implement fixes directly.
5. Do not replace functional components with visual placeholders.
6. Do not remove functionality just because it complicates the layout.
7. Do not use fake static data where working dynamic data already exists.
8. Do not silently change API contracts, permissions, authentication, database behaviour, or business rules.
9. Keep existing features operational.
10. Reuse and consolidate components rather than creating multiple near-identical alternatives.
11. Avoid huge monolithic component rewrites unless the current structure genuinely prevents a safe repair.
12. Do not add a new UI framework unless the project already uses it or there is a documented architectural reason.
13. Do not add unnecessary dependencies.
14. Do not treat a successful build as proof that the UI is correct.
15. Continue until the full reachable interface has been reviewed and the highest-impact issues have been fixed.

Phase 1: Establish the baseline

Before making broad changes:

- Identify the frontend stack, build system, styling approach, design-token sources, component primitives, icon set, animation libraries, and testing setup.
- Locate all application routes and major layout variants.
- Identify duplicated or conflicting global styles.
- Find hardcoded colours, spacing, typography, radii, and shadows that bypass the design system.
- Check whether both light and dark surface families are intentionally supported.
- Determine which existing screens best express Lancee’s intended premium appearance.
- Run the existing validation commands to establish the baseline.
- If browser automation, screenshots, Storybook, preview tooling, or visual tests exist, use them.

Create a short internal checklist of routes and major components. Use it to track coverage, but do not stop to ask me for approval unless a genuinely destructive or product-defining decision is required.

Phase 2: Repair the design system

Inspect and correct the shared visual foundation before fixing every page independently.

Standardise:

- Background colours
- Elevated surfaces
- Cards
- Panels
- Borders
- Dividers
- Brand accents
- Text hierarchy
- Muted text
- Success, warning, error, and informational colours
- Hover, focus, selected, active, disabled, and destructive states
- Border radii
- Shadows
- Blur and glass effects
- Spacing scale
- Container widths
- Page gutters
- Typography sizes, weights, and line heights
- Icon sizing and stroke treatment
- Form control heights
- Button heights and padding
- Overlay layering and z-index conventions
- Motion duration and easing
- Skeleton and loading treatments

Consolidate obvious duplicate token definitions. Replace unjustified hardcoded values with shared tokens where safe.

Ensure light sections complement the Lancee navy identity. If light surfaces are used, prefer a refined cool off-white or very pale blue-grey foundation rather than stark white. Cards on light backgrounds should remain clearly separated without heavy shadows.

Do not force every surface to use the same colour. Establish a controlled hierarchy.

Phase 3: Full application audit and implementation

Inspect every reachable route and major user flow.

For each page, check and repair:

- Page title and description hierarchy
- Header alignment
- Toolbar layout
- Navigation state
- Breadcrumb correctness
- Container width
- Grid and flex behaviour
- Card alignment and consistent heights
- Unexpected gaps
- Cramped content
- Overflow and clipping
- Accidental horizontal scrolling
- Inconsistent colours
- Low contrast
- Broken icons
- Missing assets
- Misaligned badges
- Table density and responsiveness
- Form alignment
- Label and validation placement
- Empty states
- Loading states
- Error states
- Disabled states
- Connection states
- Permission states
- Mobile layout
- Tablet layout
- Desktop layout
- Large-screen layout
- Keyboard focus
- Hover feedback
- Modal sizing
- Drawer sizing
- Dropdown positioning
- Tooltip readability
- Scroll locking
- Sticky elements
- Nested scroll containers
- Text truncation
- Long names, email addresses, currency values, and titles
- Date and time formatting
- Button hierarchy
- Destructive-action clarity
- Confirmation behaviour

Look specifically for components that render but are visually or behaviourally broken.

Phase 4: High-priority known problem areas

Pay particular attention to the following.

Authentication

- Restore or repair any intended login-page animation.
- Confirm animations are attached to visible elements and not empty wrappers.
- Ensure animation does not interfere with forms or accessibility.
- Respect reduced-motion preferences.
- Check sign-in, sign-up, verification, password-reset, and OAuth states.
- Ensure visual consistency across all authentication routes.

Main application shell

- Correct sidebar proportions, spacing, grouping, active states, collapse behaviour, and responsive behaviour.
- Correct top navigation, workspace switcher, search, notifications, profile controls, and mobile navigation.
- Prevent shell elements from overlapping page content.
- Ensure page height and scroll ownership are predictable.
- Make the shell feel calm and premium rather than dense or template-like.

Workspace home and Connected Intelligence

- Ensure the home page communicates useful connected business intelligence rather than looking like a generic dashboard.
- Repair card hierarchy, opportunity panels, priority indicators, action lists, charts, and supporting context.
- Avoid presenting every card at equal visual weight.
- Make recommended actions and important signals obvious.
- Preserve explainability: confidence, reason, source, impact, urgency, and next action should be readable when available.

Projects

- Repair project list, grid, detail, task, notes, files, communication, activity, and Kanban interfaces.
- Check drag-and-drop styling and behaviour.
- Ensure board columns and cards remain usable on smaller screens.
- Correct empty project states and creation flows.
- Ensure project status, client, deadline, progress, and financial context use a consistent hierarchy.

Meetings and calendar

- Review meeting layout, participant areas, controls, device settings, invitation states, scheduling, guest links, and meeting detail views.
- Repair camera, microphone, screen-share, connection, and disabled states where represented in the UI.
- Ensure meeting controls remain visible and understandable at different viewport sizes.
- Improve calendar density, event legibility, overflow behaviour, selected states, and mobile handling.
- Do not claim unsupported meeting functionality is operational.

Mail and communications

- Repair mailbox layout, message list, thread view, composer, attachments, project linking, identity resolution, and connection states.
- Make selected-message and selected-folder states clear.
- Handle long subjects and sender details.
- Ensure disconnect actions are deliberate and not triggered by an ordinary “Manage” action.
- Review connection-management UI carefully without changing backend behaviour unless the UI is calling the wrong existing action.

Integrations

- Fix card consistency, provider logos, connection status, connection details, manage actions, reconnect states, errors, and disabled states.
- “Manage” must not visually or behaviourally imply “Disconnect.”
- Disconnect must be an explicit destructive action with appropriate confirmation.
- Clearly distinguish connected, attention required, expired, disconnected, coming soon, and unsupported states.
- Do not present planned integrations as active.

Invoices and payments

- Improve invoice list, filters, creation form, line items, totals, tax, currency display, status badges, previews, templates, and responsive behaviour.
- Correct basic or unfinished invoice-template presentation while retaining valid invoice data and print requirements.
- Ensure on-screen and printable views remain professional.
- Confirm tables do not break with long descriptions or large values.

Settings and team

- Repair page structure, section navigation, form grouping, save states, invitations, roles, member status, access controls, and destructive actions.
- Make current values, unsaved changes, successful saves, validation failures, and server failures visually clear.
- Do not weaken workspace authorization or invitation security.

Assistant and workflow UI

- Verify all supported assistant response types render correctly:
  - message
  - workflow preview
  - confirmation
  - error
  - data
  - artifact
- Repair markdown, code, lists, tables, citations, file links, approval controls, tool progress, error messages, retries, and long-running states.
- Prevent raw structured objects from leaking into the UI.
- Keep approval boundaries explicit.
- Do not introduce frontend shortcuts that bypass server-issued approvals.

Phase 5: Component integrity

Inspect shared components, including:

- Buttons
- Icon buttons
- Inputs
- Textareas
- Selects
- Comboboxes
- Date pickers
- Checkboxes
- Radio groups
- Switches
- Tabs
- Cards
- Alerts
- Badges
- Avatars
- Tables
- Pagination
- Menus
- Dropdowns
- Tooltips
- Popovers
- Dialogs
- Drawers
- Toasts
- Skeletons
- Progress indicators
- Charts
- Empty states
- Error boundaries
- File uploaders
- Rich-text or markdown renderers
- Command palettes
- Search interfaces

Check each component’s variants and interactive states. Fix variant combinations that produce invisible text, incorrect borders, wrong hover colours, inconsistent padding, or broken alignment.

If multiple components solve the same problem, carefully consolidate them around the stronger implementation. Update consumers safely and remove dead duplicates only when you have verified that they are unused.

Phase 6: Responsive and accessibility pass

Validate at representative viewport sizes, including approximately:

- 360px mobile
- 390px mobile
- 768px tablet
- 1024px small desktop
- 1440px desktop
- 1920px large desktop

Check:

- Keyboard navigation
- Visible focus indicators
- Semantic labels
- Form associations
- Dialog focus management
- Escape behaviour
- Screen-reader names for icon-only controls
- Colour contrast
- Touch target size
- Reduced-motion support
- Meaning not conveyed through colour alone
- Correct heading hierarchy
- Sensible tab order

Do not pursue theoretical accessibility compliance at the expense of breaking working flows. Fix real, demonstrable issues.

Phase 7: Runtime verification

Run the application and inspect the actual rendered UI.

Where authentication or missing services block a route:

- Use existing supported development or test mechanisms.
- Do not weaken production authentication.
- Do not invent insecure bypasses.
- Document what could not be rendered and verify what can be verified through tests and code inspection.

Use browser inspection or screenshots when available to evaluate:

- Alignment
- Spacing
- Colour consistency
- Overflow
- Component states
- Responsive behaviour
- Console errors
- Failed network requests relevant to the UI
- React warnings
- Hydration errors
- Missing keys
- Broken asset paths
- Layout shifts

Fix console errors and warnings caused by the frontend work.

Do not rely only on code inspection.

Phase 8: Testing and validation

After implementation, run the appropriate available commands, which may include:

- Type checking
- Linting
- Unit tests
- Component tests
- Integration tests
- End-to-end tests
- Production build
- Existing verification scripts

Add focused tests where a repaired behaviour is important and the repository already has an appropriate test pattern.

Prioritise tests for:

- Navigation and responsive shell behaviour
- Modal and drawer interactions
- Forms and validation
- Integration manage versus disconnect behaviour
- Assistant response rendering
- Loading and error states
- Critical responsive components
- Any regression discovered during the audit

Do not “fix” validation by disabling rules, excluding files, weakening assertions, or deleting failing tests unless the test is conclusively obsolete and its removal is justified.

Handling existing failures

Distinguish between:

1. Failures caused by your changes
2. Pre-existing failures directly related to this task
3. Pre-existing failures unrelated to this task
4. Failures caused by unavailable external infrastructure

Fix categories 1 and 2.

For categories 3 and 4, record the precise evidence and continue with all work that is not blocked.

Working method

Work in coherent batches:

1. Repository and route inventory
2. Design-token and global-style repair
3. Shared component repair
4. Application shell
5. High-traffic routes
6. Remaining routes and state variants
7. Responsive and accessibility pass
8. Runtime visual verification
9. Tests, build, and final regression pass

After each meaningful batch, run targeted validation so errors do not accumulate.

Use screenshots or concrete rendered evidence to revisit any area that still feels visually inconsistent. If something looks wrong, investigate and improve it even if it technically compiles.

Decision authority

You may independently:

- Correct inconsistent spacing
- Fix broken responsive rules
- Harmonise colours
- Consolidate design tokens
- Improve shared components
- Repair layout structure
- Restore intended animations
- Improve empty/loading/error states
- Correct visual hierarchy
- Fix incorrect frontend event wiring where the intended existing action is clear
- Add targeted UI tests
- Refactor duplicated presentation code
- Improve accessibility
- Remove verified dead UI code

Pause and ask only if a decision would:

- Delete meaningful user functionality
- Change a business process
- Alter a public API contract
- Require a database migration
- Weaken authentication or authorization
- Replace the established brand direction
- Introduce a major new dependency or framework
- Destroy or overwrite existing work

Completion standard

This task is not complete until:

- The reachable interface has been systematically reviewed.
- Broken UI components have been repaired.
- Major colour and token mismatches have been resolved.
- Shared components use coherent styling.
- The application shell works responsively.
- High-priority Lancee screens feel visually related.
- Important loading, empty, error, disabled, permission, and connection states are usable.
- Known visual and interaction regressions have been addressed.
- Runtime console errors introduced or exposed by this work have been resolved where within scope.
- Type checking and production build pass, or any remaining blocker is proven to be pre-existing or infrastructure-related.
- Relevant tests pass.
- No security boundary has been weakened.
- No unrelated user work has been discarded.

Final response format

When finished, provide:

1. Overall result
2. Major UI problems found
3. Major repairs implemented
4. Design-system changes
5. Routes and flows reviewed
6. Responsive and accessibility work
7. Tests and commands run, with exact results
8. Remaining issues, separated into:
   - Blocking
   - Important follow-up
   - Optional polish
9. Files or major areas changed
10. A clear statement of whether the UI cleanup is:

- Complete
- Complete with documented follow-up
- Partially complete
- Blocked

Do not exaggerate coverage. Do not say “all UI fixed” unless you actually inspected and verified it.

Begin by inspecting the repository and existing instructions. Then proceed with implementation without waiting for further direction.
