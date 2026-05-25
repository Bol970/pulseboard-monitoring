const CALENDAR_URL =
  "https://calendar.google.com/calendar/ical/ru.russian%23holiday%40group.v.calendar.google.com/public/basic.ics";

function unfoldIcalendar(text) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function propertyValue(lines, property) {
  const prefix = `${property}:`;
  const configuredPrefix = `${property};`;
  const line = lines.find(
    (item) => item.startsWith(prefix) || item.startsWith(configuredPrefix),
  );
  return line ? line.slice(line.indexOf(":") + 1) : "";
}

function unescapeText(value) {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function formatIcalDate(value) {
  const compactDate = value.slice(0, 8);
  if (!/^\d{8}$/.test(compactDate)) {
    return null;
  }
  return `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6)}`;
}

function parseEvents(calendarText) {
  const lines = unfoldIcalendar(calendarText);
  const events = [];
  let currentEvent = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = [];
    } else if (line === "END:VEVENT" && currentEvent) {
      const date = formatIcalDate(propertyValue(currentEvent, "DTSTART"));
      const title = unescapeText(propertyValue(currentEvent, "SUMMARY"));
      if (date && title) {
        events.push({ date, title });
      }
      currentEvent = null;
    } else if (currentEvent) {
      currentEvent.push(line);
    }
  }

  return events;
}

module.exports = async function calendarHandler(request, response) {
  try {
    const feedResponse = await fetch(CALENDAR_URL, {
      signal: AbortSignal.timeout(8000),
    });
    if (!feedResponse.ok) {
      throw new Error(`Calendar returned ${feedResponse.status}`);
    }

    const events = parseEvents(await feedResponse.text());
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = events
      .filter((event) => event.date >= today)
      .sort((first, second) => first.date.localeCompare(second.date))
      .slice(0, 3);

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    response.status(200).json({
      source: "Google Calendar / iCalendar",
      calendar: "Праздники России",
      format: "text/calendar (.ics)",
      upcoming,
    });
  } catch (error) {
    response.status(502).json({
      error: "Не удалось загрузить публичный календарь",
    });
  }
};

module.exports.parseEvents = parseEvents;
