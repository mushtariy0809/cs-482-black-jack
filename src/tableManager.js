export const MAX_SEATS = 7;

export function createMultiplayerTable(tableId) {
    return {
        tableId,
        seats: Array(MAX_SEATS).fill(null),
        phase: 'waiting',
        activeSeatIndex: 0,
        dealer: [],
        roundId: Date.now()
    };
}

export function getNextClockwiseSeat(seats, currentIndex){
    let nextIndex = (currentIndex + 1) % seats.length;
    let loops = 0;

    while(loops < seats.length){
        const seat = seats[nextIndex];

        if(seat && seat.phase === 'playing'){
            return nextIndex;
        }   
        nextIndex = (nextIndex + 1) % seats.length;
        loops++;
    }
    return -1;
}