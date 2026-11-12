// The parts of the rota's logic that the server needs too (to check and make a swap, and to publish a week). The server cannot import the app's code directly, so this file is bundled into
// functions/services/rotaCore.cjs by `npm run build:rota-core`, and a test (`npm run test:rota-core`) fails if that file is out of date. Change the logic here, then rebuild.
export { DAYS, DAY_LABELS, absentOn, addDays, availabilityOn, mondayOf, shiftById, weekDates } from "./rotaModel.js";
export { checkWeek, setPlace, slotsOfDay } from "./rotaWeek.js";
export { ADJUSTMENT_KINDS, ADJUSTMENT_REASONS, DECLINE_REASONS, adjustmentAbsence, adjustmentText, describeHours, placeLabel, placeMinutes, swapOptions, swapPlaces, weekMinutes } from "./rotaSwap.js";
export { isPublishedCurrent, projectPublished, publishedDays } from "./rotaPublish.js";
