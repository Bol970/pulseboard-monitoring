const API_URLS = {
  weather:
    "https://api.open-meteo.com/v1/forecast?latitude=55.7522&longitude=37.6156&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe%2FMoscow",
  market:
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true",
  github: "https://api.github.com/repos/vercel/next.js",
};

const WEATHER_LABELS = {
  0: "Ясно",
  1: "Преимущественно ясно",
  2: "Переменная облачность",
  3: "Пасмурно",
  45: "Туман",
  48: "Изморозь и туман",
  51: "Легкая морось",
  53: "Морось",
  55: "Сильная морось",
  61: "Небольшой дождь",
  63: "Дождь",
  65: "Сильный дождь",
  71: "Небольшой снег",
  73: "Снег",
  75: "Сильный снег",
  80: "Ливень",
  81: "Сильный ливень",
  82: "Очень сильный ливень",
  95: "Гроза",
};

const number = new Intl.NumberFormat("ru-RU");
const usd = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const shortTime = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});
const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const refreshButton = document.querySelector("#refresh-button");
const refreshTime = document.querySelector("#refresh-time");

function setStatus(cardId, state, label) {
  const status = document.querySelector(`#${cardId} [data-status]`);
  status.className = `status ${state}`;
  status.textContent = label;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function updateWeather() {
  setStatus("weather-card", "loading", "Загрузка");
  try {
    const data = await fetchJson(API_URLS.weather);
    const current = data.current;

    document.querySelector("#weather-temperature").textContent = Math.round(
      current.temperature_2m,
    );
    document.querySelector("#weather-description").textContent =
      WEATHER_LABELS[current.weather_code] || "Текущие условия";
    document.querySelector("#weather-humidity").textContent =
      `${current.relative_humidity_2m}%`;
    document.querySelector("#weather-wind").textContent =
      `${Math.round(current.wind_speed_10m)} км/ч`;
    document.querySelector("#weather-time").textContent =
      current.time.slice(11, 16);
    setStatus("weather-card", "ready", "Онлайн");
  } catch (error) {
    document.querySelector("#weather-description").textContent =
      "Источник временно недоступен";
    setStatus("weather-card", "error", "Ошибка");
    console.error("Weather request failed:", error);
  }
}

function showChange(elementId, value) {
  const element = document.querySelector(elementId);
  if (typeof value !== "number") {
    element.textContent = "--";
    element.className = "change";
    return;
  }

  const prefix = value >= 0 ? "+" : "";
  element.textContent = `${prefix}${value.toFixed(2)}%`;
  element.className = `change ${value >= 0 ? "positive" : "negative"}`;
}

async function updateMarket() {
  setStatus("market-card", "loading", "Загрузка");
  try {
    const data = await fetchJson(API_URLS.market);
    document.querySelector("#bitcoin-price").textContent = usd.format(
      data.bitcoin.usd,
    );
    document.querySelector("#ethereum-price").textContent = usd.format(
      data.ethereum.usd,
    );
    showChange("#bitcoin-change", data.bitcoin.usd_24h_change);
    showChange("#ethereum-change", data.ethereum.usd_24h_change);

    const updatedAt = data.bitcoin.last_updated_at
      ? new Date(data.bitcoin.last_updated_at * 1000)
      : new Date();
    document.querySelector("#market-time").textContent =
      `Изменение за 24 часа · данные на ${shortTime.format(updatedAt)}`;
    setStatus("market-card", "ready", "Онлайн");
  } catch (error) {
    document.querySelector("#market-time").textContent =
      "Источник временно недоступен";
    setStatus("market-card", "error", "Ошибка");
    console.error("Market request failed:", error);
  }
}

async function updateGithub() {
  setStatus("github-card", "loading", "Загрузка");
  try {
    const data = await fetchJson(API_URLS.github);
    document.querySelector("#github-stars").textContent = number.format(
      data.stargazers_count,
    );
    document.querySelector("#github-forks").textContent = number.format(
      data.forks_count,
    );
    document.querySelector("#github-issues").textContent = number.format(
      data.open_issues_count,
    );
    document.querySelector("#github-updated").textContent =
      `Обновление репозитория: ${dateTime.format(new Date(data.updated_at))}`;
    setStatus("github-card", "ready", "Онлайн");
  } catch (error) {
    document.querySelector("#github-updated").textContent =
      "Источник временно недоступен";
    setStatus("github-card", "error", "Ошибка");
    console.error("GitHub request failed:", error);
  }
}

async function updateDashboard() {
  refreshButton.disabled = true;
  refreshButton.classList.add("is-loading");

  await Promise.allSettled([updateWeather(), updateMarket(), updateGithub()]);

  refreshTime.textContent = `Сегодня, ${shortTime.format(new Date())}`;
  refreshButton.disabled = false;
  refreshButton.classList.remove("is-loading");
}

refreshButton.addEventListener("click", updateDashboard);
updateDashboard();
window.setInterval(updateDashboard, 5 * 60 * 1000);
