import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import TableAds from './TableAds.jsx';

// Layout from Figma "Bet"/"Game": the felt table zooms in/out between screens, the ad column on the right never moves.
// Shared by the solo game and multiplayer tables.
export default function TableStage({ tableClassName = 'table game-table', children }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="game-layout">
      <motion.div
        className="game-stage"
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.82 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      >
        <section className={tableClassName} aria-label="Blackjack table">
          {children}
        </section>
      </motion.div>

      <TableAds />
    </div>
  );
}
