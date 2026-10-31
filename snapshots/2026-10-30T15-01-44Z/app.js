const pageSize = 100;
let rows = [];
let page = 0;
let sortDirection = 0;
let sortField = "daily_trend_days";
const ticker = document.querySelector("#ticker");
const typeOptions = document.querySelector("#type-options");
const statuses = [...document.querySelectorAll('[name="status"]')];
const weeklyStatuses = [...document.querySelectorAll('[name="weekly-status"]')];
const metadataFilters = [...document.querySelectorAll(".metadata-filter")];
const extraInfo = document.querySelector("#extra-info");
const resetFilters = document.querySelector("#reset-filters");
const percentages = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

function formatTrend(label, change) {
  return change == null ? label : `${label} (${formatPercentage(change)})`;
}

function formatPercentage(value) {
  return `${percentages.format(value)}%`;
}

const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const dailyRates = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const statisticColumns = ["daily", "weekly"].flatMap(timeframe => [
  [`${timeframe}_mean_return_pct`, formatPercentage, true],
  [`${timeframe}_last_return_pct`, formatPercentage],
  [`${timeframe}_trade_count`, numbers.format],
  [`${timeframe}_mean_holding_days`, numbers.format],
  [`${timeframe}_return_pct_per_day`, value => `${dailyRates.format(value)}%`],
]);
const states = {
  2: ["Up", "up", "Uptrend"],
  1: ["Up", "up-warning", "Uptrend warning"],
  0: ["Neutral", "neutral", "Neutral"],
  "-1": ["Down", "down-warning", "Downtrend warning"],
  "-2": ["Down", "down", "Downtrend"],
};
const tickerTypes = {
  Stock: "Common stock (all origins and share classes)",
  Pref: "Preferred stock (including closed-end fund preferred shares)",
  ETF: "Exchange Traded Fund",
  ETN: "Exchange Traded Note",
  CEF: "Closed End Fund",
  ETD: "Exchange Traded Debt",
  IDX: "Index",
};

// Sharadar's ticker field descriptions: https://sharadar.com/prices
const sizeRanges = [
  "Nano: <$50M",
  "Micro: $50M–$300M",
  "Small: $300M–$2B",
  "Mid: $2B–$10B",
  "Large: $10B–$200B",
  "Mega: ≥$200B",
].join("\n");

for (const heading of document.querySelectorAll("[data-size-info]")) {
  heading.title = sizeRanges;
}

function tickerTypeLabel(code) {
  return tickerTypes[code] ? `${code}: ${tickerTypes[code]}` : code || "Unknown";
}

function groupTickerType(category) {
  if (category?.includes("Common Stock")) return "Stock";
  if (category?.includes("Preferred")) return "Pref";
  return category === "UNIT" ? "Unit" : category ?? "";
}

