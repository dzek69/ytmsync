const secondsToTime = (seconds: number) => {
    /* eslint-disable @typescript-eslint/no-magic-numbers */
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return String(min) + ":" + (sec < 10 ? "0" + String(sec) : String(sec));
    /* eslint-enable @typescript-eslint/no-magic-numbers */
};

// eslint-disable-next-line no-promise-executor-return
const wait = async (time: number) => new Promise(resolve => setTimeout(resolve, time));

export {
    secondsToTime,
    wait,
};
