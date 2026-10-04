
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// ============================================================
// CONFIG
// ============================================================

const CONFIG = {
  outputDir: path.resolve("output"),
  outputFile: path.resolve("output/benefits.json"),

  santander: {
    baseUrl: "https://www.santander.com.ar/bff-benefits",

    brands: {
      categories: "GAS",
      days: "",
      exclusive: "",
      pay_with: "",
      location: "caba",
      limit: 12,
    },
  },

  lanacion: {
    baseUrl: "https://api-clubv2.lanacion.com.ar/v2/accounts",

    params: {
      includeFilters: "true",
      country: "ARGENTINA",
      programs: "1",
      category: "gastronomia",
      sort: "relevance",
      size: 12,
    },
  },

  request: {
    timeoutMs: 15000,
    retries: 3,

    // No dispares cientos de requests simultáneamente.
    concurrency: 5,

    // Pequeña pausa entre requests.
    delayMs: 100,
  },
};

// ============================================================
// HTTP
// ============================================================


const execFileAsync = promisify(execFile);

export async function fetchJsonSantander(
  url,
  {
    timeoutMs = 30000,
    retries = 3,
  } = {}
) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(
        `Santander request ${attempt}/${retries}: ${url}`
      );

      const { stdout } = await execFileAsync(
        "curl",
        [
          "-4",
          "--http1.1",
          "--fail-with-body",
          "--silent",
          "--show-error",
          "--location",
          "--max-time",
          String(Math.ceil(timeoutMs / 1000)),
          "-H",
          "Accept: application/json",
          "-H",
          "User-Agent: Mozilla/5.0",
          url,
        ],
        {
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;

      console.error(
        `Santander request failed (${attempt}/${retries}):`,
        error.message
      );

      if (attempt < retries) {
        const delay = attempt * 3000;

        console.log(
          `Esperando ${delay}ms antes de reintentar...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, delay)
        );
      }
    }
  }

  throw new Error(
    `Santander request failed after ${retries} attempts: ${lastError?.message}`
  );
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(
  url,
  {
    retries = 3,
    timeoutMs = 30000,
  } = {}
) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      console.log(
        `GET ${url} (intento ${attempt}/${retries})`
      );

      const response = await fetch(url, {
        signal: controller.signal,

        headers: {
          "Accept": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
          "Referer": "https://www.santander.com.ar/",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText}`
        );
      }

      return await response.json();

    } catch (error) {
      clearTimeout(timeout);

      lastError = error;

      console.error(
        `Request failed (${attempt}/${retries}):`,
        url
      );

      console.error(
        error instanceof Error
          ? error.message
          : error
      );

      if (attempt < retries) {
        const delay =
          attempt * 3000;

        console.log(
          `Esperando ${delay}ms antes de reintentar...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, delay)
        );
      }
    }
  }

  throw lastError;
}

// ============================================================
// CONCURRENCY
// ============================================================

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        console.error(
          `Error processing item ${index}:`,
          error.message
        );

        results[index] = null;
      }
    }
  }

  const workers = Array.from(
    {
      length: Math.min(concurrency, items.length),
    },
    () => worker()
  );

  await Promise.all(workers);

  return results;
}

// ============================================================
// URL HELPERS
// ============================================================

function buildUrl(baseUrl, params = {}) {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

// ============================================================
// SANTANDER
// ============================================================

async function getSantanderBrands() {
  const url = buildUrl(
    `${CONFIG.santander.baseUrl}/brands`,
    CONFIG.santander.brands
  );

  console.log("\n[SANTANDER]");
  console.log(`Getting brands: ${url}`);

  const response = await fetchJsonSantander(url);

  console.log(
    `Found ${response.items?.length ?? 0} brands`
  );

  return response.items ?? [];
}

async function getSantanderBrandPublications(brandId) {
  const url =
    `${CONFIG.santander.baseUrl}/brands/${brandId}`;

  const response = await fetchJson(url);

  return response.items ?? [];
}

async function getSantanderPublication(
  publicationId,
  brandId
) {
  const url = buildUrl(
    `${CONFIG.santander.baseUrl}/publications/${publicationId}`,
    {
      brandId,
    }
  );

  return await fetchJson(url);
}

function normalizeSantanderBenefit(
  brand,
  publication,
  detail
) {
  return {
    source: "santander",

    sourceIds: {
      brandId: brand.id,

      publicationId:
        detail.id ??
        publication.id,
    },

    brand: {
      id: brand.id,
      name: brand.name,
    },

    benefit: {
      type:
        detail.benefitType?.description ??
        null,

      typeCode:
        detail.benefitType?.code ??
        null,

      discount:
        detail.customerDiscount ??
        null,

      title:
        detail.texts?.title ??
        null,

      description:
        detail.texts?.description ??
        null,

      topAmount:
        detail.topAmount ??
        null,

      startDate:
        detail.initialDate ??
        publication.startDatePublication ??
        null,

      endDate:
        detail.endDate ??
        publication.endDatePublication ??
        null,

      paymentType:
        detail.paymentType?.description ??
        publication.paymentType?.description ??
        null,

      frequency:
        detail.frecuency?.description ??
        publication.frecuency?.description ??
        null,

      tag:
        detail.tag?.description ??
        publication.tag?.description ??
        null,
    },

    conditions: {
      additionalText:
        detail.additionalText ??
        publication.additionalText ??
        null,

      specialCondition:
        detail.specialCondition ??
        publication.specialCondition ??
        null,

      legal:
        detail.legal ??
        publication.legal ??
        null,
    },

    cards:
      detail.cards ??
      [],

    categories:
      detail.categories ??
      [],

    schedule: {
      monday:
        detail.monday ??
        publication.monday ??
        false,

      tuesday:
        detail.tuesday ??
        publication.tuesday ??
        false,

      wednesday:
        detail.wednesday ??
        publication.wednesday ??
        false,

      thursday:
        detail.thursday ??
        publication.thursday ??
        false,

      friday:
        detail.friday ??
        publication.friday ??
        false,

      saturday:
        detail.saturday ??
        publication.saturday ??
        false,

      sunday:
        detail.sunday ??
        publication.sunday ??
        false,

      fullWeek:
        detail.fullWeek ??
        publication.fullWeek ??
        false,
    }
    
  };
}

async function collectSantander() {
  const brands =
    await getSantanderBrands();

  /*
   * Primero obtenemos las publicaciones
   * de cada marca.
   *
   * Ejemplo:
   *
   * brand 60
   *   -> publication 7558
   *   -> publication 7557
   */

  console.log(
    `Getting publications for ${brands.length} brands...`
  );

  const brandPublicationResults =
    await mapWithConcurrency(
      brands,
      CONFIG.request.concurrency,

      async (brand) => {
        await sleep(
          CONFIG.request.delayMs
        );

        try {
          const publications =
            await getSantanderBrandPublications(
              brand.id
            );

          return {
            brand,
            publications,
          };
        } catch (error) {
          console.error(
            `Santander brand ${brand.id} (${brand.name}) failed:`,
            error.message
          );

          return {
            brand,
            publications: [],
          };
        }
      }
    );

  const publicationJobs = [];

  for (
    const result of brandPublicationResults
  ) {
    if (!result) {
      continue;
    }

    for (
      const publication of result.publications
    ) {
      publicationJobs.push({
        brand: result.brand,
        publication,
      });
    }
  }

  console.log(
    `Found ${publicationJobs.length} Santander publications`
  );

  /*
   * Ahora pedimos el detalle de cada publicación.
   */

  const benefits =
    await mapWithConcurrency(
      publicationJobs,
      CONFIG.request.concurrency,

      async ({
        brand,
        publication,
      }) => {
        await sleep(
          CONFIG.request.delayMs
        );

        try {
          const detail =
            await getSantanderPublication(
              publication.id,
              brand.id
            );

          return normalizeSantanderBenefit(
            brand,
            publication,
            detail
          );
        } catch (error) {
          console.error(
            `Santander publication ${publication.id} failed:`,
            error.message
          );

          return null;
        }
      }
    );

  return benefits.filter(Boolean);
}

// ============================================================
// LA NACIÓN
// ============================================================

async function getLaNacionPage(page) {
  const params = {
    ...CONFIG.lanacion.params,
    page,
  };

  const url = buildUrl(
    CONFIG.lanacion.baseUrl,
    params
  );

  return fetchJson(url);
}

async function collectLaNacion() {
  const benefits = [];
  let page = 1;

  while (true) {
    console.log(`La Nación: obteniendo página ${page}...`);

    const response = await getLaNacionPage(page);
    const accounts = response.data ?? [];

    if (accounts.length === 0) {
      console.log(`La Nación: página ${page} vacía. Fin.`);
      break;
    }

    benefits.push(
      ...accounts.map(normalizeLaNacionBenefit)
    );

    console.log(
      `La Nación: página ${page} -> ${accounts.length} resultados`
    );

    page++;
  }

  console.log(
    `La Nación: total recolectado -> ${benefits.length}`
  );

  return benefits;
}

function normalizeLaNacionBenefit(
  account
) {
  const displayBenefit =
    account.displayBenefit ??
    {};

  let discount = null;

  const type =
    displayBenefit.type ??
    null;

  if (type) {
    const percentage =
      type.match(/(\d+)%/);

    if (percentage) {
      discount =
        Number(
          percentage[1]
        );
    }
  }

  return {
    source: "lanacion",

    sourceIds: {
      accountId:
        account.id ??
        null,

      crmId:
        account.crmid ??
        null,

      benefitId:
        displayBenefit.id ??
        null,
    },

    brand: {
      id:
        account.id ??
        null,

      name:
        account.name ??
        null,
    },

    benefit: {
      type,

      discount,

      title:
        type
          ? `${type} de ahorro`
          : null,

      slug:
        account.slug ??
        null,

      ecommerce:
        account.ecommerce ??
        false,

      virtualCard:
        account.virtualCard ??
        false,

      exclusiveBlack:
        account.exclusiveBlack ??
        false,
    },

    images:
      account.images ??
      []
  };
}

// ============================================================
// NORMALIZATION
// ============================================================

function normalizeWhitespace(value) {
  if (
    typeof value !==
    "string"
  ) {
    return value;
  }

  return value
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// DEDUPLICATION
// ============================================================

function deduplicateBenefits(
  benefits
) {
  const map = new Map();

  for (
    const benefit of benefits
  ) {
    const key = [
      benefit.source,

      benefit.sourceIds
        ?.publicationId ??

        benefit.sourceIds
          ?.accountId ??

        benefit.brand
          ?.name,
    ].join(":");

    if (!map.has(key)) {
      map.set(
        key,
        benefit
      );
    }
  }

  return [
    ...map.values(),
  ];
}

// ============================================================
// OUTPUT
// ============================================================

async function saveBenefits(
  benefits
) {
  await fs.mkdir(
    CONFIG.outputDir,
    {
      recursive: true,
    }
  );

  const output = {
    generatedAt:
      new Date().toISOString(),

    sources: {
      santander:
        benefits.filter(
          (b) =>
            b.source ===
            "santander"
        ).length,

      lanacion:
        benefits.filter(
          (b) =>
            b.source ===
            "lanacion"
        ).length,
    },

    total:
      benefits.length,

    benefits,
  };

  await fs.writeFile(
    CONFIG.outputFile,

    JSON.stringify(
      output,
      null,
      2
    ),

    "utf8"
  );

  console.log(
    `\nSaved ${benefits.length} benefits`
  );

  console.log(
    `Output: ${CONFIG.outputFile}`
  );
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(
    "=========================================="
  );

  console.log(
    " Benefits Collector"
  );

  console.log(
    " Santander + Club La Nación"
  );

  console.log(
    "=========================================="
  );

  const start =
    Date.now();

  try {
    const [
      santander,
      lanacion,
    ] =
      await Promise.all([
        collectSantander(),
        collectLaNacion(),
      ]);

    console.log(
      `\nSantander: ${santander.length}`
    );

    console.log(
      `La Nación: ${lanacion.length}`
    );

    const allBenefits =
      deduplicateBenefits([
        ...santander,
        ...lanacion,
      ]);

    await saveBenefits(
      allBenefits
    );

    console.log(
      `\nFinished in ${
        (
          (Date.now() - start) /
          1000
        ).toFixed(2)
      }s`
    );
  } catch (error) {
    console.error(
      "\nFatal error:",
      error
    );

    process.exitCode = 1;
  }
}

main();

