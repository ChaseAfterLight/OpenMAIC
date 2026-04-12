'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useCanvasStore } from '@/lib/store/canvas';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement } from '@/lib/types/slides';

interface SpotlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Spotlight overlay component
 *
 * Uses DOM measurement (getBoundingClientRect) to compute spotlight position,
 * avoiding alignment offsets from percentage coordinate conversion.
 */
export function SpotlightOverlay() {
  const spotlightElementId = useCanvasStore.use.spotlightElementId();
  const spotlightOptions = useCanvasStore.use.spotlightOptions();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );

  const measure = useCallback(() => {
    if (!spotlightElementId || !containerRef.current) {
      setRect(null);
      return;
    }

    const domElement = document.getElementById(`screen-element-${spotlightElementId}`);
    if (!domElement) {
      setRect(null);
      return;
    }

    const contentEl = domElement.querySelector('.element-content');
    const targetEl = contentEl ?? domElement;

    const containerRect = containerRef.current.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    if (containerRect.width === 0 || containerRect.height === 0) {
      setRect(null);
      return;
    }

    setRect({
      x: ((targetRect.left - containerRect.left) / containerRect.width) * 100,
      y: ((targetRect.top - containerRect.top) / containerRect.height) * 100,
      w: (targetRect.width / containerRect.width) * 100,
      h: (targetRect.height / containerRect.height) * 100,
    });
  }, [spotlightElementId]);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM measurement requires effect
    measure();
  }, [measure, elements]);

  const active = !!spotlightElementId && !!spotlightOptions && !!rect;
  const dimness = spotlightOptions?.dimness ?? 0.7;
  const overlayOpacity = Math.min(dimness * 0.45, 0.38);

  const holeLeft = rect ? rect.x - 1.5 : 0;
  const holeTop = rect ? rect.y - 1.5 : 0;
  const holeWidth = rect ? rect.w + 3 : 0;
  const holeHeight = rect ? rect.h + 3 : 0;
  const haloLeft = rect ? rect.x - 4 : 0;
  const haloTop = rect ? rect.y - 4 : 0;
  const haloWidth = rect ? rect.w + 8 : 0;
  const haloHeight = rect ? rect.h + 8 : 0;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[100] pointer-events-none overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {active && rect && (
          <motion.div
            key={`spotlight-${spotlightElementId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0"
            >
              <defs>
                <mask id={`mask-${spotlightElementId}`}>
                  <rect x="0" y="0" width="100" height="100" fill="white" />
                  <filter
                    id={`spotlight-hole-soft-${spotlightElementId}`}
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                  >
                    <feGaussianBlur stdDeviation="1.8" />
                  </filter>
                  <motion.rect
                    fill="black"
                    filter={`url(#spotlight-hole-soft-${spotlightElementId})`}
                    initial={{
                      x: holeLeft,
                      y: holeTop,
                      width: holeWidth,
                      height: holeHeight,
                      rx: 1.2,
                    }}
                    animate={{
                      x: holeLeft,
                      y: holeTop,
                      width: holeWidth,
                      height: holeHeight,
                      rx: 1.2,
                    }}
                    transition={{
                      duration: 0.6,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                </mask>

                <filter
                  id={`spotlight-glow-${spotlightElementId}`}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feGaussianBlur stdDeviation="1.2" />
                </filter>
              </defs>

              {/* Softer dim layer outside the spotlight */}
              <rect
                width="100"
                height="100"
                fill={`rgba(0,0,0,${overlayOpacity})`}
                mask={`url(#mask-${spotlightElementId})`}
              />

              {/* Subtle center wash to mimic stage light */}
              <motion.rect
                initial={{
                  x: rect.x - 1,
                  y: rect.y - 1,
                  width: rect.w + 2,
                  height: rect.h + 2,
                  opacity: 0,
                  rx: 1,
                }}
                animate={{
                  x: rect.x - 0.2,
                  y: rect.y - 0.2,
                  width: rect.w + 0.4,
                  height: rect.h + 0.4,
                  opacity: 1,
                  rx: 1,
                }}
                fill="rgba(255,255,255,0.06)"
                transition={{
                  duration: 0.45,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />

              {/* Subtle inner rim for definition */}
              <motion.rect
                initial={{
                  x: haloLeft,
                  y: haloTop,
                  width: haloWidth,
                  height: haloHeight,
                  opacity: 0,
                  rx: 2,
                }}
                animate={{
                  x: rect.x - 0.6,
                  y: rect.y - 0.6,
                  width: rect.w + 1.2,
                  height: rect.h + 1.2,
                  opacity: 1,
                  rx: 1,
                }}
                fill="none"
                stroke="rgba(255,255,255,0.88)"
                strokeWidth="1.1"
                filter={`url(#spotlight-glow-${spotlightElementId})`}
                style={{ vectorEffect: 'non-scaling-stroke' } as React.CSSProperties}
                transition={{
                  duration: 0.5,
                  delay: 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />

              {/* Outer halo */}
              <motion.rect
                initial={{
                  x: rect.x - 7,
                  y: rect.y - 7,
                  width: rect.w + 14,
                  height: rect.h + 14,
                  opacity: 0,
                  rx: 3,
                }}
                animate={{
                  x: rect.x - 4,
                  y: rect.y - 4,
                  width: rect.w + 8,
                  height: rect.h + 8,
                  opacity: 1,
                  rx: 2,
                }}
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="1.8"
                filter={`url(#spotlight-glow-${spotlightElementId})`}
                style={{ vectorEffect: 'non-scaling-stroke' } as React.CSSProperties}
                transition={{
                  duration: 0.5,
                  delay: 0.03,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