function compileTickerPattern(query) {
  const parts = query.split(/\*+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join(".*")}$`, "i");
}

function matchesNumericRange(value, from, to) {
  if (from == null && to == null) return true;
  return value != null && Number.isFinite(value) &&
    (from == null || value >= from) && (to == null || value <= to);
}

const rangeFilters = [...document.querySelectorAll("[data-range]")].map(container => {
  const inputs = ["From", "To"].map(bound => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.placeholder = bound;
    input.setAttribute("aria-label", `${container.dataset.label} ${bound.toLowerCase()}`);
    container.append(input);
    return input;
  });
  const error = document.createElement("span");
  error.className = "range-error";
  error.id = `${container.dataset.range}-error`;
  error.textContent = "From exceeds To";
  error.hidden = true;
  container.append(error);
  inputs.forEach(input => input.setAttribute("aria-describedby", error.id));
  return { field: container.dataset.range, inputs, error };
});

function checkboxFilterGroups() {
  const types = [...typeOptions.querySelectorAll("input")];
  const trendNames = { 1: "up", 0: "neutral", "-1": "down" };
  return [
    ["types", types, types.map(input => input.value || "Unknown"), true],
    ["daily_trend", statuses, statuses.map(input => trendNames[input.value]), true],
    ["weekly_trend", weeklyStatuses, weeklyStatuses.map(input => trendNames[input.value]), true],
    ...metadataFilters.map(menu => {
      const inputs = [...menu.querySelectorAll("input")];
      return [menu.dataset.field, inputs, inputs.map(input => input.value || "Unknown"), true, true];
    }),
  ];
}

function restoreURL(params = new URL(location.href).searchParams) {
  ticker.value = params.get("ticker") || "";
  extraInfo.checked = params.get("extra_info") === "1";

  for (const [name, inputs, values, defaultAll, repeated] of checkboxFilterGroups()) {
    const requested = repeated
      ? (params.has(name) ? params.getAll(name) : undefined)
      : params.get(name)?.split(",");
    const selected = requested?.map(value => value.trim().toLowerCase());
    inputs.forEach((input, index) => {
      input.checked = selected ? selected.includes(values[index].toLowerCase()) : defaultAll;
    });
  }

  for (const { field, inputs } of rangeFilters) {
    inputs.forEach((input, index) => { input.value = params.get(`${field}_${index === 0 ? "from" : "to"}`) || ""; });
  }

  const requestedSort = params.get("sort");
  sortField = sortButtons.some(button => button.dataset.sort === requestedSort) ? requestedSort : "daily_trend_days";
  sortDirection = requestedSort === sortField ? (params.get("order") === "desc" ? -1 : 1) : 0;
  updateSortIndicators();
  page = 0;
}

function filterURL() {
  const url = new URL(location.href);
  const params = url.searchParams;
  params.delete("emas");
  if (extraInfo.checked) params.set("extra_info", "1");
  else params.delete("extra_info");

  if (ticker.value) params.set("ticker", ticker.value);
  else params.delete("ticker");

  for (const [name, inputs, values, defaultAll, repeated] of checkboxFilterGroups()) {
    const selected = values.filter((value, index) => inputs[index].checked);

    if (repeated) {
      params.delete(name);
      if (selected.length !== inputs.length) {
        for (const value of selected.length ? selected : [""]) params.append(name, value);
      }
      continue;
    }

    if (selected.length === (defaultAll ? inputs.length : 0)) params.delete(name);
    else params.set(name, selected.join(","));
  }

  for (const { field, inputs } of rangeFilters) {
    inputs.forEach((input, index) => {
      const name = `${field}_${index === 0 ? "from" : "to"}`;

      if (input.value) params.set(name, input.value);
      else params.delete(name);
    });
  }

  if (sortDirection) {
    params.set("sort", sortField);
    params.set("order", sortDirection === 1 ? "asc" : "desc");
  } else {
    params.delete("sort");
    params.delete("order");
  }

  return url;
}

function updateSortIndicators() {
  const [order, arrow] = sortDirection === 1 ? ["ascending", "↑"] : ["descending", "↓"];

  for (const button of sortButtons) {
    const active = sortDirection !== 0 && sortField === button.dataset.sort;
    button.closest("th").setAttribute("aria-sort", active ? order : "none");
    button.querySelector(".sort-order").textContent = active ? arrow : "↕";
  }
}

function render() {
  document.querySelector("#prices-table").classList.toggle("hide-extra-info", !extraInfo.checked);
  const queries = ticker.value.split(/[,\s]+/).filter(Boolean).map(compileTickerPattern);
  const types = [...typeOptions.querySelectorAll("input")];
  const selectedTypes = types.filter(input => input.checked).map(input => input.value);
  const typeSummary = document.querySelector("#type-filter summary");
  typeSummary.textContent = selectedTypes.length === 0 ? "None" : selectedTypes.length === types.length ? "All" : `${selectedTypes.length}/${types.length}`;
  typeSummary.setAttribute("aria-label", `Type: ${typeSummary.textContent}`);
  const selected = statuses.filter(input => input.checked).map(input => Number(input.value));
  const weeklySelected = weeklyStatuses.filter(input => input.checked).map(input => Number(input.value));
  const metadataSelections = metadataFilters.map(menu => {
    const inputs = [...menu.querySelectorAll("input")];
    const selected = inputs.filter(input => input.checked).map(input => input.value);
    const summary = menu.querySelector("summary");
    summary.textContent = selected.length === inputs.length ? "All" : selected.length ? `${selected.length}/${inputs.length}` : "None";
    summary.setAttribute("aria-label", `${menu.dataset.label}: ${summary.textContent}`);
    summary.title = selected.length === inputs.length ? "All" : selected.map(value => value || "Unknown").join(", ") || "None";
    return { field: menu.dataset.field, selected };
  });
  const ranges = rangeFilters.map(({ field, inputs, error }) => {
    const [from, to] = inputs.map(input => input.value === "" && !input.validity.badInput ? null : input.valueAsNumber);
    const reversed = from != null && to != null && from > to;
    error.hidden = !reversed;
    inputs.forEach(input => input.setAttribute("aria-invalid", reversed || !input.validity.valid ? "true" : "false"));
    return { field, from, to };
  });
  const filtered = rows.filter(row =>
    (!queries.length || queries.some(query => query.test(row.ticker))) &&
    selectedTypes.includes(row.displayType) &&
    metadataSelections.every(({ field, selected }) => selected.includes(row[field] || "")) &&
    selected.includes(Math.sign(row.daily_trend)) &&
    (weeklySelected.length === 3 ||
      (row.weekly_trend != null && weeklySelected.includes(Math.sign(row.weekly_trend)))) &&
    ranges.every(({ field, from, to }) => matchesNumericRange(row[field], from, to))
  );

  if (sortDirection) {
    filtered.sort((a, b) => {
      if (a[sortField] == null || b[sortField] == null) {
        return (a[sortField] == null) - (b[sortField] == null) || a.ticker.localeCompare(b.ticker);
      }

      return sortDirection * (a[sortField] - b[sortField]) || a.ticker.localeCompare(b.ticker);
    });
  }

  const pageCount = Math.ceil(filtered.length / pageSize);
  page = Math.min(page, Math.max(0, pageCount - 1));
  const fragment = document.createDocumentFragment();

  for (const row of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
    const tr = document.createElement("tr");
    const [label, className, description] = states[row.daily_trend];
    const [weeklyLabel, weeklyClass, weeklyDescription] = states[row.weekly_trend] ||
      ["—", "", "No completed weekly bar"];

    for (const [index, value] of [
      row.ticker, row.displayType || "—",
      formatTrend(label, row.daily_trend_change_pct),
      formatTrend(weeklyLabel, row.weekly_trend_change_pct),
      row.daily_trend_days, row.weekly_trend_weeks ?? "—",
    ].entries()) {
      const td = document.createElement("td");
      td.textContent = value;

      if (index === 0) {
        const link = document.createElement("a");
        link.href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(row.ticker)}`;
        link.textContent = row.ticker;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = row.name || `View ${row.ticker} on TradingView`;
        td.replaceChildren(link);
      }

      if (index === 1) {
        td.className = "ticker-category";
        td.title = row.type || "Unknown";
      }

      if (index === 0 && row.previousPrice) {
        const warning = document.createElement("button");
        warning.type = "button";
        warning.className = "price-warning";
        warning.textContent = "⚠︎";
        const tooltip = document.createElement("span");
        tooltip.className = "price-tooltip";
        tooltip.setAttribute("role", "tooltip");
        tooltip.textContent = `Price is from the previous trading day (${row.price_date}).`;
        warning.setAttribute("aria-label", tooltip.textContent);
        warning.append(tooltip);
        warning.addEventListener("keydown", event => {
          if (event.key === "Escape") warning.blur();
        });
        td.append(warning);
      }

      if (![0, 1, 2, 3].includes(index)) td.className = "number";
      if (index === 2) {
        td.className = `status ${className}`;
        td.title = description;
        td.setAttribute("aria-label", formatTrend(description, row.daily_trend_change_pct));
      }

      if (index === 3) {
        td.className = `status ${weeklyClass}`;
        td.title = weeklyDescription;
        td.setAttribute("aria-label", formatTrend(weeklyDescription, row.weekly_trend_change_pct));
      }

      if (index === 4 && row.daily_trend_detection_date) {
        td.title = `Trend detected: ${row.daily_trend_detection_date}`;
      }

      if (index === 5 && row.weekly_trend_detection_date) {
        td.title = `Trend detected: ${row.weekly_trend_detection_date}`;
      }

      tr.append(td);
    }

    const typeCell = tr.children[1];
    for (const [field, className] of [
      ["sector", "classification"],
      ["industry", "classification industry"],
      ["scalerevenue", "size-category"],
      ["scalemarketcap", "size-category market-cap"],
    ]) {
      const td = document.createElement("td");
      td.className = `extra-info ${className}`;
      td.textContent = row[field]?.replace(/^\d+ - /, "") || "—";
      td.title = field === "scalerevenue" || field === "scalemarketcap"
        ? sizeRanges
        : row[field] || "Not supplied by Sharadar";
      tr.insertBefore(td, typeCell);
    }

    for (const [field, format, startsGroup] of statisticColumns) {
      const td = document.createElement("td");
      td.className = "number trade-statistic";
      td.textContent = row[field] == null ? "—" : format(row[field]);
      if (startsGroup) td.classList.add("group-start");
      tr.append(td);
    }

    fragment.append(tr);
  }

  if (!filtered.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = (extraInfo.checked ? 10 : 6) + statisticColumns.length;
    td.textContent = "No matching tickers.";
    tr.append(td);
    fragment.append(tr);
  }

  document.querySelector("#rows").replaceChildren(fragment);
  document.querySelector("#count").textContent = `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} tickers`;
  for (const [selector, label, inputs] of [
    ["#status-filter", "Daily", statuses],
    ["#weekly-status-filter", "Weekly", weeklyStatuses],
  ]) {
    const checked = inputs.filter(input => input.checked);
    const summary = document.querySelector(`${selector} summary`);
    summary.textContent = checked.length === 3 ? "All" : checked.length === 0 ? "None" : checked.map(input => input.parentElement.textContent.trim()).join(", ");
    summary.setAttribute("aria-label", `${label} trend: ${summary.textContent}`);
    summary.title = summary.getAttribute("aria-label");
  }
  document.querySelector("#pagination").hidden = pageCount <= 1;
  document.querySelector("#page").textContent = `Page ${page + 1} of ${pageCount}`;
  document.querySelector("#previous").disabled = page === 0;
  document.querySelector("#next").disabled = page + 1 >= pageCount;
  const url = filterURL();

  if (url.href !== location.href) history.replaceState(null, "", url);
}

