import test from 'node:test';
import assert from 'node:assert/strict';
import { dealRound, hit, stand, scoreHand } from '../blackjack.js';
import { startTutorialGame } from './riggedDeck.js';

test('the tutorial hand always plays out as the lesson expects', () => {
  let game = dealRound(startTutorialGame(), 10);
  assert.equal(game.phase, 'player');
  assert.equal(scoreHand(game.player).total, 12);
  assert.equal(game.dealer[0].rank, '10');

  game = hit(game);
  assert.equal(game.phase, 'player');
  assert.equal(scoreHand(game.player).total, 19);

  game = stand(game);
  assert.equal(scoreHand(game.dealer).total, 18);
  assert.equal(game.dealer.length, 3);
  assert.equal(game.result, 'player');
});

test('the tutorial deck is a full, normal deck', () => {
  const { deck } = startTutorialGame();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(c => c.id)).size, 52);
});
