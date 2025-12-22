# GSAP Section Animations

## Overview

The journal UI now features smooth, professional animations for section mounting/unmounting using GSAP (GreenSock Animation Platform). Sections elegantly fade in and slide into position when content loads, and smoothly transition out when changing days.

## Animation Behavior

### Mount Animations (Content Appearing)

When sections load or a new day is selected:

1. **Fade + Slide In**
   - Sections start with `opacity: 0` and `y: 30px` (below final position)
   - Animate to `opacity: 1` and `y: 0` over 0.6 seconds
   - Use `power3.out` easing for smooth deceleration
   - Staggered delays create a cascading effect

2. **Stagger Pattern**
   - Journal section: 0s delay
   - GitHub/Trello row: 0.1s delay
   - Music/Timeline row: 0.2s delay
   - Bookmarks: 0.25s+ delay (incremental per bookmark section)

### Unmount Animations (Content Disappearing)

When changing to a different day:

1. **Fade + Slide Out**
   - Content fades to `opacity: 0` and moves up `y: -20px`
   - Duration: 0.3 seconds
   - Use `power2.in` easing for quick exit
   - Happens before new content loads

2. **Transition Flow**
   - User navigates to new day (arrow keys, swipe, or buttons)
   - Current content animates out (0.3s)
   - New data fetches from API
   - New content animates in (0.6s with stagger)

## Technical Implementation

### Dependencies

**GSAP** (v3.14.2): Industry-standard animation library
- High-performance animations
- Smooth 60fps timeline control
- Small footprint (~50KB minified)
- Works on all modern browsers

### Components

#### AnimatedSection Wrapper

Located in [src/ui/src/components/Digest.jsx](../src/ui/src/components/Digest.jsx):

```jsx
const AnimatedSection = ({ children, delay = 0 }) => {
  const sectionRef = useRef(null);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    // Set initial state
    gsap.set(element, { opacity: 0, y: 30 });

    // Animate in
    const animation = gsap.to(element, {
      opacity: 1,
      y: 0,
      duration: 0.6,
      delay: delay,
      ease: 'power3.out',
    });

    return () => animation.kill();
  }, [delay]);

  return <div ref={sectionRef}>{children}</div>;
};
```

#### Day Change Animations

**Digest Component:**
- Tracks previous `offsetDays` value
- On change, animates entire content wrapper out
- Fetches new data
- Animates new content in
- Individual sections use staggered delays

**Journal Component:**
- Similar pattern for date changes
- Animates entire journal box as one unit
- Smooth transitions between different days' entries

### Files Modified

1. **[src/ui/src/components/Digest.jsx](../src/ui/src/components/Digest.jsx)**
   - Added GSAP import
   - Created `AnimatedSection` component
   - Wrapped all sections in `AnimatedSection`
   - Added content ref for whole-page transitions
   - Implemented out/in animation on `offsetDays` change

2. **[src/ui/src/components/Journal.jsx](../src/ui/src/components/Journal.jsx)**
   - Added GSAP import
   - Added content ref for transitions
   - Implemented out/in animation on `date` change

3. **[package.json](../package.json)**
   - Added `gsap: ^3.14.2` dependency

## Animation Timing

| Event | Duration | Easing | Delay |
|-------|----------|--------|-------|
| Section mount | 0.6s | power3.out | Staggered 0-0.3s |
| Page unmount | 0.3s | power2.in | 0s |
| Page mount | 0.4s | power2.out | 0s |

## Performance

- **GPU Acceleration**: Transforms and opacity use GPU automatically
- **No Reflows**: Only animating transform and opacity (no layout changes)
- **Memory Efficient**: Animations are properly cleaned up on unmount
- **Smooth 60fps**: GSAP's optimized rendering pipeline

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS & macOS)
- Mobile browsers: Optimized for touch devices

## Customization

To adjust animation parameters, modify the GSAP settings:

**Speed:**
```javascript
duration: 0.6, // Make faster (e.g., 0.3) or slower (e.g., 1.0)
```

**Stagger:**
```javascript
delay: 0.1, // Increase/decrease gap between sections
```

**Distance:**
```javascript
y: 30, // Reduce for subtler slide (e.g., 15)
```

**Easing:**
```javascript
ease: 'power3.out', // Try: 'power1', 'power2', 'back.out', 'elastic.out'
```

## Future Enhancements

Potential improvements:
- Page slide transitions (left/right) when navigating days
- Loading skeleton animations
- Micro-interactions on hover
- Parallax effects for background elements
- Confetti animation on goal completion
- Smooth height transitions when adding/removing items