function filterChanged() {
  page = 0;
  render();
}

ticker.addEventListener("input", filterChanged);
extraInfo.addEventListener("change", render);
typeOptions.addEventListener("change", filterChanged);
metadataFilters.forEach(menu => menu.addEventListener("change", filterChanged));
rangeFilters.forEach(({ inputs }) => inputs.forEach(input => input.addEventListener("input", filterChanged)));
[...statuses, ...weeklyStatuses].forEach(input => input.addEventListener("change", filterChanged));
const sortButtons = [...document.querySelectorAll("[data-sort]")];

for (const button of sortButtons) {
  button.addEventListener("click", () => {
    const field = button.dataset.sort;
    sortDirection = sortField === field && sortDirection === 1 ? -1 : 1;
    sortField = field;
    updateSortIndicators();
    filterChanged();
  });
}
document.querySelector("#previous").addEventListener("click", () => { page--; render(); });
document.querySelector("#next").addEventListener("click", () => { page++; render(); });
document.addEventListener("click", event => {
  for (const dropdown of document.querySelectorAll(".filter-menu")) {
    if (!dropdown.contains(event.target)) dropdown.open = false;
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    document.querySelectorAll(".filter-menu").forEach(dropdown => { dropdown.open = false; });
  }
});
resetFilters.addEventListener("click", () => {
  restoreURL(new URLSearchParams());
  render();
});
window.addEventListener("popstate", () => {
  if (resetFilters.disabled) return;
  restoreURL();
  render();
});

