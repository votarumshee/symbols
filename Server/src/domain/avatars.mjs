import {records} from "./catalog.mjs";
export const AVATARS=records("avatar").map(r=>[r.key,r.payload.emoji,r.payload.name]);
