import { readFileSync } from "node:fs";

import { syncCalendarPayload, syncKodikCalendar } from "../modules/calendar/service.js";

const fileIndex = process.argv.indexOf("--file");
const file = fileIndex === -1 ? null : process.argv[fileIndex + 1];
const synchronization = file
  ? syncCalendarPayload(JSON.parse(readFileSync(file, "utf8")) as unknown)
  : syncKodikCalendar();

synchronization
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error: unknown) => {
    console.error("Calendar synchronization failed", error);
    process.exitCode = 1;
  });