function addFilterSelectionButtons() {
  for (const menu of document.querySelectorAll(".filter-menu")) {
    const fieldset = menu.querySelector("fieldset");
    const actions = document.createElement("div");
    actions.className = "filter-actions";
    for (const [label, checked] of [["Select all", true], ["Deselect all", false]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        fieldset.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = checked; });
        filterChanged();
      });
      actions.append(button);
    }
    fieldset.prepend(actions);
  }
}

function populateCheckboxOptions(container, values, labelFor) {
  const choices = document.createDocumentFragment();
  for (const value of values) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = true;
    label.append(input, document.createTextNode(labelFor(value)));
    choices.append(label);
  }
  container.append(choices);
}

async function load() {
  try {
    const response = await fetch("indicators-daily.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    const latestPriceDate = snapshot.rows.reduce((latest, row) => row.price_date > latest ? row.price_date : latest, "");
    rows = snapshot.rows.map(row => ({
      ...row,
      displayType: groupTickerType(row.type),
      previousPrice: row.price_date < latestPriceDate,
    }));
    const availableTypes = [...new Set(rows.map(row => row.displayType))].sort();
    const typeCodes = document.createDocumentFragment();

    for (const code of availableTypes.filter(Boolean)) {
      const item = document.createElement("li");
      item.textContent = tickerTypeLabel(code);
      typeCodes.append(item);
    }

    document.querySelector("#type-codes").replaceChildren(typeCodes);
    populateCheckboxOptions(typeOptions, availableTypes, tickerTypeLabel);
    for (const menu of metadataFilters) {
      const field = menu.dataset.field;
      const available = [...new Set(rows.map(row => row[field] || ""))].sort();
      populateCheckboxOptions(menu.querySelector("fieldset"), available, value => value || "Unknown");
      if (field === "scalerevenue" || field === "scalemarketcap") {
        for (const input of menu.querySelectorAll("input")) {
          input.parentElement.title = sizeRanges;
        }
      }
    }
    addFilterSelectionButtons();
    document.querySelector("#snapshot").textContent = `Closing Data as of ${snapshot.date}`;
    restoreURL();
    render();
    resetFilters.disabled = false;
  } catch (error) {
    document.querySelector("#snapshot").textContent = `Could not load indicators: ${error.message}. Reload to retry.`;
  }
}

load();
