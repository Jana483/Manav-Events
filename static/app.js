"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const list = (items) => (Array.isArray(items) ? items : []).map((x) => `<li>${esc(x)}</li>`).join("");

  const form = $("plan-form");
  const submitBtn = $("submit-btn");
  const statusEl = $("status");
  const errorEl = $("error");
  const results = $("results");

  // Do not allow past dates (local time).
  const now = new Date();
  $("event_date").min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function clearErrors() {
    errorEl.hidden = true;
    errorEl.innerHTML = "";
    form.querySelectorAll("[aria-invalid]").forEach((el) => {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-errormessage");
    });
  }

  function showError(message, details = []) {
    errorEl.innerHTML = `<p>${esc(message)}</p>` + (details.length ? `<ul>${list(details)}</ul>` : "");
    errorEl.hidden = false;
    details.forEach((detail) => {
      const field = $(String(detail).split(" ")[0]);
      if (field && form.contains(field)) {
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-errormessage", "error");
      }
    });
    errorEl.focus();
  }

  function moneyFormatter(currency) {
    try {
      const f = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
      return (n) => f.format(Number(n) || 0);
    } catch {
      return (n) => String(n ?? "");
    }
  }

  function renderBudget(budget, fallbackCurrency) {
    const fmt = moneyFormatter(budget.currency || fallbackCurrency);
    const rows = (budget.categories || []).map((c) => {
      const pct = Math.max(0, Math.min(100, Number(c.percent) || 0));
      return `<tr><th scope="row">${esc(c.category)}</th><td>${esc(fmt(c.amount))}</td>
        <td><meter min="0" max="100" value="${pct}" aria-hidden="true"></meter> ${esc(pct)}%</td>
        <td>${esc(c.notes)}</td></tr>`;
    }).join("");
    $("budget-table").innerHTML =
      `<caption class="visually-hidden">Budget by category</caption>
       <thead><tr><th scope="col">Category</th><th scope="col">Amount</th>
       <th scope="col">Share</th><th scope="col">Saving tips</th></tr></thead>
       <tbody>${rows}</tbody>
       <tfoot><tr><th scope="row">Total</th><td>${esc(fmt(budget.total))}</td><td colspan="2"></td></tr></tfoot>`;
  }

  function renderTimeline(timeline) {
    $("timeline").innerHTML = (timeline || []).map((t) =>
      `<li><strong>${esc(t.when)}</strong>
         ${t.date ? `<time class="muted" datetime="${esc(t.date)}">(${esc(t.date)})</time>` : ""}
         <ul>${list(t.tasks)}</ul></li>`).join("");
  }

  function renderVendors(vendors) {
    $("vendors").innerHTML = (vendors || []).map((v, i) => {
      const checklist = (v.checklist || []).map((item, j) =>
        `<li><input type="checkbox" id="v${i}-${j}"><label for="v${i}-${j}">${esc(item)}</label></li>`).join("");
      return `<article class="vendor">
          <h4>${esc(v.vendor)} <span class="pill">Priority: ${esc(v.priority)}</span></h4>
          <p class="muted">Book by: <time datetime="${esc(v.book_by)}">${esc(v.book_by)}</time></p>
          <ul class="checklist">${checklist}</ul>
          <h5>Questions to ask</h5>
          <ul>${list(v.questions_to_ask)}</ul>
        </article>`;
    }).join("");
  }

  function renderIdeas(ideas) {
    const themes = (ideas.themes || []).map((t) =>
      `<article class="vendor"><h5>${esc(t.name)}</h5><p class="muted">${esc(t.description)}</p></article>`).join("");
    $("ideas").innerHTML =
      `<h4>Themes</h4><div class="grid">${themes}</div>
       <div class="grid">
         <div><h4>Decor</h4><ul>${list(ideas.decor)}</ul></div>
         <div><h4>Activities</h4><ul>${list(ideas.activities)}</ul></div>
         <div><h4>Food</h4><ul>${list(ideas.food)}</ul></div>
       </div>`;
  }

  function render(plan, fallbackCurrency) {
    $("summary").textContent = plan.summary || "";
    renderBudget(plan.budget || {}, fallbackCurrency);
    renderTimeline(plan.timeline);
    renderVendors(plan.vendors);
    renderIdeas(plan.ideas || {});
    $("tips").innerHTML = list(plan.tips);
    results.hidden = false;
    $("results-title").focus();
  }

  form.addEventListener("input", (e) => {
    if (e.target.hasAttribute("aria-invalid")) e.target.removeAttribute("aria-invalid");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    const data = Object.fromEntries(new FormData(form));
    submitBtn.disabled = true;
    form.setAttribute("aria-busy", "true");
    results.hidden = true;
    statusEl.textContent = "Planning your celebration. This can take up to 30 seconds.";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        statusEl.textContent = "";
        showError(payload.error || "Something went wrong. Please try again.", payload.details || []);
        return;
      }
      render(payload, data.currency);
      statusEl.textContent = "Your event plan is ready.";
    } catch (err) {
      statusEl.textContent = "";
      showError(err.name === "AbortError"
        ? "The request took too long. Please try again."
        : "Network error. Please check your connection and try again.");
    } finally {
      clearTimeout(timer);
      submitBtn.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });

  $("print-btn").addEventListener("click", () => window.print());
})();
