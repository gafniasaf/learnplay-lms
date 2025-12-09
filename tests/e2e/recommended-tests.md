# Recommended Additional E2E Tests

Based on the current test suite review, here are recommended tests to add:

## 🔐 Authentication & Authorization

### 1. **Full Authentication Flow** (`auth-flow.spec.ts`)
- ✅ Login with valid credentials
- ✅ Login with invalid credentials (error handling)
- ✅ Sign up new user
- ✅ Logout functionality
- ✅ Session expiration handling
- ✅ Password reset flow (if implemented)
- ✅ Remember me / persistent sessions
- ✅ OAuth/SSO flows (if applicable)

**Why:** Currently only RBAC is tested, but not the full auth lifecycle.

---

## 🔍 Search & Filtering

### 2. **Search Functionality** (`search-and-filter.spec.ts`)
- ✅ Course catalog search
- ✅ Filter by subject/topic
- ✅ Filter by grade level
- ✅ Sort options (alphabetical, date, popularity)
- ✅ Search with no results (empty state)
- ✅ Search with special characters
- ✅ Clear search/filters

**Why:** Search is a core feature but not explicitly tested.

---

## 📱 Responsive Design & Mobile

### 3. **Mobile Viewport Testing** (`mobile-responsive.spec.ts`)
- ✅ All pages render correctly on mobile (375px, 768px)
- ✅ Navigation menu works on mobile
- ✅ Forms are usable on mobile
- ✅ Touch interactions work
- ✅ Course editor usable on tablet

**Why:** Critical for user experience, especially for students/parents.

---

## ⌨️ Keyboard Navigation & Accessibility

### 4. **Keyboard Navigation** (`keyboard-accessibility.spec.ts`)
- ✅ Tab navigation through all interactive elements
- ✅ Enter/Space activates buttons
- ✅ Escape closes modals/dropdowns
- ✅ Arrow keys navigate lists
- ✅ Focus indicators visible
- ✅ Skip to main content links
- ✅ ARIA labels present

**Why:** Accessibility compliance and keyboard-only users.

---

## 📤 File Uploads & Media

### 5. **Comprehensive Media Upload** (`media-upload-comprehensive.spec.ts`)
- ✅ Image upload (various formats: JPG, PNG, GIF, WebP)
- ✅ File size limits enforced
- ✅ Invalid file types rejected
- ✅ Upload progress indicator
- ✅ Upload cancellation
- ✅ Multiple file upload
- ✅ Drag & drop upload
- ✅ Upload error handling (network failure)

**Why:** Current media tests are basic; uploads need thorough validation.

---

## 🔗 Deep Linking & Direct Access

### 6. **Deep Link Access** (`deep-linking.spec.ts`)
- ✅ Direct URL to course editor (`/admin/editor/:id`)
- ✅ Direct URL to play session (`/play/:courseId`)
- ✅ Direct URL to assignment (`/student/assignments/:id`)
- ✅ Invalid IDs show appropriate error
- ✅ Unauthorized access redirects
- ✅ Deep links work after login

**Why:** Users bookmark/share links; need to work reliably.

---

## 🚨 Error States & Edge Cases

### 7. **Empty States** (`empty-states.spec.ts`)
- ✅ Empty course catalog shows helpful message
- ✅ No assignments message
- ✅ No students in class
- ✅ Empty search results
- ✅ No jobs in queue
- ✅ Empty media library

**Why:** Empty states are common but not explicitly tested.

### 8. **Error Boundary Testing** (`error-boundaries.spec.ts`)
- ✅ React error boundaries catch errors gracefully
- ✅ Error messages are user-friendly
- ✅ Retry mechanisms work
- ✅ Error reporting (if Sentry integrated)

**Why:** Ensures app doesn't crash completely on errors.

---

## ⚡ Performance & Load

### 9. **Performance Metrics** (`performance.spec.ts`)
- ✅ Page load time < 3s
- ✅ Time to Interactive (TTI) < 5s
- ✅ Large course lists render efficiently
- ✅ Infinite scroll performance (if implemented)
- ✅ Image lazy loading works

**Why:** Performance directly impacts user experience.

---

## 🔄 Concurrent Operations

### 10. **Multi-Tab Behavior** (`concurrent-operations.spec.ts`)
- ✅ Session sync across tabs
- ✅ Course edits in one tab reflect in another
- ✅ Logout in one tab logs out others
- ✅ Real-time updates work across tabs
- ✅ No race conditions in concurrent edits

**Why:** Users often have multiple tabs open.

---

## 📊 Data Export & Download

### 11. **Export Functionality** (`export-download.spec.ts`)
- ✅ Export course data (if implemented)
- ✅ Download student reports
- ✅ Export assignment results
- ✅ CSV/PDF generation (if applicable)
- ✅ Export error handling

