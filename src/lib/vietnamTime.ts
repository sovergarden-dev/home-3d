import { vietnamDateTime } from "@/atmosphere/clock";

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  weekday: "short",
});
export function vietnamTime(date = new Date()) {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    minutes: vietnamDateTime(date).minutes,
    weekday: weekdays.indexOf(formatter.format(date)),
  };
}
