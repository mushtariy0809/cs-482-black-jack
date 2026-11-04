import {useState, useEffect} from 'react';
import { stand } from './blackjack';

export function usePlayerTimer(game, setGame){
const [timeLeft, setTimeLeft] = useState(30);

useEffect(() => {
    if(game?.phase !== 'player'){
        setTimeLeft(30);
        return;
    }
    setTimeLeft(30);
}, [game?.phase, game?.activeHandIndex, game?.player]); 

useEffect(() =>{
    if(game?.phase !== 'player') return;

    if(timeLeft <= 0){
        setGame(stand(game));
        return;
    }

    const timerId = setInterval(() => {
        setTimeLeft(prevTime => prevTime - 1);
}, 1000);

return ()=> clearInterval(timerId);
}, [timeLeft, game?.phase]);

return timeLeft;

}