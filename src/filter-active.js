
import fs from "node:fs/promises";
import path from "node:path";

const INPUT_FILE = path.resolve("output/benefits.json");
const OUTPUT_FILE = path.resolve("output/active-benefits.json");

/**
 * Convierte una fecha a Date de forma segura.
 */
function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Limpia HTML y espacios innecesarios.
 */
function cleanText(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Formatea un número como pesos argentinos.
 */
function formatMoney(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return null;
  }

  return `$${number.toLocaleString("es-AR")}`;
}

/**
 * Determina si un beneficio está vigente en una fecha determinada.
 *
 * Si no tiene fechas, se considera vigente porque no tenemos
 * información suficiente para determinar que está vencido.
 */
function isBenefitActive(benefit, referenceDate) {
  const startDate = parseDate(
    benefit.benefit?.startDate
  );

  const endDate = parseDate(
    benefit.benefit?.endDate
  );

  if (startDate && referenceDate < startDate) {
    return false;
  }

  if (endDate && referenceDate > endDate) {
    return false;
  }

  return true;
}

/**
 * Obtiene el nombre de la marca.
 */
function getBrandName(benefit) {
  return (
    cleanText(benefit.brand?.name) ||
    "Beneficio"
  );
}

/**
 * Obtiene el descuento.
 */
function getDiscount(benefit) {
  const discount = benefit.benefit?.discount;

  if (
    discount === null ||
    discount === undefined
  ) {
    return null;
  }

  const number = Number(discount);

  return Number.isNaN(number)
    ? null
    : number;
}

/**
 * Obtiene las tarjetas disponibles.
 *
 * Ejemplo:
 * ["VISA", "VISA"]
 *
 * Se eliminan duplicados.
 */
function getCards(benefit) {
  if (!Array.isArray(benefit.cards)) {
    return [];
  }

  return [
    ...new Set(
      benefit.cards
        .map((card) =>
          cleanText(card.description)
        )
        .filter(Boolean)
    ),
  ];
}

/**
 * Obtiene los tipos de tarjeta.
 *
 * Ejemplo:
 * ["DEBITO", "CREDITO"]
 */
function getCardTypes(benefit) {
  if (!Array.isArray(benefit.cards)) {
    return [];
  }

  return [
    ...new Set(
      benefit.cards
        .map((card) =>
          cleanText(card.descriptionType)
        )
        .filter(Boolean)
    ),
  ];
}

/**
 * Obtiene las categorías.
 */
function getCategories(benefit) {
  if (!Array.isArray(benefit.categories)) {
    return [];
  }

  return [
    ...new Set(
      benefit.categories
        .map((category) =>
          cleanText(category.description)
        )
        .filter(Boolean)
    ),
  ];
}

/**
 * Convierte el schedule de Santander
 * en una descripción legible.
 */
function getSchedule(benefit) {
  const schedule = benefit.schedule;

  if (!schedule) {
    return null;
  }

  if (schedule.fullWeek) {
    return "Todos los días";
  }

  const days = [
    ["monday", "lunes"],
    ["tuesday", "martes"],
    ["wednesday", "miércoles"],
    ["thursday", "jueves"],
    ["friday", "viernes"],
    ["saturday", "sábado"],
    ["sunday", "domingo"],
  ];

  const activeDays = days
    .filter(([key]) => schedule[key])
    .map(([, label]) => label);

  if (activeDays.length === 0) {
    return null;
  }

  if (activeDays.length === 1) {
    return `Todos los ${activeDays[0]}`;
  }

  return activeDays.join(" y ");
}

/**
 * Construye el texto principal del beneficio.
 *
 * Ejemplos:
 *
 * 20% OFF en Café Martínez con VISA
 * 2x1 en ALBUR
 */
