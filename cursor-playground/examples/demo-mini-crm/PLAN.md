# Mini-CRM Demo Plan

## Step 1: Dashboard Overview
- **Source:** mockups/dashboard.html
- **Action:** Create src/pages/dashboard/Dashboard.tsx with hero metrics, lead stats, and recent activity timeline matching the mockup.
- **Verification:** Add Playwright expect statements for "Active Leads" and "Sync Inbox" buttons.

## Step 2: Contact List
- **Source:** mockups/contact-list.html
- **Action:** Build src/pages/contacts/ContactList.tsx using a sortable table with Name, Email, and Status tags.
- **Verification:** Update the generated e2e spec to click the "Add Contact" CTA and assert the modal appears.
