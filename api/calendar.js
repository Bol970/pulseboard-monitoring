const GOOGLE_CALENDAR_URL =
  "https://calendar.google.com/calendar/ical/ru.russian%23holiday%40group.v.calendar.google.com/public/basic.ics";
const PROFILE_SCHOOL_URL = "https://www.profileschool.ru";
const DASHBOARD_TIME_ZONE = "Europe/Moscow";

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

function parseIcalStart(value) {
  const compactDate = value.slice(0, 8);
  if (!/^\d{8}$/.test(compactDate)) {
    return null;
  }

  const date = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6)}`;
  const timeMatch = value.match(/^\d{8}T(\d{2})(\d{2})(\d{2})?/);
  if (timeMatch && value.endsWith("Z")) {
    const instant = new Date(
      `${date}T${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || "00"}Z`,
    );
    const localParts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: DASHBOARD_TIME_ZONE,
      })
        .formatToParts(instant)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    return {
      date: `${localParts.year}-${localParts.month}-${localParts.day}`,
      time: `${localParts.hour}:${localParts.minute}`,
    };
  }

  return {
    date,
    time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null,
  };
}

function parseEvents(calendarText, source) {
  const lines = unfoldIcalendar(calendarText);
  const events = [];
  let currentEvent = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = [];
    } else if (line === "END:VEVENT" && currentEvent) {
      const start = parseIcalStart(propertyValue(currentEvent, "DTSTART"));
      const title = unescapeText(propertyValue(currentEvent, "SUMMARY"));
      if (start && title) {
        events.push({ ...start, title, source });
      }
      currentEvent = null;
    } else if (currentEvent) {
      currentEvent.push(line);
    }
  }

  return events;
}

function setCookies(response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  return setCookies.map((cookie) => cookie.split(";")[0]);
}

function mergeCookies(...responses) {
  const cookies = new Map();

  for (const response of responses) {
    for (const cookie of setCookies(response)) {
      const separator = cookie.indexOf("=");
      cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
  }

  return [...cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function fetchGoogleEvents() {
  const response = await fetch(GOOGLE_CALENDAR_URL, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Google Calendar returned ${response.status}`);
  }
  return parseEvents(await response.text(), "holiday");
}

async function fetchProfileSchoolEvents(username, password) {
  const loginPage = await fetch(`${PROFILE_SCHOOL_URL}/secure/login`, {
    signal: AbortSignal.timeout(8000),
  });
  const loginHtml = await loginPage.text();
  const csrfToken = loginHtml.match(/name="_token"[^>]*value="([^"]+)"/)?.[1];
  if (!csrfToken) {
    throw new Error("ProfileSchool login token was not found");
  }

  const loginBody = new URLSearchParams({
    _username: username,
    _password: password,
    _target_path: "/my/ics",
    _token: csrfToken,
  });
  const loginResponse = await fetch(`${PROFILE_SCHOOL_URL}/secure/login_check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: mergeCookies(loginPage),
    },
    body: loginBody,
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  const sessionCookie = mergeCookies(loginPage, loginResponse);
  const calendarResponse = await fetch(`${PROFILE_SCHOOL_URL}/my/ics`, {
    headers: { Cookie: sessionCookie },
    signal: AbortSignal.timeout(8000),
  });
  const calendarText = await calendarResponse.text();
  if (!calendarResponse.ok || !calendarText.includes("BEGIN:VCALENDAR")) {
    throw new Error("ProfileSchool calendar authorization failed");
  }
  return parseEvents(calendarText, "school");
}

module.exports = async function calendarHandler(request, response) {
  try {
    const googleEvents = await fetchGoogleEvents();
    const username = process.env.PROFILE_SCHOOL_EMAIL;
    const password = process.env.PROFILE_SCHOOL_PASSWORD;
    const schoolConfigured = Boolean(username && password);
    let schoolConnected = false;
    let schoolEvents = [];

    if (schoolConfigured) {
      try {
        schoolEvents = await fetchProfileSchoolEvents(username, password);
        schoolConnected = true;
      } catch (error) {
        schoolConnected = false;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = [...googleEvents, ...schoolEvents]
      .filter((event) => event.date >= today)
      .sort((first, second) =>
        `${first.date}T${first.time || "00:00"}`.localeCompare(
          `${second.date}T${second.time || "00:00"}`,
        ),
      )
      .slice(0, 5);

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    response.status(200).json({
      source: "iCalendar feeds",
      calendars: ["Праздники России", ...(schoolConnected ? ["ProfileSchool"] : [])],
      format: "text/calendar (.ics)",
      schoolConfigured,
      schoolConnected,
      upcoming,
    });
  } catch (error) {
    response.status(502).json({
      error: "Не удалось загрузить календарь",
    });
  }
};

module.exports.parseEvents = parseEvents;
