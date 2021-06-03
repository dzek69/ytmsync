import { createError } from "better-custom-error";

const GetTrackError = createError("GetTrackError");
const CantMatchError = createError("CantMatchError");

export {
    GetTrackError,
    CantMatchError,
};
