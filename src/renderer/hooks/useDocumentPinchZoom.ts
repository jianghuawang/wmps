import { useEffect, useRef, type RefObject } from 'react';
import { pinchScaleFactor } from '../editors/document-zoom';

export function useDocumentPinchZoom(surfaceRef: RefObject<HTMLElement | null>, applyScaleFactor: (factor: number) => void) {
  const callbackRef = useRef(applyScaleFactor); callbackRef.current = applyScaleFactor;
  useEffect(() => {
    const surface = surfaceRef.current; if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !(event.target instanceof Node) || !surface.contains(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation(); callbackRef.current(pinchScaleFactor(event.deltaY));
    };
    // Capture at the window boundary so embedded document engines cannot consume
    // the synthetic Ctrl+wheel pinch before WMPS routes it to document zoom.
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, [surfaceRef]);
}
