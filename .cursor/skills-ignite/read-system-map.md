---
description: Read the system-map.json to understand system capabilities and routes
---

# Read System Map

When the user asks about system capabilities, existing features, or requests new features, **ALWAYS** read the `system-map.json` file in the root directory first.

This file contains a machine-generated map of:
1.  **Routes:** All active UI paths and their corresponding components.
2.  **Capabilities:** All available Edge Functions and Jobs.
3.  **Entities:** The data model structure.

**Usage:**

1.  Read `system-map.json`.
2.  Search the `routes` array to see if a UI for the requested feature already exists.
3.  Search the `capabilities` array to see if the backend logic already exists.
4.  **ONLY** propose a new feature if it is NOT present in the map.

**Example:**

User: "Add a way to edit books."
Agent: *Reads system-map.json* -> Finds `/admin/book-studio` route.
Agent: "The system already has a Book Studio at `/admin/book-studio`. Do you want to modify it?"
