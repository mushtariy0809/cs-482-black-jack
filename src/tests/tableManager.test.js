import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SEATS,
  createMultiplayerTable,
  getNextClockwiseSeat,
} from '../tableManager.js';

test('MAX_SEATS constant is exported with value 7', () => {
  assert.equal(MAX_SEATS, 7);
});

test('createMultiplayerTable initializes table with correct defaults', () => {
  const before = Date.now();
  const table = createMultiplayerTable('table-42');
  const after = Date.now();

  assert.equal(table.tableId, 'table-42');
  assert.equal(table.phase, 'waiting');
  assert.equal(table.activeSeatIndex, 0);
  assert.deepEqual(table.dealer, []);
  assert.equal(Array.isArray(table.seats), true);
  assert.equal(table.seats.length, MAX_SEATS);
  assert.deepEqual(table.seats, [null, null, null, null, null, null, null]);
  assert.equal(typeof table.roundId, 'number');
  assert.ok(table.roundId >= before && table.roundId <= after);
});

test('getNextClockwiseSeat returns immediate next playing seat', () => {
  const seats = [
    { phase: 'playing' },
    { phase: 'playing' },
    null,
    null,
    null,
    null,
    null,
  ];

  assert.equal(getNextClockwiseSeat(seats, 0), 1);
});

test('getNextClockwiseSeat skips null seats and non-playing phases', () => {
  const seats = [
    { phase: 'playing' }, // 0 (current)
    null,                 // 1 (empty)
    { phase: 'waiting' }, // 2 (not playing)
    { phase: 'busted' },  // 3 (not playing)
    { phase: 'standing' },// 4 (not playing)
    { phase: 'playing' }, // 5 (next playing)
    null,                 // 6 (empty)
  ];

  assert.equal(getNextClockwiseSeat(seats, 0), 5);
});

test('getNextClockwiseSeat wraps around from end of table to start', () => {
  const seats = [
    null,
    { phase: 'playing' }, // 1 (wraps to here)
    null,
    null,
    null,
    null,
    { phase: 'playing' }, // 6 (current)
  ];

  assert.equal(getNextClockwiseSeat(seats, 6), 1);
});

test('getNextClockwiseSeat returns -1 when all seats are empty (null)', () => {
  const seats = Array(MAX_SEATS).fill(null);
  assert.equal(getNextClockwiseSeat(seats, 0), -1);
  assert.equal(getNextClockwiseSeat(seats, 3), -1);
  assert.equal(getNextClockwiseSeat(seats, 6), -1);
});

test('getNextClockwiseSeat returns -1 when seats exist but none are playing', () => {
  const seats = [
    { phase: 'waiting' },
    { phase: 'busted' },
    { phase: 'standing' },
    { phase: 'finished' },
    null,
    { phase: 'ready' },
    null,
  ];

  assert.equal(getNextClockwiseSeat(seats, 1), -1);
});

test('getNextClockwiseSeat finds self after full loop if only one player is active', () => {
  const seats = [
    null,
    null,
    { phase: 'playing' }, // 2 (current and only player)
    null,
    { phase: 'busted' },
    null,
    null,
  ];

  assert.equal(getNextClockwiseSeat(seats, 2), 2);
});

test('getNextClockwiseSeat works with arbitrary array lengths', () => {
  const threeSeats = [
    null,
    { phase: 'playing' },
    { phase: 'waiting' },
  ];
  assert.equal(getNextClockwiseSeat(threeSeats, 0), 1);
  assert.equal(getNextClockwiseSeat(threeSeats, 1), 1);
  assert.equal(getNextClockwiseSeat(threeSeats, 2), 1);

  const emptySeats = [];
  assert.equal(getNextClockwiseSeat(emptySeats, 0), -1);
});
