import type { SpawnOptions } from "child_process";
import { spawn as run } from "child_process";
import { createError } from "better-custom-error";

interface Events {
    onOut: (s: string) => void;
    onErr: (s: string) => void;
}

const SpawnError = createError("SpawnError");

const spawn = (command: string, args: (string)[], events?: Events, options?: SpawnOptions) => {
    const { onOut, onErr } = events || {};
    return new Promise((resolve, reject) => {
        const cmd = run(command, args, options!);

        let stdOut: string, stdErr: string;

        stdOut = "";
        stdErr = "";

        cmd.stdout!.on("data", (newData: string | Buffer) => {
            onOut?.(String(newData));
            stdOut += String(newData);
        });

        cmd.stderr!.on("data", (newData: string | Buffer) => {
            onErr?.(String(newData));
            stdErr += String(newData);
        });

        cmd.on("close", (code) => {
            if (!code) {
                resolve({ stdOut, stdErr });
                return;
            }

            const error = new SpawnError(`Program exited with code ${code}`, {
                stdOut,
                stdErr,
            });
            reject(error);
        });

        cmd.on("error", () => {
            reject(new Error(`Cant's start program`));
        });
    });
};

export {
    spawn,
};
