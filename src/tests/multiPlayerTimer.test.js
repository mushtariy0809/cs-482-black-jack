import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { useMultiplayerTimer } from '../multiPlayerTimer.js';

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

  function render(tableState, onTimeOut) {
    effects = [];
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = dispatcher;
    const result = useMultiplayerTimer(tableState, onTimeOut);

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

test('initializes with 30 seconds by default', () => {
  const harness = createHookHarness();
  const initial = harness.render({ phase: 'waiting', activeSeatIndex: 0 });
  assert.equal(initial, 30);
  assert.equal(harness.getTimeLeft(), 30);
  harness.unmount();
});

test('ticks down every second during playing phase', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();

  const initial = harness.render({ phase: 'playing', activeSeatIndex: 1 });
  assert.equal(initial, 30);

  // Tick 1 second
  t.mock.timers.tick(1000);
  assert.equal(harness.getTimeLeft(), 29);

  // Re-render with new timeLeft
  const updated = harness.render({ phase: 'playing', activeSeatIndex: 1 });
  assert.equal(updated, 29);

  // Tick another 2 seconds
  t.mock.timers.tick(2000);
  assert.equal(harness.getTimeLeft(), 27);

  harness.unmount();
  t.mock.timers.reset();
});

test('does not tick when tableState is null or undefined', (t) => {
  t.mock.timers.enable();
  const harnessNull = createHookHarness();
  assert.equal(harnessNull.render(null), 30);
  t.mock.timers.tick(3000);
  assert.equal(harnessNull.getTimeLeft(), 30);
  harnessNull.unmount();

  const harnessUndef = createHookHarness();
  assert.equal(harnessUndef.render(undefined), 30);
  t.mock.timers.tick(3000);
  assert.equal(harnessUndef.getTimeLeft(), 30);
  harnessUndef.unmount();

  t.mock.timers.reset();
});

test('does not tick when phase is not "playing"', (t) => {
  t.mock.timers.enable();
  const nonPlayingPhases = ['waiting', 'betting', 'dealing', 'finished', 'paused', ''];

  for (const phase of nonPlayingPhases) {
    const harness = createHookHarness();
    assert.equal(harness.render({ phase, activeSeatIndex: 0 }), 30);
    t.mock.timers.tick(2000);
    assert.equal(harness.getTimeLeft(), 30);
    harness.unmount();
  }

  t.mock.timers.reset();
});

test('resets timeLeft to 30 when activeSeatIndex changes', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();

  harness.render({ phase: 'playing', activeSeatIndex: 0 });
  t.mock.timers.tick(5000);
  assert.equal(harness.getTimeLeft(), 25);

  // Switch to next active seat
  harness.render({ phase: 'playing', activeSeatIndex: 1 });
  assert.equal(harness.getTimeLeft(), 30);

  harness.unmount();
  t.mock.timers.reset();
});

test('resets timeLeft to 30 when phase changes', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();

  harness.render({ phase: 'playing', activeSeatIndex: 0 });
  t.mock.timers.tick(4000);
  assert.equal(harness.getTimeLeft(), 26);

  // Phase transitions to finished
  harness.render({ phase: 'finished', activeSeatIndex: 0 });
  assert.equal(harness.getTimeLeft(), 30);

  harness.unmount();
  t.mock.timers.reset();
});

test('triggers onTimeOut with activeSeatIndex when timeLeft reaches 0', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();
  const timeoutCalls = [];
  const onTimeOut = (seatIndex) => {
    timeoutCalls.push(seatIndex);
  };

  harness.render({ phase: 'playing', activeSeatIndex: 3 }, onTimeOut);
  harness.setTimeLeft(0);

  // Re-render when time reached 0
  harness.render({ phase: 'playing', activeSeatIndex: 3 }, onTimeOut);

  assert.equal(timeoutCalls.length, 1);
  assert.equal(timeoutCalls[0], 3);

  // Advancing timer does not start countdown when timeLeft <= 0
  t.mock.timers.tick(2000);
  assert.equal(harness.getTimeLeft(), 0);

  harness.unmount();
  t.mock.timers.reset();
});

test('triggers onTimeOut when timeLeft is negative', (t) => {
  t.mock.timers.enable();
  const harness = createHookHarness();
  let timedOutSeat = null;

  harness.render({ phase: 'playing', activeSeatIndex: 2 }, (seat) => {
    timedOutSeat = seat;
  });
  harness.setTimeLeft(-1);
  harness.render({ phase: 'playing', activeSeatIndex: 2 }, (seat) => {
    timedOutSeat = seat;
  });

  assert.equal(timedOutSeat, 2);

  harness.unmount();
  t.mock.timers.reset();
});

