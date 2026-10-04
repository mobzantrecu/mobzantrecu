
import fs from "node:fs/promises";
import path from "node:path";

const INPUT_FILE = path.resolve(
  "output/active-benefits.json"
);

const OUTPUT_FILE = path.resolve(
  "output/index.html"
);

function buildGoogleMapsUrl(brand) {
  const query = `${brand}, CABA, Buenos Aires, Argentina`;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("es-AR");
}

function getImage(benefit) {
  if (
    !Array.isArray(benefit.images) ||
    benefit.images.length === 0
  ) {
    return null;
  }

  return (
    benefit.images.find(
      (image) => image.highlighted
    ) ??
    benefit.images.find(
      (image) => !image.thumb
    ) ??
    benefit.images[0]
  );
}

function getSourceLabel(source) {
  if (source === "santander") {
    return "Santander";
  }

  if (source === "lanacion") {
    return "Club La Nación";
  }

  return source;
}

function getSourceBadgeClass(source) {
  if (source === "santander") {
    return "bg-danger";
  }

  if (source === "lanacion") {
    return "bg-dark";
  }

  return "bg-secondary";
}

function renderDetails(details) {
  if (!Array.isArray(details) || details.length === 0) {
    return "";
  }

  return `
    <div class="benefit-details">
      ${details
        .map(
          (detail) => `
            <div class="small text-secondary mb-1">
              ${escapeHtml(detail)}
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderBenefit(benefit, index) {
  const image = getImage(benefit);

  const imageHtml = image
    ? `
      <img
        src="${escapeHtml(image.url)}"
        class="card-img-top benefit-image"
        alt="${escapeHtml(benefit.brand)}"
        loading="lazy"
        onerror="this.parentElement.classList.add('image-error'); this.remove();"
      >
    `
    : `
      <div class="no-image">
        <div class="no-image-brand">
          ${escapeHtml(benefit.brand)}
        </div>
      </div>
    `;

  const validUntil = formatDate(
    benefit.validUntil
  );

  return `
    <div
      class="col-12 col-sm-6 col-lg-4 col-xl-3 benefit-item"
      data-source="${escapeHtml(benefit.source)}"
      data-search="${escapeHtml(
        `${benefit.brand} ${benefit.readable} ${
          benefit.details?.join(" ") ?? ""
        }`
      ).toLowerCase()}"
    >
      <div class="card h-100 shadow-sm border-0 benefit-card">

        <div class="position-relative">
          ${imageHtml}

          <span
            class="badge ${getSourceBadgeClass(
              benefit.source
            )} position-absolute top-0 end-0 m-2"
          >
            ${escapeHtml(
              getSourceLabel(benefit.source)
            )}
          </span>
        </div>

        <div class="card-body d-flex flex-column">

          <h5 class="card-title fw-bold mb-2">
            ${escapeHtml(benefit.brand)}
          </h5>

          <div class="benefit-readable mb-3">
            ${escapeHtml(benefit.readable)}
          </div>

          ${renderDetails(benefit.details)}

          <a
            href="${buildGoogleMapsUrl(benefit.brand)}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-outline-secondary btn-sm mt-3"
          >
            📍 Ver locales en CABA
          </a>

          ${
            validUntil
              ? `
                <div class="mt-auto pt-3">
                  <small class="text-muted">
                    Vigente hasta ${validUntil}
                  </small>
                </div>
              `
              : ""
          }

        </div>
      </div>
    </div>
  `;
}

function renderCards(benefits) {
  if (benefits.length === 0) {
    return `
      <div class="col-12">
        <div class="alert alert-info">
          No se encontraron beneficios.
        </div>
      </div>
    `;
  }

  return benefits
    .map(renderBenefit)
    .join("\n");
}

function buildHtml(data) {
  const benefits = data.benefits ?? [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>Beneficios</title>

  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
    rel="stylesheet"
  >

  <style>
    body {
      background: #f5f6f8;
    }

    .navbar-brand {
      font-weight: 700;
    }

    .hero {
      background: white;
      border-bottom: 1px solid #e5e7eb;
    }

    .benefit-card {
      border-radius: 14px;
      overflow: hidden;
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease;
    }

    .benefit-card:hover {
      transform: translateY(-3px);
      box-shadow:
        0 10px 25px rgba(0, 0, 0, 0.10) !important;
    }

    .benefit-image {
      width: 100%;
      height: 190px;
      object-fit: cover;
      background: #eee;
    }

    .no-image {
      height: 190px;
      background: linear-gradient(
        135deg,
        #f1f3f5 0%,
        #dee2e6 100%
      );

      display: flex;
      align-items: center;
      justify-content: center;

      padding: 24px;
      text-align: center;
    }

    .no-image-brand {
      font-size: 1.8rem;
      font-weight: 700;
      color: #343a40;
      line-height: 1.15;
      max-width: 90%;
    }

    .benefit-readable {
      font-size: 1.05rem;
      font-weight: 600;
      line-height: 1.35;
    }

    .benefit-details {
      border-top: 1px solid #eee;
      padding-top: 12px;
    }

    .stats {
      font-size: 0.9rem;
    }

    .filter-button.active {
      color: white;
    }

    @media (max-width: 576px) {
      .benefit-image,
      .no-image {
        height: 220px;
      }
    }
  </style>
</head>

<body>

  <nav class="navbar bg-dark navbar-dark">
    <div class="container">
      <span class="navbar-brand">
        Beneficios
      </span>

      <span class="navbar-text">
        ${benefits.length} beneficios
      </span>
    </div>
  </nav>

  <section class="hero py-4">
    <div class="container">

      <div class="row align-items-center g-3">

        <div class="col-lg-6">
          <h1 class="h3 mb-1">
            Beneficios vigentes
          </h1>

          <p class="text-secondary mb-0">
            Santander y Club La Nación
          </p>
        </div>

        <div class="col-lg-6">
          <input
            id="search"
            type="search"
            class="form-control"
            placeholder="Buscar comercio o beneficio..."
          >
        </div>

      </div>

      <div class="d-flex flex-wrap gap-2 mt-3">

        <button
          class="btn btn-dark filter-button active"
          data-filter="all"
        >
          Todos
        </button>

        <button
          class="btn btn-outline-danger filter-button"
          data-filter="santander"
        >
          Santander
        </button>

        <button
          class="btn btn-outline-dark filter-button"
          data-filter="lanacion"
        >
          Club La Nación
        </button>

      </div>

    </div>
  </section>

  <main class="container py-4">

    <div
      class="stats text-secondary mb-3"
      id="results"
    >
      ${benefits.length} resultados
    </div>

    <div
      class="row g-4"
      id="benefits"
    >
      ${renderCards(benefits)}
    </div>

  </main>

  <script>
    const searchInput =
      document.getElementById("search");

    const benefitItems =
      Array.from(
        document.querySelectorAll(".benefit-item")
      );

    const filterButtons =
      Array.from(
        document.querySelectorAll(".filter-button")
      );

    const results =
      document.getElementById("results");

    let currentFilter = "all";

    function updateResults() {
      const search =
        searchInput.value
          .toLowerCase()
          .trim();

      let visible = 0;

      benefitItems.forEach((item) => {
        const matchesSource =
          currentFilter === "all" ||
          item.dataset.source === currentFilter;

        const matchesSearch =
          !search ||
          item.dataset.search.includes(search);

        const visibleItem =
          matchesSource &&
          matchesSearch;

        item.classList.toggle(
          "d-none",
          !visibleItem
        );

        if (visibleItem) {
          visible++;
        }
      });

      results.textContent =
        visible === 1
          ? "1 resultado"
          : visible + " resultados";
    }

    searchInput.addEventListener(
      "input",
      updateResults
    );

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {

        currentFilter =
          button.dataset.filter;

        filterButtons.forEach((item) => {
          item.classList.remove("active");

          if (
            item.dataset.filter ===
            "santander"
          ) {
            item.classList.remove(
              "btn-danger"
            );
            item.classList.add(
              "btn-outline-danger"
            );
          }

          if (
            item.dataset.filter ===
            "lanacion"
          ) {
            item.classList.remove(
              "btn-dark"
            );
            item.classList.add(
              "btn-outline-dark"
            );
          }

          if (
            item.dataset.filter ===
            "all"
          ) {
            item.classList.remove(
              "btn-dark"
            );
            item.classList.add(
              "btn-outline-dark"
            );
          }
        });

        button.classList.add("active");

        if (
          button.dataset.filter ===
          "santander"
        ) {
          button.classList.remove(
            "btn-outline-danger"
          );
          button.classList.add(
            "btn-danger"
          );
        }

        if (
          button.dataset.filter ===
          "lanacion"
        ) {
          button.classList.remove(
            "btn-outline-dark"
          );
          button.classList.add(
            "btn-dark"
          );
        }

        if (
          button.dataset.filter ===
          "all"
        ) {
          button.classList.remove(
            "btn-outline-dark"
          );
          button.classList.add(
            "btn-dark"
          );
        }

        updateResults();
      });
    });
  </script>

</body>
</html>`;
}

async function main() {
  console.log(
    "Leyendo active-benefits.json..."
  );

  const file = await fs.readFile(
    INPUT_FILE,
    "utf8"
  );

  const data = JSON.parse(file);

  const html = buildHtml(data);

  await fs.writeFile(
    OUTPUT_FILE,
    html,
    "utf8"
  );

  console.log(
    `HTML generado: ${OUTPUT_FILE}`
  );
}

main().catch((error) => {
  console.error(
    "Error:",
    error
  );

  process.exit(1);
});
