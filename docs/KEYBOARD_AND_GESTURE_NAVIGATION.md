# Keyboard and Gesture Navigation

## Overview

The journal UI now supports keyboard shortcuts and touch gestures for easy day-to-day navigation.

## Keyboard Navigation

### Arrow Keys

- **Left Arrow (←)**: Go to previous day
- **Right Arrow (→)**: Go to next day (disabled when on today)

**Smart Detection:**
- Keys are ignored when typing in input fields, textareas, or content-editable elements
- Keys are ignored when the calendar picker is open
- Works on both Digest and Journal views

**Example Usage:**
1. Press Left Arrow repeatedly to browse backwards through your journal days
2. Press Right Arrow to return to more recent days
3. Navigate freely without clicking buttons

## Touch Gestures

### Swipe Navigation

- **Swipe Left**: Go to next day (move forward in time)
- **Swipe Right**: Go to previous day (move backward in time)

**Configuration:**
- Minimum swipe distance: 50px
- Maximum swipe duration: 500ms
- Vertical scrolling is preserved (touch-action: pan-y)
- Mouse drag is disabled (keyboard arrows handle desktop interaction)

**Example Usage:**
1. On mobile/tablet, swipe right to left to view tomorrow (or closer to today)
2. Swipe left to right to view yesterday
3. Vertical scrolling still works normally

## Technical Details

### Dependencies

- **react-swipeable** (v7.x): Modern, lightweight swipe gesture library
  - Tree-shakeable
  - TypeScript support
  - No additional dependencies
  - ~3KB gzipped

### Implementation

The navigation is implemented in [src/ui/src/App.jsx](../src/ui/src/App.jsx):

1. **Keyboard Handler** (useEffect hook)
   - Listens to window keydown events
   - Filters out typing contexts
   - Updates offsetDays state

2. **Swipe Handler** (useSwipeable hook)
   - Configured for touch-only tracking
   - Updates offsetDays state on swipe completion
   - Applied to main content wrapper

3. **State Management**
   - Single `offsetDays` state controls the selected date
   - Bounded between historical data and today (0)
   - Shared by buttons, keyboard, and gestures

### Browser Compatibility

- **Keyboard**: All modern browsers
- **Touch Gestures**: iOS Safari, Chrome Mobile, Firefox Mobile, Edge Mobile
- **Fallback**: Navigation buttons always available

## Future Enhancements

Potential improvements:
- Configurable swipe sensitivity
- Visual feedback during swipe (e.g., page sliding animation)
- Keyboard shortcuts for month/week jumping (e.g., Ctrl+Left/Right)
- Gesture-based zoom (pinch to change time scale)
- Swipe up/down to switch between views (Digest/Journal)
