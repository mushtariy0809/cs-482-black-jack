import { useState, useEffect } from 'react';

export function useMultiplayerTimer(tableState, onTimeOut) {
    const [timeLeft, setTimeLeft] = useState(30);
    useEffect(() => {
        setTimeLeft(30);
    }, [tableState?.activeSeatIndex, tableState?.phase]);

    useEffect(() => {
        if(!tableState ||tableState?.phase !== 'playing') return;

        if(timeLeft <= 0) {
            if(typeof onTimeOut === 'function') {
                onTimeOut(tableState.activeSeatIndex);
            }
            return;
        }

        const timerId = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timerId);
    }, [timeLeft, tableState?.phase, tableState?.activeSeatIndex]);

    return timeLeft;
}