**Why:** Teachers/admins need data export capabilities.

---

## 🔔 Notifications & Toasts

### 12. **Toast/Notification System** (`notifications.spec.ts`)
- ✅ Success toasts appear and auto-dismiss
- ✅ Error toasts are visible and dismissible
- ✅ Multiple toasts stack correctly
- ✅ Toast messages are accessible (screen reader)
- ✅ Action buttons in toasts work

**Why:** User feedback is critical but not explicitly tested.

---

## 📄 Pagination & Infinite Scroll

### 13. **Pagination Testing** (`pagination.spec.ts`)
- ✅ Next/Previous page navigation
- ✅ Page number selection
- ✅ Items per page selector
- ✅ Pagination resets on filter/search
- ✅ Infinite scroll loads more content (if implemented)
- ✅ Scroll position maintained on navigation

**Why:** Large datasets need pagination; not currently tested.

---

## 🎯 Form Validation Edge Cases

### 14. **Advanced Form Validation** (`form-validation-advanced.spec.ts`)
- ✅ Required field validation
- ✅ Email format validation
- ✅ Password strength requirements
- ✅ Character limits enforced
- ✅ XSS prevention (script tags rejected)
- ✅ SQL injection prevention (special chars handled)
- ✅ File upload validation (type, size)

**Why:** Security and data integrity depend on validation.

---

## 🔐 Security Testing

### 15. **Security Edge Cases** (`security-edge-cases.spec.ts`)
- ✅ XSS prevention in user inputs
- ✅ CSRF token validation (if applicable)
- ✅ Input sanitization
- ✅ Sensitive data not exposed in URLs
- ✅ Authorization checks on all protected routes

**Why:** Security is critical but needs explicit testing.

---

## 📱 Parent-Child Linking

### 16. **Parent-Child Management** (`parent-child-linking.spec.ts`)
- ✅ Parent can link child account
- ✅ Parent can unlink child
- ✅ Parent sees child's progress
- ✅ Child cannot access parent dashboard
- ✅ Multiple children per parent

**Why:** Core parent feature but not fully tested.

---

## 🎓 Student Class Management

### 17. **Student Class Operations** (`student-class-management.spec.ts`)
- ✅ Student can join class with code
- ✅ Invalid class code rejected
- ✅ Student sees assignments after joining
- ✅ Student can leave class
- ✅ Teacher sees student after join

**Why:** Core student-teacher interaction flow.

---

## 🏷️ Tag Management (Admin)

### 18. **Tag Management Workflows** (`tag-management-workflows.spec.ts`)
- ✅ Create new tag
- ✅ Edit tag
- ✅ Delete tag (with confirmation)
- ✅ Tag approval workflow
- ✅ Tag search/filter
- ✅ Tag usage tracking

**Why:** Admin feature exists but not tested.

---

## 📈 Analytics & Reporting

### 19. **Analytics Display** (`analytics-reporting.spec.ts`)
- ✅ Teacher analytics load correctly
- ✅ Charts render properly
- ✅ Date range filters work
- ✅ Export analytics data
- ✅ Real-time updates in analytics

**Why:** Teachers rely on analytics; needs validation.

---

## 🎮 Game Session Edge Cases

### 20. **Play Session Edge Cases** (`play-session-edge-cases.spec.ts`)
- ✅ Session timeout handling
- ✅ Network interruption recovery
- ✅ Browser back button behavior
- ✅ Multiple choice question validation
- ✅ Progress saving mid-session
- ✅ Session completion tracking

**Why:** Game sessions are critical but edge cases not covered.

---

## Priority Recommendations

### **High Priority** (Add First):
1. ✅ Authentication Flow (`auth-flow.spec.ts`)
2. ✅ Search & Filtering (`search-and-filter.spec.ts`)
3. ✅ Mobile Responsive (`mobile-responsive.spec.ts`)
4. ✅ Empty States (`empty-states.spec.ts`)

### **Medium Priority**:
5. ✅ Keyboard Navigation (`keyboard-accessibility.spec.ts`)
6. ✅ Deep Linking (`deep-linking.spec.ts`)
7. ✅ Media Upload Comprehensive (`media-upload-comprehensive.spec.ts`)
8. ✅ Notifications (`notifications.spec.ts`)

### **Lower Priority** (Nice to Have):
9. ✅ Performance Metrics (`performance.spec.ts`)
10. ✅ Concurrent Operations (`concurrent-operations.spec.ts`)

---

## Notes

- All tests should use `playwright.real-db.config.ts` for real database/LLM
- Tests should be resilient with flexible selectors and timeouts
- Follow existing patterns from `comprehensive-pages.spec.ts` and `learnplay-journeys.spec.ts`
- Use `storageState` for authenticated contexts
- Include both positive and negative test cases
