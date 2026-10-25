/**
 * Touch Swipe Gesture Controller
 * Supports tactile horizontal swipe gestures with physics feedback and edge bounce.
 */

export function attachSwipeListener(element, { onNext, onPrev }) {
  if (!element) return () => {};

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;
  let startTime = 0;

  const minDistance = 50; // Minimum px to trigger swipe
  const maxPerpendicularDistance = 80; // If user scrolls vertically, don't trigger horizontal swipe

  function handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = startX;
    startTime = Date.now();
    isSwiping = true;
    element.style.transition = 'none';
  }

  function handleTouchMove(e) {
    if (!isSwiping || e.touches.length !== 1) return;
    currentX = e.touches[0].clientX;
    const deltaX = currentX - startX;
    const deltaY = e.touches[0].clientY - startY;

    // If moving mostly horizontally, provide live card movement
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaY) < maxPerpendicularDistance) {
      // Slight resistance damping
      const resistance = 0.6;
      element.style.transform = `translateX(${deltaX * resistance}px) rotate(${deltaX * 0.03}deg)`;
      element.style.opacity = `${Math.max(0.4, 1 - Math.abs(deltaX) / 400)}`;
    }
  }

  function handleTouchEnd(e) {
    if (!isSwiping) return;
    isSwiping = false;

    const deltaX = currentX - startX;
    const deltaY = (e.changedTouches[0]?.clientY || startY) - startY;
    const elapsed = Date.now() - startTime;
    const velocity = Math.abs(deltaX) / elapsed;

    element.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    element.style.transform = '';
    element.style.opacity = '';

    // Check if horizontal intent is clear
    if (Math.abs(deltaY) < maxPerpendicularDistance) {
      const isQuickFlick = velocity > 0.4 && Math.abs(deltaX) > 30;
      const isLongSwipe = Math.abs(deltaX) > minDistance;

      if (isQuickFlick || isLongSwipe) {
        // In the user's brief: "swiping on the right will change to the next qstn"
        // Touching and swiping to the right (positive deltaX) moves to next question:
        if (deltaX > 0) {
          if (navigator.vibrate) navigator.vibrate(15);
          onNext();
        } else {
          // Swiping left goes to previous question
          if (navigator.vibrate) navigator.vibrate(15);
          onPrev();
        }
      }
    }
  }

  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchmove', handleTouchMove, { passive: true });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });
  element.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  // Return cleanup function
  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
    element.removeEventListener('touchcancel', handleTouchEnd);
  };
}
