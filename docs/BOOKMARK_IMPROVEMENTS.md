# Bookmark Enrichment Improvements

## Changes Made

### 1. Email Subject Fallback for Failed Enrichments

**Problem:** Some websites (like BoingBoing.net) block scraping attempts, resulting in 403 errors and missing titles/images in bookmark enrichments.

**Solution:** When link enrichment fails or returns insufficient data, the system now falls back to using the email subject as the bookmark title.

#### Modified Files:
- [src/collector/sources/emailBookmarks.js](src/collector/sources/emailBookmarks.js)
  - Enhanced `enrichPending()` function to detect failed enrichments (HTTP 4xx/5xx errors)
  - Automatically uses email subject as fallback title when:
    - HTTP status is 400 or higher
    - Title is missing, generic ("Just a moment..."), or indicates access denial
  - Marks fallback titles with `titleSource: 'email_subject_fallback'` for tracking

#### How It Works:
1. Email bookmarks are collected with subject line stored in payload
2. Link enrichment is attempted using the readability enricher
3. If enrichment fails (403, timeout, etc.) or returns poor data:
   - Email subject is used as the title
   - Other enrichment data (excerpt, image) remains as-is
4. Digest already has fallback logic to use `payload.subject` when enrichment title is missing

### 2. Delete Button for Bookmarks

**Problem:** No way to remove unwanted bookmarks from the digest UI.

**Solution:** Added delete buttons to each bookmark in the digest view.

#### Modified Files:
- [src/web/server.js](src/web/server.js)
  - Added `DELETE /api/events/:id` endpoint
  - Validates user ownership before deletion
  - Cascades delete to related enrichments and day events

- [src/digest/sections/bookmarks.js](src/digest/sections/bookmarks.js)
  - Added event `id` to bookmark items for deletion support

- [src/ui/src/components/Digest.jsx](src/ui/src/components/Digest.jsx)
  - Added `onDeleteBookmark` prop to `BookmarkSection` component
  - Implemented `handleDeleteBookmark()` function with confirmation dialog
  - Updates UI state to remove deleted bookmark immediately
  - Added delete button (Bulma `delete` class) next to each bookmark

#### How It Works:
1. User clicks delete button on a bookmark
2. Confirmation dialog appears
3. DELETE request sent to `/api/events/:id`
4. On success, bookmark is removed from UI state
5. User can re-run collector to restore if needed

### 3. Testing Tools

Created helper scripts for debugging and fixing enrichment issues:

#### [scripts/test-enrichment.js](scripts/test-enrichment.js)
Test link enrichment for any URL:
```bash
node scripts/test-enrichment.js https://example.com/article
```

Outputs:
- Full enrichment result JSON
- HTTP status
- Title, image, excerpt availability
- Warnings for errors or missing data

#### [scripts/re-enrich-event.js](scripts/re-enrich-event.js)
Re-run enrichment for an existing bookmark event with email subject fallback:
```bash
node scripts/re-enrich-event.js cmjhdj11m002xlbw23kvlypqe
```

Features:
- Displays current event payload and enrichments
- Fetches fresh enrichment data
- Applies email subject fallback if needed
- Updates database with new enrichment
- Shows before/after comparison

## Testing

### Test the BoingBoing Event

The event mentioned in the issue (`cmjhdj11m002xlbw23kvlypqe`) can be fixed:

```bash
node scripts/re-enrich-event.js cmjhdj11m002xlbw23kvlypqe
```

This will:
1. Show the current bad enrichment (403 error, "Just a moment..." title)
2. Apply the email subject fallback: "The New Jersey amusement park so dangerous it bought the town extra ambulances"
3. Update the database

### Test New Bookmarks

New bookmarks collected from emails will automatically get email subject fallback if enrichment fails.

### Test Delete Functionality

1. Open the digest view in the UI
2. Find a bookmark in the "Bookmarks" section
3. Click the × (delete) button
4. Confirm deletion
5. Bookmark should disappear immediately

## Environment Variables

The following environment variables can be configured (optional):

- `LINK_PREVIEW_TIMEOUT_MS` - Timeout for link enrichment (default: 15000ms)
- `LINK_PREVIEW_USER_AGENT` - User agent for HTTP requests

## Future Improvements

Potential enhancements:
- Try alternative scraping methods for blocked sites (Puppeteer, proxy services)
- Cache email subjects in Event metadata for easier access
- Add "undo" functionality for deleted bookmarks
- Batch delete operations
- Filter bookmarks by source/date range