function buildReadableBenefit(benefit) {
  const brand = getBrandName(benefit);

  const type = cleanText(
    benefit.benefit?.type
  );

  const discount = getDiscount(benefit);

  const cards = getCards(benefit);

  if (
    type?.toLowerCase() === "2x1"
  ) {
    let text = `2x1 en ${brand}`;

    if (cards.length > 0) {
      text += ` con ${cards.join(" / ")}`;
    }

    return text;
  }

  if (discount !== null) {
    let text = `${discount}% OFF en ${brand}`;

    if (cards.length > 0) {
      text += ` con ${cards.join(" / ")}`;
    }

    return text;
  }

  if (type) {
    return `${type} en ${brand}`;
  }

  const title = cleanText(
    benefit.benefit?.title
  );

  if (title) {
    return `${title} en ${brand}`;
  }

  return `Beneficio en ${brand}`;
}

/**
 * Construye información secundaria legible.
 */
function buildDetails(benefit) {
  const details = [];

  const paymentType = cleanText(
    benefit.benefit?.paymentType
  );

  const schedule = getSchedule(benefit);

  const topAmount = formatMoney(
    benefit.benefit?.topAmount
  );

  const cardTypes = getCardTypes(benefit);

  const description = cleanText(
    benefit.benefit?.description
  );

  if (paymentType) {
    details.push(
      `Pago: ${paymentType}`
    );
  }

  if (cardTypes.length > 0) {
    details.push(
      `Tarjeta: ${cardTypes.join(" / ")}`
    );
  }

  if (schedule) {
    details.push(schedule);
  }

  if (topAmount) {
    details.push(
      `Tope: ${topAmount}`
    );
  }

  if (description) {
    const normalizedDescription =
      description.toLowerCase();

    if (
      !details.some(
        (detail) =>
          detail.toLowerCase() ===
          normalizedDescription
      )
    ) {
      details.push(description);
    }
  }

  return details;
}

function getImages(benefit) {
  if (!Array.isArray(benefit.images)) {
    return [];
  }

  return benefit.images
    .map((image) => ({
      url: image.url ?? null,
      type: image.type ?? null,
      highlighted: image.highlighted ?? false,
      thumb: image.thumb ?? false,
    }))
    .filter((image) => image.url);
}

function normalizeBenefit(benefit) {
  const startDate =
    benefit.benefit?.startDate ?? null;

  const endDate =
    benefit.benefit?.endDate ?? null;

  return {
    source: benefit.source,

    sourceIds: benefit.sourceIds,

    brand: getBrandName(benefit),

    readable: buildReadableBenefit(
      benefit
    ),

    details: buildDetails(benefit),

    images: getImages(benefit),

    validFrom: startDate,

    validUntil: endDate,
  };
}


async function main() {
  console.log(
    "Leyendo benefits.json..."
  );

  const file = await fs.readFile(
    INPUT_FILE,
    "utf8"
  );

  const data = JSON.parse(file);

  const benefits = data.benefits ?? [];

  /*
   * Evaluamos solamente el día actual,
   * ignorando la hora.
   */
  const now = new Date();

  const referenceDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  console.log(
    `Fecha de evaluación: ${
      referenceDate
        .toISOString()
        .slice(0, 10)
    }`
  );

  console.log(
    `Beneficios originales: ${benefits.length}`
  );

  const activeBenefits = benefits
    .filter((benefit) =>
      isBenefitActive(
        benefit,
        referenceDate
      )
    )
    .map(normalizeBenefit);

  const result = {
    generatedAt:
      new Date().toISOString(),

    referenceDate:
      referenceDate
        .toISOString()
        .slice(0, 10),

    sources: {
      santander:
        activeBenefits.filter(
          (benefit) =>
            benefit.source ===
            "santander"
        ).length,

      lanacion:
        activeBenefits.filter(
          (benefit) =>
            benefit.source ===
            "lanacion"
        ).length,
    },

    total: activeBenefits.length,

    benefits: activeBenefits,
  };

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      result,
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `Beneficios vigentes: ${activeBenefits.length}`
  );

  console.log(
    `Santander: ${result.sources.santander}`
  );

  console.log(
    `La Nación: ${result.sources.lanacion}`
  );

  console.log(
    `Archivo generado: ${OUTPUT_FILE}`
  );
}

main().catch((error) => {
  console.error(
    "Error:",
    error
  );

  process.exit(1);
});
