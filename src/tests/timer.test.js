import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { usePlayerTimer } from '../timer.js';
import { stand } from '../blackjack.js';

/**
 * Lightweight test harness that hooks into React's client dispatcher
 * to simulate hook renders, effects, dependency changes, and unmounting.
 */
function createHookHarness() {
  let stateValue = undefined;
  let stateInitialized = false;
  let effects = [];
  let cleanups = [];
  let prevDepsList = [];

  const dispatcher = {
    useState(initialValue) {
      if (!stateInitialized) {
        stateValue = typeof initialValue === 'function' ? initialValue() : initialValue;
        stateInitialized = true;
      }
      const setState = (updater) => {
        stateValue = typeof updater === 'function' ? updater(stateValue) : updater;
      };
      return [stateValue, setState];
    },
    useEffect(effectFn, deps) {
      effects.push({ effectFn, deps });
    },
  };

  function render(game, setGame) {
    effects = [];
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = dispatcher;
    const result = usePlayerTimer(game, setGame);

    effects.forEach(({ effectFn, deps }, idx) => {
      const prev = prevDepsList[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev[i]);
      if (hasChanged) {
        if (typeof cleanups[idx] === 'function') {
          cleanups[idx]();
          cleanups[idx] = undefined;
        }
        cleanups[idx] = effectFn();
        prevDepsList[idx] = deps;
      }
    });

    return result;
  }

  function setTimeLeft(val) {
    stateValue = typeof val === 'function' ? val(stateValue) : val;
  }

  function unmount() {
    cleanups.forEach((c) => {
      if (typeof c === 'function') c();
    });
    cleanups = [];
    prevDepsList = [];
  }

  return {
    render,
    setTimeLeft,
    unmount,
    getTimeLeft: () => stateValue,
  };
}

test('initializes with 30 seconds default when game is not in player phase', () => {
  const harness = createHookHarness();
  const initial = harness.render({ phase: 'waiting' }, () => {});
  assert.equal(initial, 30);
  assert.equal(harness.getTimeLeft(), 30);
  harness.unmount();
});

test('initializes with 30 seconds default during player phase', () => {
  const harness = createHookHarness();
  const initial = harness.render({ phase: 'player', activeHandIndex: 0 }, () => {});
  assert.equal(initial, 30);
  assert.equal(harness.getTimeLeft(), 30);
  harness.unmount();
});

test('ticks down every second during player phase', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();
  const game = { phase: 'player', activeHandIndex: 0, player: [] };

  const initial = harness.render(game, () => {});
  assert.equal(initial, 30);

  // Tick 1 second
  t.mock.timers.tick(1000);
  assert.equal(harness.getTimeLeft(), 29);

  // Re-render with new timeLeft
  const updated = harness.render(game, () => {});
  assert.equal(updated, 29);

  // Tick another 2 seconds
  t.mock.timers.tick(2000);
  assert.equal(harness.getTimeLeft(), 27);

  harness.unmount();
  t.mock.timers.reset();
});


test('does not tick when game.phase is not "player"', (t) => {
  t.mock.timers.enable();
  const nonPlayerPhases = ['dealer', 'waiting', 'ready', 'finished', 'betting', ''];

  for (const phase of nonPlayerPhases) {
    const harness = createHookHarness();
    assert.equal(harness.render({ phase }, () => {}), 30);
    t.mock.timers.tick(2000);
    assert.equal(harness.getTimeLeft(), 30);
    harness.unmount();
  }

  t.mock.timers.reset();
});


test('resets timeLeft to 30 when activeHandIndex changes', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();

  harness.render({ phase: 'player', activeHandIndex: 0 }, () => {});
  t.mock.timers.tick(4000);
  assert.equal(harness.getTimeLeft(), 26);

  // Active hand switches (e.g., in split hand)
  harness.render({ phase: 'player', activeHandIndex: 1 }, () => {});
  assert.equal(harness.getTimeLeft(), 30);

  harness.unmount();
  t.mock.timers.reset();
});

test('resets timeLeft to 30 when player cards array changes', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();
  const playerCards = [{ rank: '10', suit: 'hearts' }];

  harness.render({ phase: 'player', activeHandIndex: 0, player: playerCards }, () => {});
  t.mock.timers.tick(3000);
  assert.equal(harness.getTimeLeft(), 27);

  // Player hits and receives a new card
  const newPlayerCards = [...playerCards, { rank: '5', suit: 'spades' }];
  harness.render({ phase: 'player', activeHandIndex: 0, player: newPlayerCards }, () => {});
  assert.equal(harness.getTimeLeft(), 30);

  harness.unmount();
  t.mock.timers.reset();
});

const sampleGame = {
  deck: [{ rank: '3', suit: 'spades' }],
  hands: [{ cards: [{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'spades' }], bet: 10 }],
  player: [{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'spades' }],
  dealer: [{ rank: '10', suit: 'hearts' }, { rank: '7', suit: 'hearts' }],
  phase: 'player',
  result: null,
  activeHandIndex: 0,
  money: 100,
};

test('triggers setGame(stand(game)) when timeLeft reaches 0', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();
  const calls = [];
  const setGame = (nextGame) => {
    calls.push(nextGame);
  };
  const game = { ...sampleGame };

  harness.render(game, setGame);
  harness.setTimeLeft(0);

  // Re-render when time reached 0
  harness.render(game, setGame);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], stand(game));

  // Advancing timer does not start countdown when timeLeft <= 0
  t.mock.timers.tick(2000);
  assert.equal(harness.getTimeLeft(), 0);

  harness.unmount();
  t.mock.timers.reset();
});

test('cleans up previous interval when timeLeft updates', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();
  const game = { phase: 'player', activeHandIndex: 0 };

  harness.render(game, () => {});
  t.mock.timers.tick(1000);
  assert.equal(harness.getTimeLeft(), 29);

  // Re-render with new timeLeft triggers cleanup of previous timer
  harness.render(game, () => {});
  t.mock.timers.tick(1000);
  assert.equal(harness.getTimeLeft(), 28);

  harness.unmount();
  t.mock.timers.reset();
});


