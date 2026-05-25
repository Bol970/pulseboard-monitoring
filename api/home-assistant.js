const HOME_ASSISTANT_URL = "https://ha.bols65.ru";
const ENTITIES = [
  {
    id: "sensor.energy_monitor_in_energy",
    label: "Энергия",
    type: "number",
  },
  {
    id: "sensor.montera_interior_temperature",
    label: "Температура",
    type: "number",
  },
  {
    id: "sensor.sensor_door_in_illuminance",
    label: "Освещенность",
    type: "number",
  },
  {
    id: "binary_sensor.sensor_door_in_contact",
    label: "Входная дверь",
    type: "contact",
  },
];

async function fetchState(entity, token) {
  const response = await fetch(
    `${HOME_ASSISTANT_URL}/api/states/${encodeURIComponent(entity.id)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    throw new Error(`Home Assistant returned ${response.status}`);
  }

  const data = await response.json();
  return {
    id: entity.id,
    label: entity.label,
    type: entity.type,
    state: data.state,
    unit: data.attributes.unit_of_measurement || "",
    updatedAt: data.last_updated,
  };
}

module.exports = async function homeAssistantHandler(request, response) {
  if (request.method && request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!token) {
    return response.status(503).json({
      configured: false,
      error: "Home Assistant token is not configured",
    });
  }

  try {
    const entities = await Promise.all(
      ENTITIES.map((entity) => fetchState(entity, token)),
    );
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({
      source: "Home Assistant REST API",
      configured: true,
      fetchedAt: new Date().toISOString(),
      entities,
    });
  } catch (error) {
    return response.status(502).json({
      configured: true,
      error: "Не удалось получить состояния Home Assistant",
    });
  }
};
