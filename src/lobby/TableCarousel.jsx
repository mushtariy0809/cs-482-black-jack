import React, { useEffect, useRef } from 'react';
import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useReducedMotion } from 'framer-motion';
import { StatusBadge, TableIcons, betText, seatText } from './tableInfo.jsx';

const TABLE_IMAGE = '/assets/imgTable.png';
// Slides further than this from the center are not rendered
const VISIBLE_RANGE = 2;
const SWIPE_DISTANCE = 60;

// Where a slide sits, based on how far it is from the active one
function placement(offset, reduceMotion) {
  const distance = Math.abs(offset);
  const side = Math.sign(offset);

  if (reduceMotion) {
    return { x: `${offset * 70}%`, rotateY: 0, z: 0, scale: distance ? 0.82 : 1, opacity: distance ? 0.55 : 1 };
  }
  return {
    x: `${side * (distance === 0 ? 0 : 60 + (distance - 1) * 36)}%`,
    rotateY: side * -Math.min(distance * 34, 50),
    z: -distance * 220,
    scale: 1 - Math.min(distance, 2) * 0.1,
    opacity: distance === 0 ? 1 : distance === 1 ? 0.9 : 0.6
  };
}

const slideSpring = { type: 'spring', stiffness: 140, damping: 22, mass: 0.9 };

export default function TableCarousel({ tables, activeId, onActiveChange, onJoin, joiningId, keyboardEnabled }) {
  const reduceMotion = useReducedMotion();
  const camera = useAnimationControls();
  const dragX = useMotionValue(0);
  const panned = useRef(false);

  const index = Math.max(0, tables.findIndex(t => t.id === activeId));
  const active = tables[index];

  function bump(direction) {
    if (reduceMotion) return;
    camera.start({ x: [0, direction * -16, direction * 6, 0], transition: { duration: 0.35, ease: 'easeOut' } });
  }

  // Move to a slide. No looping: past either end just bumps.
  function go(next) {
    const direction = next > index ? 1 : -1;
    if (next < 0 || next >= tables.length) {
      bump(direction);
      return;
    }
    if (next === index) return;

    onActiveChange(tables[next].id);
    // Slight camera push-in as the table swings to the center
    if (!reduceMotion) {
      camera.start({ scale: [1, 1.03, 1], transition: { duration: 0.6, ease: 'easeOut' } });
    }
  }

  // Keyboard arrows (ignored while typing or when a dialog is open)
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!keyboardEnabled) return undefined;

    function onKey(event) {
      if (event.target.closest?.('input, textarea, select, [role="dialog"], [role="listbox"]')) return;
      if (event.key === 'ArrowLeft') goRef.current(index - 1);
      if (event.key === 'ArrowRight') goRef.current(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboardEnabled, index]);

  if (!active) {
    return (
      <div className="carousel-stage carousel-empty">
        <p>No tables here yet.</p>
      </div>
    );
  }

  const atStart = index === 0;
  const atEnd = index === tables.length - 1;

  return (
    <section className="carousel" aria-roledescription="carousel" aria-label="Tables">
      <button
        className="carousel-arrow carousel-prev"
        aria-label="Previous table"
        aria-disabled={atStart}
        onClick={() => go(index - 1)}
      >
        ‹
      </button>

      <motion.div
        className="carousel-stage"
        onPanStart={() => {
          panned.current = true;
        }}
        onPan={(event, info) => dragX.set(info.offset.x * 0.35)}
        onPanEnd={(event, info) => {
          const swipe = info.offset.x + info.velocity.x * 0.2;
          if (swipe < -SWIPE_DISTANCE) go(index + 1);
          else if (swipe > SWIPE_DISTANCE) go(index - 1);
          animate(dragX, 0, { type: 'spring', stiffness: 300, damping: 30 });
          // Let the click that ends a drag pass without joining or selecting
          setTimeout(() => {
            panned.current = false;
          }, 0);
        }}
      >
        <motion.div className="carousel-camera" animate={camera}>
          <motion.div className="carousel-track" style={{ x: dragX }}>
            <AnimatePresence>
              {tables.map((table, i) => {
                const offset = i - index;
                if (Math.abs(offset) > VISIBLE_RANGE) return null;

                const target = placement(offset, reduceMotion);
                const isActive = offset === 0;
                const joining = joiningId === table.id;
                let position = 'is-active';
                if (offset < 0) position = 'is-side is-left';
                if (offset > 0) position = 'is-side is-right';

                return (
                  <motion.div
                    key={table.id}
                    className={`carousel-slide ${position}`}
                    initial={{ ...target, opacity: 0, scale: target.scale * 0.85 }}
                    animate={target}
                    exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.3 } }}
                    transition={reduceMotion ? { duration: 0.2 } : slideSpring}
                    style={{ zIndex: 10 - Math.abs(offset) }}
                    onClick={() => {
                      if (!isActive && !panned.current) go(i);
                    }}
                    aria-hidden={!isActive}
                  >
                    <img className="slide-felt" src={TABLE_IMAGE} alt="" draggable="false" />
                    <motion.div
                      className="slide-shade"
                      animate={{ opacity: isActive ? 0 : 0.55 }}
                      transition={{ duration: 0.4 }}
                    />

                    {isActive ? (
                      <div className="slide-info">
                        <div className="slide-heading">
                          <h3>{table.name}</h3>
                          <TableIcons table={table} />
                        </div>
                        <p className="slide-meta">
                          <span>{seatText(table)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{betText(table)}</span>
                        </p>
                        <StatusBadge status={table.status} />

                        <button
                          className="primary join-button"
                          disabled={table.status === 'full' || joining}
                          onClick={event => {
                            event.stopPropagation();
                            if (!panned.current) onJoin(table);
                          }}
                        >
                          {table.status === 'full' ? 'Full' : joining ? 'Joining…' : 'Join Table'}
                        </button>
                      </div>
                    ) : (
                      <span className="slide-name">{table.name}</span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </motion.div>

      <button
        className="carousel-arrow carousel-next"
        aria-label="Next table"
        aria-disabled={atEnd}
        onClick={() => go(index + 1)}
      >
        ›
      </button>

      <p className="sr-only" aria-live="polite">
        {`Table ${index + 1} of ${tables.length}: ${active.name}, ${seatText(active)}, ${active.status.replace('_', ' ')}`}
      </p>
    </section>
  );
}
