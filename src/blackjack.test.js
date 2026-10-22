import test from 'node:test';
import assert from 'node:assert/strict';
import {cardValue,scoreHand,createDeck,shuffleDeck,dealerShouldHit,compareHands,startGame,dealRound,hit,stand,doubleDown,splitHand,resolvePayout} from './blackjack.js';
const hand=(...ranks)=>ranks.map(rank=>({rank,suit:'spades'}));
test('all rank values and invalid cards',()=>{assert.deepEqual(['2','10','J','Q','K','A'].map(cardValue),[2,10,10,10,10,11]);assert.throws(()=>cardValue('11'));});
test('aces adjust individually, including multiple aces',()=>{assert.equal(scoreHand(hand('A','6')).total,17);assert.equal(scoreHand(hand('A','6','9')).total,16);assert.equal(scoreHand(hand('A','A','9')).total,21);assert.equal(scoreHand(hand('A','A','9','K')).total,21);assert.equal(scoreHand(hand('A','A','9','K')).soft,false);});
test('natural blackjack is distinct from other 21',()=>{assert.equal(scoreHand(hand('A','K')).blackjack,true);assert.equal(scoreHand(hand('7','7','7')).blackjack,false);assert.equal(compareHands(hand('A','K'),hand('7','7','7')),'player');assert.equal(compareHands(hand('7','7','7'),hand('A','K')),'dealer');});
test('bust, dealer bust, tie and both blackjack',()=>{assert.equal(compareHands(hand('K','Q','5'),hand('10','8')),'dealer');assert.equal(compareHands(hand('10','8'),hand('K','Q','5')),'player');assert.equal(compareHands(hand('10','8'),hand('9','9')),'push');assert.equal(compareHands(hand('A','K'),hand('A','Q')),'push');assert.equal(compareHands(hand('10','9'),hand('10','8')),'player');});
test('deck has 52 unique cards; shuffle preserves input',()=>{const deck=createDeck(),before=JSON.stringify(deck),mixed=shuffleDeck(deck,()=>0);assert.equal(new Set(mixed.map(c=>c.id)).size,52);assert.equal(JSON.stringify(deck),before);assert.notDeepEqual(mixed,deck);});
test('start resets cards and result; deal uses four unique cards',()=>{const game=startGame();assert.deepEqual(game.player,[]);assert.equal(game.phase,'ready');assert.equal(game.result,null);const dealt=dealRound(game);assert.equal(dealt.deck.length,48);assert.equal(game.deck.length,52);assert.equal(new Set([...dealt.player,...dealt.dealer].map(c=>c.id)).size,4);assert.throws(()=>dealRound(dealt));});
test('dealer stands on soft and hard 17',()=>{assert.equal(dealerShouldHit(hand('A','6')),false);assert.equal(dealerShouldHit(hand('10','7')),false);assert.equal(dealerShouldHit(hand('10','6')),true);});
test('hit bust ends round and finished game rejects further play',()=>{const g={deck:hand('K'),player:hand('10','8'),dealer:hand('9','7'),phase:'player',result:null};const end=hit(g);assert.equal(end.phase,'finished');assert.equal(end.result,'dealer');assert.strictEqual(hit(end),end);assert.strictEqual(stand(end),end);assert.equal(g.player.length,2);});
test('dealer draws to 17 and comparison resolves',()=>{const g={deck:hand('3'),player:hand('10','8'),dealer:hand('10','4'),phase:'player',result:null};const end=stand(g);assert.equal(scoreHand(end.dealer).total,17);assert.equal(end.result,'player');assert.equal(g.dealer.length,2);});
test('initial natural ends round immediately',()=>{const g={...startGame(),deck:hand('9','K','8','A')};const end=dealRound(g);assert.equal(end.phase,'finished');assert.equal(end.result,'player');});


test('double down will double, draw a card and end players turn', ()=>{
const g = { ...startGame(100), deck: hand('5'), hands: [{ cards: hand('5','6'), bet: 10 }], player: hand('5','6'), dealer: hand('10','7'), phase: 'player', activeHandIndex: 0 };
const res = doubleDown(g);
assert.equal(res.hands[0].cards.length, 3);
assert.equal(res.hands[0].bet, 20);
assert.equal(res.money, 90);
assert.equal(res.phase, 'finished');

});

test('split hand will create two hands and draw a card for each', ()=>{
const g = { ...startGame(100), deck: hand('2','3'), hands: [{ cards: hand('8','8'), bet: 10 }], player: hand('8','8'), dealer: hand('10','7'), phase: 'player', activeHandIndex: 0 };
const res = splitHand(g);
assert.equal(res.hands.length, 2);
assert.equal(res.hands[0].cards.length, 2);
assert.equal(res.hands[1].cards.length, 2);
assert.equal(res.hands[0].bet, 10);
assert.equal(res.hands[1].bet, 10);
assert.equal(res.money, 90);
});