const secondsToTime = (seconds: number) => {
    /* eslint-disable @typescript-eslint/no-magic-numbers */
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return String(min) + ":" + (sec < 10 ? "0" + String(sec) : String(sec));
    /* eslint-enable @typescript-eslint/no-magic-numbers */
};

const removeParentheses = (s: string) => {
    return s.replace(/\([^)]+\)/g, "").replace(/ {2,}/g, " ").trim();
};

const removeThe = (s: string) => {
    return s.replace(/^the /i, "");
};

export {
    secondsToTime,
    removeParentheses,
    removeThe,
};
