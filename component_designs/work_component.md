# Work panel component

**Build a Production-Ready Trello-Style Work Panel using dnd-kit**

Build a modern **Work Panel** component that behaves similarly to Trello using **React + TypeScript + dnd-kit**.

This should be a production-quality implementation—not a demo—with clean architecture, reusable components, excellent performance, and maintainable code.

---

# Goal

Create a Kanban board supporting:

* Dragging tasks within a column
* Dragging tasks between columns
* Dragging entire columns horizontally
* Smooth animations
* Excellent performance
* Clean separation of components
* Easily extensible architecture

The final implementation should feel comparable to Trello, Linear or Jira.

---

# Technology

Use:

* React
* TypeScript
* dnd-kit
* React.memo where appropriate

Do **not** use react-beautiful-dnd.

---

# Data Model

Structure the state like this:

```ts
export interface Task {
    id: string;
    content: string;
}

export interface Column {
    id: string;
    title: string;
    tasks: Task[];
}
```

The board state should be:

```ts
Column[]
```

where every column owns its own task list.

Never flatten tasks into a single array.

---

# Component Architecture

Split the implementation into reusable components.

Suggested structure:

```
WorkPanel/
│
├── WorkPanel.tsx
├── BoardColumn.tsx
├── TaskCard.tsx
├── DragOverlay.tsx
├── types.ts
├── utils.ts
└── hooks/
```

Avoid placing all logic in one file.

---

# Drag Architecture

Implement two sortable levels.

## Level 1

Columns

* sortable horizontally

using

```
SortableContext
horizontalListSortingStrategy
```

---

## Level 2

Tasks

Each column contains another

```
SortableContext
verticalListSortingStrategy
```

allowing:

* reorder inside column
* move between columns

---

# DndContext

Wrap the entire board with

```
<DndContext>
```

Configure PointerSensor with an activation constraint to prevent accidental dragging while interacting with inputs.

Example:

```ts
PointerSensor

activationConstraint:

distance: 8
```

Use

```
closestCorners
```

collision detection.

---

# Drag Behaviour

Implement both handlers correctly.

## onDragOver

This should:

* update UI immediately
* support moving cards between columns
* support dropping into empty columns
* insert at the correct hover index
* remove task from source column
* insert into destination column

This provides the smooth Trello-style interaction.

---

## onDragEnd

Handle two cases.

### Column dragging

Reorder columns using

```
arrayMove()
```

### Task dragging

Finalize sorting inside the destination column.

Only commit changes if the drop is valid.

---

# BoardColumn Component

Each column should:

* be sortable
* act as a drop zone
* contain a nested SortableContext
* expose drag listeners only on the column header
* not make the entire column draggable

Suggested layout:

```
---------------------------------
Column Title

Task
Task
Task

+ Add Task
---------------------------------
```

---

# TaskCard Component

Each task should:

* use useSortable
* display drag opacity
* animate smoothly
* be memoized using

```
React.memo()
```

Include:

* subtle shadow
* rounded corners
* hover state
* grabbing cursor

---

# Performance Requirements

Optimise for large boards.

Requirements:

* React.memo for TaskCard
* stable callbacks
* avoid unnecessary rerenders
* unique IDs only
* never use array indexes as IDs

---

# Drag Overlay

Implement

```
<DragOverlay>
```

Requirements:

* floating dragged card
* original location becomes a placeholder
* mouse always remains centred on dragged card
* visually similar to Trello

---

# UX Requirements

The interaction should feel polished.

Include:

* smooth transitions
* animated insertion
* placeholder spacing
* horizontal scrolling for many columns
* vertical scrolling inside long columns
* responsive layout
* no layout jumping

---

# Styling

Modern minimal UI.

Columns:

* light background
* rounded corners
* padding
* subtle shadow

Cards:

* white
* rounded
* hover elevation
* clean typography

Spacing similar to:

* Trello
* Linear
* Jira

---

# Code Quality

Requirements:

* strict TypeScript
* reusable hooks where appropriate
* no duplicated logic
* clean helper functions
* meaningful variable names
* comments only where behaviour is non-obvious

---

# Future Extensibility

Structure the implementation so it can later support:

* Supabase persistence
* Firebase persistence
* optimistic updates
* websocket collaboration
* task editing
* task creation
* column creation
* column deletion
* task deletion
* task metadata
* labels
* due dates
* assignees
* filtering
* search

The architecture should not require major refactoring to support these features.

---

# Deliverables

Produce:

1. Complete folder structure
2. All React components
3. Type definitions
4. Drag logic
5. Helper utilities
6. Reusable hooks
7. Example initial data
8. Fully working production-ready implementation

The implementation should compile without modification and follow modern React best practices while remaining easy to maintain and extend.
