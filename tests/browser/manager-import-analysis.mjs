import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Run only against a separately started synthetic, loopback Next server.
// Playwright and its Chromium installation can live outside the repository.
const base = new URL(
  process.env.PROSPECTA_BROWSER_BASE_URL ?? "http://127.0.0.1:3100",
);
assert.equal(base.protocol, "http:");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
assert.equal(base.username + base.password, "");
assert.equal(base.pathname, "/");
assert.equal(base.search + base.hash, "");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/tmp/prospecta-browser-verify/browsers";
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PROSPECTA_PLAYWRIGHT_MODULE_PATH ??
        process.env.PLAYWRIGHT_MODULE_PATH ??
        "/tmp/prospecta-browser-verify/node_modules/playwright/index.mjs",
    ),
  ).href
);

const submittedAt = "2026-10-06T12:00:00.000Z";
const submissionId = "00000000-0000-4000-8000-000000000041";
const historicalSubmissionId = "00000000-0000-4000-8000-000000000042";
const importBatchId = "empresaqui_2026-10-06T12:00:00.000Z";
const csv = "Empresa;Cidade\r\nEmpresa B Sintética;São Paulo\r\nEmpresa C Sintética;São Paulo\r\n";
const secondCsv = csv.replace("Empresa B Sintética", "Nova Empresa B Sintética");
const batch = {
  submissionId,
  import_batch_id: importBatchId,
  status: "SUBMITTED",
  submittedAt,
  acceptedAt: null,
  lastObservedAt: null,
  rowCountAccepted: null,
  terminalCount: null,
  blockedCount: null,
  failedCount: null,
  leadCount: null,
  statusBasis: "SUBMISSION_RECORDED",
  observationStatus: "AVAILABLE",
  observationBasis: null,
  workflowReportedStartedAt: null,
  workflowReportedClosedAt: null,
  workflowReportedRowCount: null,
};
const historicalBatch = {
  ...batch,
  submissionId: historicalSubmissionId,
  import_batch_id: "empresaqui_synthetic_historical",
  submittedAt: "2026-10-05T12:00:00.000Z",
};

function syntheticLead(priority, index) {
  const common = {
    decision_id: `decision-synthetic-manager-${index}`,
    import_batch_id: importBatchId,
    lead_run_id: `lr_${String(index).repeat(64)}`,
    source_row: index + 1,
    source_hash: String(index).repeat(64),
    agent_version: "synthetic-manager-v1",
    cnpj: index === 1 ? "12345678000195" : "22345678000190",
    companyName: `Empresa ${priority} Sintética`,
    city: "São Paulo",
    uf: "SP",
    sector: "Serviços sintéticos",
    score: priority === "B" ? 86 : 95,
    priority,
    recommendedAction: priority === "B" ? "PROSPECTAR" : "NAO_ABORDAR",
    trustStatus: "Revisão Humana",
    confidenceIndicator: "normal",
    lastAnalysisAt: submittedAt,
  };
  return {
    ...common,
    legalName: `${common.companyName} Ltda.`,
    tradeName: null,
    primaryCnae: "6201501",
    primaryCnaeDescription: "Serviços sintéticos",
    companySize: null,
    taxRegime: null,
    estimatedRevenue: null,
    employeeCount: null,
    branchCount: null,
    finalVerdict: "REVISAO_HUMANA",
    recommendedActionReason: priority === "B"
      ? "Revise os sinais antes de definir o próximo passo."
      : "Recomendação sintética: não abordar neste momento.",
    icpScore: 73,
    strategicAssetScore: 64,
    strategicTier: null,
    riskFlags: { status: "available", items: [] },
    positiveSignals: { status: "available", items: [] },
    evidences: { status: "omitted_by_policy", content: null },
    strategicReport: { status: "omitted_by_policy", content: null },
    audit: {
      ...common,
      idempotency_key: null,
      used_cache: false,
      validated_at: submittedAt,
      created_at: submittedAt,
      updated_at: null,
      expires_at: null,
    },
    dataQuality: [],
  };
}

const leads = [syntheticLead("B", 1), syntheticLead("C", 2)];
const workspaceId = "00000000-0000-4000-8000-000000000051";
const organizationId = "synthetic-browser-organization";
const actorSubject = "local-development-user";
const nextAction = "Revisar proposta sintética";
const activitySummary = "Conversa sintética registrada para a apresentação.";
const noteBody = "Contexto sintético: revisar necessidades antes do próximo contato.";

function syntheticWorkspace() {
  return {
    workspace_id: workspaceId,
    organization_id: organizationId,
    cnpj_normalizado: leads[0].cnpj,
    observed_lead_run_id: leads[0].lead_run_id,
    responsible_subject: actorSubject,
    commercial_stage: "CONTACTED",
    next_action: "Revisar empresa sintética",
    next_action_due_at: submittedAt,
    commercial_outcome: null,
    version: 1,
    created_by_subject: actorSubject,
    updated_by_subject: actorSubject,
    created_at: submittedAt,
    updated_at: submittedAt,
    archived_at: null,
    archived_by_subject: null,
  };
}
const checks = [];
const screenshotDirectory = process.env.PROSPECTA_BROWSER_SYNTHETIC_SCREENSHOTS;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
function passed(label) {
  checks.push(label);
  console.log(`PASS ${label}`);
}

async function verifyViewport(viewport) {
  const context = await browser.newContext({
    viewport,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    serviceWorkers: "block",
  });
  const unexpected = [];
  const errors = [];
  let submissions = 0;
  let expectedUpload = null;
  let holdUpload = false;
  let releaseUpload = () => undefined;
  let expectedCsv = csv;
  let processingClosed = false;
  let detailGetUnavailable = false;
  let listGetUnavailable = false;
  let listAccessStatus = null;
  let listReads = 0;
  let queueReads = 0;
  const receivedCompanyRows = [2, 3];
  const processedCompanyRows = [];
  let processedCompanyReads = 0;
  const leadQueries = [];
  let workspace = syntheticWorkspace();
  let expectedCommercialMutation = null;
  const commercialMutations = [];
  const activities = [];
  const notes = [];
  const uploadKeys = new Set();
  await context.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.protocol !== "ws:" || url.host !== base.host || !url.pathname.startsWith("/_next/") || url.username || url.password) {
      unexpected.push("unexpected websocket");
      return socket.close();
    }
    socket.connectToServer();
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base.origin) {
      unexpected.push("external request");
      return route.abort();
    }
    const json = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "Cache-Control": "private, no-store" },
        body: JSON.stringify(data),
      });
    const list = (data) => json({ data, meta: { page: 1, pageSize: 20, total: data.length } });
    const workspacePath = `/api/workspaces/${workspaceId}`;
    if ((request.method() === "PATCH" && url.pathname === workspacePath) ||
      (request.method() === "POST" && ["activities", "notes"].some((kind) => url.pathname === `${workspacePath}/${kind}`))) {
      const kind = url.pathname === workspacePath ? "workspace" : url.pathname.split("/").at(-1);
      if (expectedCommercialMutation !== kind) {
        unexpected.push("unexpected or repeated commercial mutation");
        return route.abort();
      }
      expectedCommercialMutation = null;
      const body = request.postDataJSON();
      assert.equal(body.organization_id, undefined);
      assert.equal(body.actor_subject, undefined);
      commercialMutations.push(kind);
      if (kind === "workspace") {
        assert.equal(body.expected_version, workspace.version);
        assert.equal(body.next_action, nextAction);
        workspace = { ...workspace, ...body, version: workspace.version + 1 };
        delete workspace.expected_version;
        return json({ data: workspace });
      }
      const identity = {
        organization_id: organizationId, workspace_id: workspaceId,
        observed_lead_run_id: leads[0].lead_run_id, created_at: submittedAt,
      };
      if (kind === "activities") {
        assert.equal(body.summary, activitySummary);
        const activity = { ...identity, ...body, activity_id: "synthetic-activity-1", actor_subject: actorSubject };
        activities.push(activity);
        return json({ data: activity }, 201);
      }
      assert.equal(body.body, noteBody);
      const note = { ...identity, ...body, note_id: "synthetic-note-1", author_subject: actorSubject };
      notes.push(note);
      return json({ data: note }, 201);
    }
    if (url.pathname === "/api/imports" && request.method() === "POST") {
      if (expectedUpload === null) {
        unexpected.push("unexpected or repeated import submission");
        return route.abort();
      }
      const outcome = expectedUpload;
      expectedUpload = null;
      const key = request.headers()["idempotency-key"];
      const bytes = request.postDataBuffer();
      const boundaryMatch = request.headers()["content-type"]?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
      const partStart = bytes?.indexOf(Buffer.from("\r\n\r\n")) ?? -1;
      const partEnd = boundary ? bytes?.lastIndexOf(Buffer.from(`\r\n--${boundary}--`)) ?? -1 : -1;
      const fileBytes = partStart >= 0 && partEnd > partStart ? bytes?.subarray(partStart + 4, partEnd) : null;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key ?? "") ||
        !fileBytes?.equals(Buffer.from(expectedCsv)) || uploadKeys.has(key)) {
        unexpected.push("invalid synthetic upload bytes or idempotency key");
        return route.abort();
      }
      uploadKeys.add(key);
      submissions += 1;
      if (holdUpload) await new Promise((resolveUpload) => { releaseUpload = resolveUpload; });
      if (outcome === "malformed") {
        return json({ data: { status: "RECEIVED" } }, 202);
      }
      if (outcome === "unavailable") {
        return json({ error: { code: "SOURCE_UNAVAILABLE", message: "Envio sem confirmação disponível." } }, 503);
      }
      return json({
        data: {
          submissionId,
          appStatus: outcome === "unknown" ? "ACCEPTANCE_UNKNOWN" : "PRODUCER_ACKNOWLEDGED",
          statusFactSource: outcome === "unknown" ? "ingress_unknown" : "workflow_acknowledgement",
          submittedAt,
          producerOutcome: outcome,
          workflowAcknowledgement: outcome === "unknown" ? null : {
            import_batch_id: importBatchId,
            row_count: 2,
            acknowledgedAt: submittedAt,
          },
          durableAcceptance: null,
        },
        meta: { result: "submitted", receivedCompanies: {
          available: true,
          data: receivedCompanyRows.map((source_row) => ({ source_row, receivedAt: submittedAt })),
          page: 1, pageSize: 100, total: receivedCompanyRows.length,
        } },
      }, 202);
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if ([submissionId, historicalSubmissionId].some((id) => url.pathname === `/api/imports/${id}`)) {
      const processedCompaniesPage = url.searchParams.get("processedCompaniesPage");
      if (processedCompaniesPage !== null) {
        assert.equal(url.searchParams.get("pageSize"), "100");
        assert.equal(url.searchParams.get("receivedCompaniesPage"), null);
        processedCompanyReads += 1;
      }
      if (listAccessStatus !== null) return json({ error: { code: "ACCESS_DENIED", message: "Acesso indisponível." } }, listAccessStatus);
      if (detailGetUnavailable) return json({ error: { code: "SOURCE_UNAVAILABLE", message: "Consulta indisponível." } }, 503);
      const historical = url.pathname === `/api/imports/${historicalSubmissionId}`;
      const rows = historical ? [2] : processedCompanyRows;
      return json({ data: {
        ...(historical ? historicalBatch : batch),
        workflowReportedClosedAt: !historical && processingClosed ? "2026-10-06T12:10:00.000Z" : null,
        workflowReportedRowCount: !historical && processingClosed ? 2 : null,
      }, meta: {
        receivedCompanies: {
          available: true,
          data: receivedCompanyRows.map((source_row) => ({ source_row, receivedAt: submittedAt })),
          page: 1, pageSize: 100, total: receivedCompanyRows.length,
        },
        ...(processedCompaniesPage === null ? {} : { processedCompanies: {
          available: true,
          factSource: "producer_current_company_results_v1",
          data: rows.map((source_row) => ({
            source_row,
            processedAt: historical ? "2026-10-05T12:05:00.000Z" : "2026-10-06T12:05:00.000Z",
          })),
          page: Number(processedCompaniesPage), pageSize: 100, total: rows.length,
        } }),
      } });
    }
    if (url.pathname === "/api/imports") {
      listReads += 1;
      if (listAccessStatus !== null) return json({ error: { code: "ACCESS_DENIED", message: "Acesso indisponível." } }, listAccessStatus);
      if (listGetUnavailable) return json({ error: { code: "SOURCE_UNAVAILABLE", message: "Consulta indisponível." } }, 503);
      const page = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
      return json({ data: [submissions === 0 ? historicalBatch : batch], meta: { page, pageSize, total: (page - 1) * pageSize + 1 } });
    }
    if (url.pathname === "/api/work-queue") {
      queueReads += 1;
      unexpected.push("retired pipeline query");
      return route.abort();
    }
    if (url.pathname === workspacePath) return json({ data: workspace });
    if (url.pathname === `${workspacePath}/activities`) return list(activities);
    if (url.pathname === `${workspacePath}/notes`) return list(notes);
    if (url.pathname === `${workspacePath}/qualification-cadence`) {
      return json({ data: { status: "NOT_STARTED", current_contact_number: null, contacts: [] } });
    }
    if (url.pathname === `${workspacePath}/audit`) {
      return list([{
        audit_event_id: "synthetic-audit-1", organization_id: organizationId, workspace_id: workspaceId,
        actor_subject: actorSubject, action: "WORKSPACE_CREATED", target_type: "lead_workspace",
        target_id: workspaceId, observed_lead_run_id: leads[0].lead_run_id,
        previous_metadata: {}, new_metadata: { commercial_stage: "CONTACTED", version: 1 },
        metadata: {}, occurred_at: submittedAt,
      }]);
    }
    if (url.pathname === `/api/leads/${leads[0].cnpj}/approach-message`) {
      return json({ data: { status: "unavailable", message: null } });
    }
    if (url.pathname === "/api/leads/outside-analysis") {
      return json({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    }
    if (url.pathname === "/api/leads") {
      leadQueries.push(url.search);
      const priority = url.searchParams.get("priority");
      const uf = url.searchParams.get("uf");
      const cnpj = url.searchParams.get("cnpj");
      const page = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
      const selected = leads.filter((lead) => (!priority || lead.priority === priority) &&
        (!uf || lead.uf === uf) && (!cnpj || lead.cnpj === cnpj));
      return json({
        data: selected.slice((page - 1) * pageSize, page * pageSize),
        meta: { page, pageSize, total: selected.length, totalPages: Math.ceil(selected.length / pageSize) },
      });
    }
    const historyLead = leads.find((lead) => url.pathname === `/api/leads/${lead.cnpj}/history`);
    if (historyLead) {
      return json({
        data: [{
          decision_id: historyLead.decision_id,
          import_batch_id: historyLead.import_batch_id,
          lead_run_id: historyLead.lead_run_id,
          source_row: historyLead.source_row,
          analyzedAt: submittedAt,
          recommendedAction: historyLead.recommendedAction,
          recommendedActionReason: historyLead.recommendedActionReason,
          isCurrent: true,
        }],
        meta: {
          page: 1, pageSize: 20, total: 1, completeness: "retained_only",
          label: "Análises retidas encontradas",
          caveat: "Análises mais antigas podem não estar presentes.",
        },
      });
    }
    if (leads.some((lead) => url.pathname === `/api/leads/${lead.cnpj}/location-map`)) {
      return json({ data: { status: "unavailable" } });
    }
    const lead = leads.find((item) => url.pathname === `/api/leads/${item.cnpj}`);
    if (lead) return json({ data: lead });
    if (url.pathname.startsWith("/api/")) {
      unexpected.push(`unmocked API ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("dialog", async (dialog) => {
    // Stay on the pending owner when browser history crosses documents.
    // Playwright's automatic handling is not a user's decision to remain.
    if (dialog.type() !== "beforeunload") errors.push(`unexpected ${dialog.type()} dialog`);
    await dialog.dismiss();
  });
  page.setDefaultTimeout(90_000);
  page.on("pageerror", (error) => errors.push(error.message));
  const wait = (locator) => locator.waitFor({ timeout: 90_000 });
  async function waitForFileInput() {
    await wait(page.getByLabel("Arquivo CSV"));
    await page.waitForFunction(() => document.getElementById("arquivo-csv")?.disabled === false);
  }
  async function visibleUploadResult(title) {
    await page.waitForFunction((expectedTitle) => {
      const heading = [...document.querySelectorAll("h2")].find((element) => element.textContent === expectedTitle);
      if (!heading) return false;
      const rectangle = heading.getBoundingClientRect();
      return rectangle.top >= 0 && rectangle.bottom <= innerHeight;
    }, title, { timeout: 10_000 });
    passed(`${viewport.width}px ${title} aparece no viewport após envio`);
  }
  async function noOverflow(label) {
    const size = await page.evaluate(() => ({
      viewport: innerWidth,
      body: document.body.scrollWidth,
      root: document.documentElement.scrollWidth,
    }));
    const screenshotName = {
      "Início sem overflow": `inicio-${viewport.width}.png`,
      "upload e confirmação sem overflow": `imports-${viewport.width}.png`,
      "lista B sem overflow": `leads-${viewport.width}.png`,
      "filtros de empresas pendentes sem overflow": `leads-filtros-pendentes-${viewport.width}.png`,
      "contatos na empresa sem overflow": `contatos-${viewport.width}.png`,
      "acompanhamento comercial sem overflow": `acompanhamento-${viewport.width}.png`,
    }[label];
    if (screenshotDirectory && screenshotName) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: resolve(screenshotDirectory, screenshotName), fullPage: true });
    }
    assert(size.body <= size.viewport && size.root <= size.viewport, label);
    passed(`${viewport.width}px ${label}`);
  }
  async function navigateArea(name) {
    const navigation = page.getByRole("navigation", { name: "Navegação principal" });
    const link = navigation.getByRole("link", { name, exact: true });
    if (!(await link.isVisible())) {
      await navigation.getByRole("button", { name: "Abrir menu de navegação" }).click();
    }
    await link.click();
  }
  const companyNotice = page.getByRole("complementary", { name: "Confirmação de empresa processada" });
  const isProcessedCompaniesResponse = (id) => (response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/imports/${id}` && url.searchParams.has("processedCompaniesPage") && response.status() === 200;
  };
  try {
    const entryResponse = await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await wait(page.getByRole("heading", { name: "Importar e analisar empresas" }));
    assert.equal(new URL(page.url()).pathname, "/inicio");
    const entryHeaders = entryResponse.headers();
    assert.equal(entryHeaders["x-content-type-options"], "nosniff");
    assert.equal(entryHeaders["x-frame-options"], "DENY");
    assert.equal(entryHeaders["referrer-policy"], "no-referrer");
    assert.match(entryHeaders["content-security-policy"], /frame-ancestors 'none'/);
    assert.match(entryHeaders["x-robots-tag"], /noindex/);
    assert.equal(await page.locator("html").getAttribute("lang"), "pt-BR");
    assert.match(await page.title(), /Prospecta/);
    assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
    assert.equal(await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Custos", exact: true }).count(), 0);
    passed(`${viewport.width}px identidade, headers e custos ocultos sem permissão`);
    assert.equal(await page.getByRole("link", { name: "Organizar acompanhamento", exact: true }).count(), 0);
    assert.equal(await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Pipeline de prospecção", exact: true }).count(), 0);
    if (viewport.width < 1024) {
      const navigation = page.getByRole("navigation", { name: "Navegação principal" });
      const menu = navigation.locator("button[aria-controls='private-navigation-links']");
      assert.equal(await menu.getAttribute("aria-expanded"), "false");
      assert.equal(await navigation.getByRole("link", { name: "Leads", exact: true }).isVisible(), false);
      await menu.focus();
      await page.keyboard.press("Enter");
      assert.equal(await menu.getAttribute("aria-expanded"), "true");
      assert(await navigation.getByRole("link", { name: "Leads", exact: true }).isVisible());
      await page.keyboard.press("Enter");
      assert.equal(await menu.getAttribute("aria-expanded"), "false");
      await page.keyboard.press("Enter");
      const currentPage = navigation.getByRole("link", { name: "Início", exact: true });
      await currentPage.focus();
      await page.keyboard.press("Enter");
      assert.equal(await menu.getAttribute("aria-expanded"), "false");
      assert(await menu.evaluate((element) => document.activeElement === element));
      passed(`${viewport.width}px menu compacto abre e fecha com teclado e preserva localização`);
    }
    passed(`${viewport.width}px início orienta importação e análise sem acesso à pipeline removida`);
    await noOverflow("Início sem overflow");
    await page.getByRole("link", { name: "Importar CSV", exact: true }).click();
    await waitForFileInput();
    await Promise.all([
      page.waitForResponse(isProcessedCompaniesResponse(historicalSubmissionId)),
      page.getByRole("link", { name: "Ver importações registradas", exact: true }).click(),
    ]);
    await wait(page.getByRole("table", { name: "Importações registradas" }));
    await page.waitForTimeout(250);
    assert.equal(await companyNotice.isVisible(), false);
    assert.equal(submissions, 0);
    passed(`${viewport.width}px abrir importações existentes registra resultados antigos sem exibir confirmações`);
    await page.getByRole("link", { name: "Importar outro arquivo", exact: true }).click();
    await waitForFileInput();
    for (const invalidFile of [
      { name: "vazio.csv", mimeType: "text/csv", buffer: Buffer.alloc(0), message: "O arquivo está vazio." },
      { name: "lista.txt", mimeType: "text/plain", buffer: Buffer.from(csv), message: "O arquivo precisa estar no formato CSV." },
      { name: "tipo-invalido.csv", mimeType: "application/pdf", buffer: Buffer.from(csv), message: "O tipo do arquivo não é aceito." },
      { name: "grande.csv", mimeType: "text/csv", buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 65), message: "O arquivo ultrapassa o limite" },
    ]) {
      const { message, ...file } = invalidFile;
      await page.getByLabel("Arquivo CSV").setInputFiles(file);
      await wait(page.getByRole("alert").filter({ hasText: message }));
      assert(await page.getByRole("button", { name: "Enviar CSV", exact: true }).isDisabled());
      assert.equal(submissions, 0);
      await page.getByRole("button", { name: "Nova tentativa", exact: true }).click();
      await waitForFileInput();
    }
    passed(`${viewport.width}px arquivo vazio, extensão, tipo e tamanho inválidos recusados antes do POST`);
    await page.getByLabel("Arquivo CSV").setInputFiles({
      name: "empresas-sinteticas.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
    });
    expectedUpload = "acknowledged";
    holdUpload = true;
    await page.getByRole("button", { name: "Enviar CSV", exact: true }).click();
    const uploadNotice = page.getByRole("complementary", { name: "Aviso da importação" });
    await wait(uploadNotice);
    assert.match(await uploadNotice.innerText(), /Enviando importação…/);
    assert.match(await uploadNotice.innerText(), /não cancela o envio/);
    assert(await page.getByLabel("Arquivo CSV").isDisabled());
    assert(await page.getByRole("button", { name: "Enviar CSV", exact: true }).isDisabled());
    await page.getByRole("button", { name: "Enviar CSV", exact: true }).evaluate((button) => {
      button.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const closeNotice = uploadNotice.getByRole("button", { name: "Ocultar aviso", exact: true });
    await closeNotice.focus();
    await page.keyboard.press("Enter");
    await uploadNotice.waitFor({ state: "hidden" });
    const reopenNotice = page.getByRole("button", { name: "Reabrir aviso", exact: true });
    await wait(reopenNotice);
    assert(await reopenNotice.evaluate((button) => document.activeElement === button));
    assert(await page.getByText("Enviando CSV...", { exact: true }).isVisible());
    await page.keyboard.press("Enter");
    await wait(uploadNotice);
    assert(await closeNotice.evaluate((button) => document.activeElement === button));
    await page.getByRole("link", { name: "Ver importações registradas", exact: true }).click();
    assert.equal(new URL(page.url()).pathname, "/imports");
    await wait(page.getByRole("alert").filter({ hasText: "Aguarde o retorno antes de sair" }));
    await page.evaluate(() => { window.history.back(); });
    // A browser traversal is asynchronous; inspect the settled owner, including
    // a native beforeunload refusal when the prior entry belongs to another document.
    await page.waitForTimeout(250);
    assert.equal(new URL(page.url()).pathname, "/imports");
    await uploadNotice.getByRole("button", { name: "Ocultar aviso", exact: true }).click();
    await uploadNotice.waitFor({ state: "hidden" });
    holdUpload = false;
    releaseUpload();
    await wait(page.getByRole("link", { name: "Acompanhar importação", exact: true }));
    assert(await uploadNotice.isVisible() || await page.getByRole("heading", { name: "Envio recebido", exact: true }).isVisible());
    await visibleUploadResult("Envio recebido");
    assert.equal(submissions, 1);
    assert.equal(await companyNotice.isVisible(), false);
    passed(`${viewport.width}px envio CSV exato com chave única e POST mockado`);
    passed(`${viewport.width}px ocultar/reabrir com teclado, duplo clique e saída protegida mantêm uma tentativa; resultado oculto reaparece`);
    await noOverflow("upload e confirmação sem overflow");
    await page.getByRole("button", { name: "Importar outro arquivo", exact: true }).click();
    await waitForFileInput();
    assert.equal(await page.getByLabel("Arquivo CSV").inputValue(), "");
    assert(await page.getByRole("button", { name: "Enviar CSV", exact: true }).isDisabled());
    assert.equal(submissions, 1);
    await page.getByLabel("Arquivo CSV").setInputFiles({
      name: "novas-empresas-sinteticas.csv", mimeType: "text/csv", buffer: Buffer.from(secondCsv),
    });
    expectedCsv = secondCsv;
    expectedUpload = "acknowledged";
    await Promise.all([
      page.waitForResponse(isProcessedCompaniesResponse(submissionId)),
      page.getByRole("button", { name: "Enviar CSV", exact: true }).click(),
    ]);
    await wait(page.getByRole("link", { name: "Acompanhar importação", exact: true }));
    await visibleUploadResult("Envio recebido");
    assert.equal(submissions, 2);
    assert.equal(uploadKeys.size, 2);
    passed(`${viewport.width}px outro arquivo exige seleção e envio explícitos com nova chave`);
    await page.waitForTimeout(250);
    assert.equal(await companyNotice.isVisible(), false);
    assert.equal(processedCompanyRows.length, 0);
    passed(`${viewport.width}px envio 202 e linhas recebidas não geram confirmação de processamento`);
    await Promise.all([
      page.waitForResponse(isProcessedCompaniesResponse(submissionId)),
      page.getByRole("link", { name: "Ver importações registradas", exact: true }).click(),
    ]);
    await wait(page.getByRole("table", { name: "Importações registradas" }));
    assert.equal(new URL(page.url()).pathname, "/imports/batches");
    assert.equal(await companyNotice.isVisible(), false);
    processedCompanyRows.push(2, 3);
    await wait(companyNotice);
    assert.match(await companyNotice.innerText(), /A empresa da linha 2 foi processada nesta importação/);
    assert.equal(new URL(page.url()).pathname, "/imports/batches");
    await companyNotice.getByRole("button", { name: "Fechar confirmação", exact: true }).focus();
    const listCounts = page.getByRole("table", { name: "Importações registradas" }).locator('td[data-label="Resultados"]');
    assert(await listCounts.getByText("Resultados ainda não confirmados", { exact: true }).isVisible());
    await listCounts.getByText("Contagens detalhadas", { exact: true }).click();
    const listMetrics = (await listCounts.innerText()).replace(/\s+/g, " ");
    for (const label of ["Linhas aceitas", "Linhas com resultado", "Leads gerados", "Bloqueadas", "Falhas"]) {
      assert(listMetrics.includes(`${label}: Não disponível`), `${label} must stay unavailable in the list`);
    }
    assert.equal(await page.getByText("Concluído", { exact: true }).count(), 0);
    passed(`${viewport.width}px resultado final novo gera confirmação com a lista de importações aberta`);
    const noticeBounds = await companyNotice.boundingBox();
    assert(noticeBounds && noticeBounds.x >= 0 && noticeBounds.x + noticeBounds.width <= viewport.width);
    assert(noticeBounds.y >= 0 && noticeBounds.y < 50);
    await companyNotice.getByRole("button", { name: "Fechar confirmação", exact: true }).focus();
    await page.getByRole("link", { name: "Ver detalhes da importação enviada em 06/10/2026", exact: true }).click();
    await wait(page.getByRole("region", { name: "Contagens do lote" }));
    assert(await companyNotice.isVisible());
    const closeCompanyNotice = companyNotice.getByRole("button", { name: "Fechar confirmação", exact: true });
    await closeCompanyNotice.focus();
    await page.keyboard.press("Enter");
    assert.match(await companyNotice.innerText(), /A empresa da linha 3 foi processada nesta importação/);
    await closeCompanyNotice.focus();
    await page.keyboard.press("Enter");
    await companyNotice.waitFor({ state: "hidden" });
    const processedReadsBefore = processedCompanyReads;
    await page.waitForResponse(isProcessedCompaniesResponse(submissionId), { timeout: 15_000 });
    assert(processedCompanyReads > processedReadsBefore);
    assert.equal(await companyNotice.isVisible(), false);
    assert.equal(submissions, 2);
    passed(`${viewport.width}px cada empresa processada tem aviso no canto, sequência, fechamento por teclado e deduplicação por GET após navegar`);
    const batchCounts = page.getByRole("region", { name: "Contagens do lote" });
    assert(await batchCounts.getByText("Resultados ainda não confirmados", { exact: true }).isVisible());
    assert.equal(await batchCounts.getByText("Linhas aceitas:", { exact: true }).isVisible(), false);
    await batchCounts.getByText("Contagens detalhadas", { exact: true }).click();
    assert(await batchCounts.getByText("Linhas aceitas:", { exact: true }).isVisible());
    const counts = (await page.getByRole("region", { name: "Contagens do lote" }).innerText()).replace(/\s+/g, " ");
    for (const label of ["Linhas aceitas", "Linhas com resultado", "Leads gerados", "Bloqueadas", "Falhas"]) {
      assert(counts.includes(`${label}: Não disponível`), `${label} must stay unavailable`);
    }
    passed(`${viewport.width}px resultados sem confirmação têm resumo visível e contagens consultáveis sem zeros inventados`);
    assert.equal(await page.getByRole("heading", { name: "Concluído", exact: true }).count(), 0);
    const importDetails = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Detalhes da importação$/ }) });
    assert.equal(await importDetails.getAttribute("open"), null);
    const batchIdentifier = importDetails.getByText(importBatchId, { exact: true });
    assert.equal(await batchIdentifier.isVisible(), false);
    await importDetails.locator("summary").click();
    assert(await batchIdentifier.isVisible());
    assert.doesNotMatch(await importDetails.innerText(), /n8n|workflow|payload|SQL/);
    await importDetails.locator("summary").click();
    passed(`${viewport.width}px identificação do lote fica recolhida e abre apenas sob escolha`);
    await noOverflow("detalhe do lote sem overflow");
    passed(`${viewport.width}px contagens não observadas continuam indisponíveis`);
    processingClosed = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await wait(page.getByRole("heading", { name: "Processamento encerrado", exact: true }));
    assert.match(await page.locator("main").innerText(), /Esse aviso não confirma, por si só, o resultado de todas as linhas/);
    assert.equal(await page.getByRole("heading", { name: "Concluído", exact: true }).count(), 0);
    passed(`${viewport.width}px encerramento informado não inventa conclusão ou contagens`);
    const staleNotice = page.getByRole("alert").filter({ hasText: "última consulta confirmada" });
    detailGetUnavailable = true;
    await page.getByRole("button", { name: "Atualizar situação", exact: true }).click();
    await wait(staleNotice);
    assert(await page.getByRole("heading", { name: "Processamento encerrado", exact: true }).isVisible());
    assert.equal(submissions, 2);
    detailGetUnavailable = false;
    await page.getByRole("button", { name: "Atualizar situação", exact: true }).click();
    await staleNotice.waitFor({ state: "hidden" });
    assert.equal(submissions, 2);
    passed(`${viewport.width}px recuperar situação usa somente GET e preserva consulta confirmada`);
    await page.getByRole("link", { name: "Abrir lista geral de empresas", exact: true }).click();
    await wait(page.getByRole("table", { name: "Resultados de leads" }));
    assert.equal(new URL(page.url()).pathname, "/leads");
    assert.equal(await page.getByRole("link", { name: /Abrir análise de Empresa [BC] Sintética/ }).count(), 2);
    await page.getByRole("button", { name: "Ver prioridade B", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("priority") === "B");
    await page.getByRole("button", { name: "Ver prioridade C", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("priority") === "C");
    await wait(page.getByRole("link", { name: "Abrir análise de Empresa C Sintética", exact: true }));
    passed(`${viewport.width}px lote abre análise geral e atalhos B/C usam filtros existentes`);
    for (const priority of ["B", "C"]) {
      await page.goto(new URL("/inicio", base).href, { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: `Prioridade ${priority}`, exact: true }).click();
      await wait(page.getByRole("table", { name: "Resultados de leads" }));
      const name = `Empresa ${priority} Sintética`;
      assert.equal(await page.getByRole("link", { name: `Abrir análise de ${name}` }).count(), 1);
      assert.equal(await page.getByRole("link", { name: `Abrir análise de Empresa ${priority === "B" ? "C" : "B"} Sintética` }).count(), 0);
      const appliedUrl = page.url();
      const readsBeforeDraft = leadQueries.length;
      const appliedLeadQuery = leadQueries.at(-1);
      const cnpjFilter = page.getByLabel("CNPJ exato", { exact: true });
      await page.getByLabel("Estado (UF)", { exact: true }).selectOption("SP");
      await cnpjFilter.fill("123");
      await page.getByLabel("Prioridade", { exact: true }).selectOption("R");
      await wait(page.getByText(/Há filtros ainda não aplicados/));
      assert.equal(page.url(), appliedUrl);
      assert(leadQueries.slice(readsBeforeDraft).every((query) => query === appliedLeadQuery));
      assert.equal(await page.getByRole("link", { name: `Abrir análise de ${name}` }).count(), 1);
      await noOverflow("filtros de empresas pendentes sem overflow");
      await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
      await wait(page.getByText("Informe um CNPJ completo com 14 dígitos.", { exact: true }));
      assert(await cnpjFilter.evaluate((element) => document.activeElement === element));
      assert.equal(page.url(), appliedUrl);
      assert(leadQueries.slice(readsBeforeDraft).every((query) => query === appliedLeadQuery));
      await page.getByRole("button", { name: "Descartar alterações dos filtros", exact: true }).click();
      assert.equal(await cnpjFilter.inputValue(), "");
      assert.equal(await page.getByLabel("Estado (UF)", { exact: true }).inputValue(), "");
      assert.equal(await page.getByLabel("Prioridade", { exact: true }).inputValue(), priority);
      assert(await cnpjFilter.evaluate((element) => document.activeElement === element));
      assert.equal(await page.getByText(/Há filtros ainda não aplicados/).count(), 0);
      assert.equal(await page.getByText("Informe um CNPJ completo com 14 dígitos.", { exact: true }).count(), 0);
      assert.equal(page.url(), appliedUrl);
      assert(leadQueries.slice(readsBeforeDraft).every((query) => query === appliedLeadQuery));
      passed(`${viewport.width}px filtros ${priority} pendentes e CNPJ inválido mantêm consulta; descarte restaura controles e foco`);
      await page.getByLabel("Estado (UF)", { exact: true }).selectOption("SP");
      assert.equal(new URL(page.url()).searchParams.get("uf"), null);
      if (priority === "C") {
        await page.getByLabel("CNPJ exato", { exact: true }).press("Enter");
      } else {
        await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
      }
      await page.waitForURL((url) => url.searchParams.get("uf") === "SP" && url.searchParams.get("priority") === priority);
      await wait(page.getByRole("link", { name: `Abrir análise de ${name}`, exact: true }));
      await noOverflow(`lista ${priority} sem overflow`);
      await page.getByRole("link", { name: `Abrir análise de ${name}` }).click();
      await wait(page.getByRole("heading", { name, exact: true }));
      const assessment = page.getByRole("region", { name: "Avaliação comercial", exact: true });
      assert.match(await assessment.innerText(), new RegExp(`Prioridade ${priority}`));
      assert(await assessment.getByRole("heading", {
        name: priority === "B" ? "Prospecção recomendada" : "Prospecção não recomendada",
        exact: true,
      }).isVisible());
      assert.match(await assessment.innerText(), /Data da análise: 06\/10\/2026/);
      assert.equal(await assessment.getByRole("link").count(), 0);
      assert.equal(await assessment.getByRole("button").count(), 0);
      assert.equal(await page.getByRole("navigation", { name: "Seções da análise" }).getByRole("link", { name: "Avaliação comercial", exact: true }).count(), 1);
      if (priority === "C") assert.match(await assessment.getByTestId("lead-score").innerText(), /95/);
      passed(`${viewport.width}px avaliação ${priority} orienta a decisão sem CTA de contatos ou aprovação por score`);
      assert.equal(await page.getByRole("link", { name: "Ver na pipeline de prospecção" }).count(), 0);
      const contacts = page.getByRole("region", { name: "Contatos profissionais", exact: true });
      await wait(contacts);
      assert.match(await contacts.innerText(), /Seu perfil não permite buscar ou visualizar contatos/);
      assert.equal(await page.getByRole("link", { name: "Encontrar contatos", exact: true }).count(), 0);
      assert.equal(await contacts.getByRole("button", { name: `Encontrar contatos de ${name}`, exact: true }).count(), 0);
      assert.equal(queueReads, 0);
      await noOverflow("contatos na empresa sem overflow");
      passed(`${viewport.width}px contatos ficam na empresa com acesso negado seguro e sem consulta à pipeline`);
      const historyDetails = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Identificação da análise$/ }) });
      await wait(historyDetails.locator("summary"));
      assert.equal(await historyDetails.getAttribute("open"), null);
      const decisionIdentifier = historyDetails.getByTestId("history-decision-id");
      assert.equal(await decisionIdentifier.isVisible(), false);
      await historyDetails.locator("summary").click();
      assert(await decisionIdentifier.isVisible());
      assert.match(await decisionIdentifier.innerText(), /^decision-synthetic-manager-/);
      await historyDetails.locator("summary").click();
      passed(`${viewport.width}px histórico ${priority} mantém identificação recolhida por padrão`);
      await noOverflow(`análise ${priority} sem overflow`);
      passed(`${viewport.width}px prioridade ${priority} filtra e abre análise`);
      const returnLink = page.getByRole("link", { name: "Voltar para leads", exact: true });
      const returnUrl = new URL(await returnLink.getAttribute("href"), base);
      assert.equal(returnUrl.searchParams.get("uf"), "SP");
      assert.equal(returnUrl.searchParams.get("priority"), priority);
      await returnLink.click();
      await page.waitForURL((url) => url.searchParams.get("uf") === "SP" && url.searchParams.get("priority") === priority);
      await wait(page.getByRole("link", { name: `Abrir análise de ${name}`, exact: true }));
      passed(`${viewport.width}px retorno da análise ${priority} preserva UF e prioridade`);
      passed(`${viewport.width}px filtro de estado só altera a lista após ${priority === "C" ? "Enter" : "clique em Aplicar filtros"}`);
    }
    await page.goto(new URL("/leads?page=1&pageSize=10&uf=RJ&priority=R", base).href, { waitUntil: "domcontentloaded" });
    await wait(page.getByRole("heading", { name: "Nenhum resultado para estes filtros", exact: true }));
    const clearLeadFilters = page.getByRole("link", { name: "Limpar filtros e ver empresas", exact: true });
    assert.equal(new URL(await clearLeadFilters.getAttribute("href"), base).search, "?page=1&pageSize=10");
    await noOverflow("empresas sem correspondência e recuperação sem overflow");
    await clearLeadFilters.click();
    await wait(page.getByRole("table", { name: "Resultados de leads" }));
    assert.equal(new URL(page.url()).search, "?page=1&pageSize=10");
    assert.equal(await page.getByRole("link", { name: /Abrir análise de Empresa [BC] Sintética/ }).count(), 2);
    passed(`${viewport.width}px consulta de empresas sem correspondência oferece limpeza e preserva tamanho da página`);
    for (const outcome of ["unknown", "malformed", "unavailable"]) {
      await page.goto(new URL("/imports", base).href, { waitUntil: "domcontentloaded" });
      await waitForFileInput();
      await page.getByLabel("Arquivo CSV").setInputFiles({
        name: "empresas-sinteticas.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
      });
      expectedCsv = csv;
      expectedUpload = outcome;
      await page.getByRole("button", { name: "Enviar CSV", exact: true }).click();
      await wait(page.getByRole("heading", { name: "Resultado desconhecido", exact: true }));
      await visibleUploadResult("Resultado desconhecido");
      assert.equal(await page.getByRole("button", { name: "Nova tentativa", exact: true }).count(), 0);
      assert(await page.getByLabel("Arquivo CSV").isDisabled());
      assert.match(await page.getByLabel("Arquivo CSV").inputValue(), /empresas-sinteticas\.csv$/);
      const responseLabel = outcome === "unavailable" ? "503" : "202";
      await noOverflow(`resultado ${responseLabel} ${outcome} sem overflow`);
      const countBeforeRead = submissions;
      await page.getByRole("link", {
        name: outcome === "unknown" ? "Acompanhar importação" : "Consultar importações registradas",
        exact: true,
      }).click();
      await wait(page.getByRole("heading", { name: outcome === "unknown" ? "Acompanhar importação" : "Suas importações", exact: true }));
      assert.equal(submissions, countBeforeRead);
      passed(`${viewport.width}px ${responseLabel} ${outcome} mantém resultado desconhecido sem novo POST`);
    }
    const listStaleNotice = page.getByRole("alert").filter({ hasText: "última consulta confirmada" });
    await wait(page.getByRole("table", { name: "Importações registradas" }));
    listGetUnavailable = true;
    await page.getByRole("button", { name: "Atualizar importações", exact: true }).click();
    await wait(listStaleNotice);
    assert(await page.getByRole("table", { name: "Importações registradas" }).isVisible());
    assert.equal(submissions, 5);
    listGetUnavailable = false;
    await page.getByRole("button", { name: "Atualizar importações", exact: true }).click();
    await listStaleNotice.waitFor({ state: "hidden" });
    assert.equal(submissions, 5);
    passed(`${viewport.width}px recuperar histórico usa somente GET e preserva consulta confirmada`);
    await navigateArea("Ajuda");
    await wait(page.getByRole("heading", { name: "Ajuda para importar e analisar", exact: true }));
    await noOverflow("Ajuda sem overflow");
    assert.match(await page.locator("main").innerText(), /desconhecido|indisponível/i);
    passed(`${viewport.width}px ajuda oferece orientação de negócio no aplicativo`);
    await navigateArea("Leads");
    await wait(page.getByRole("table", { name: "Resultados de leads" }));
    await page.getByRole("navigation", { name: "Visões de leads" }).getByRole("link", { name: "Fora da análise", exact: true }).click();
    await wait(page.getByRole("heading", { name: "Nenhuma decisão do CRM disponível", exact: true }));
    await noOverflow("Fora da análise sem overflow");
    passed(`${viewport.width}px fora da análise apresenta estado vazio sem inventar resultado`);
    await page.goto(new URL(`/work-queue?cnpj_normalizado=${leads[0].cnpj}`, base).href, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/leads" && url.searchParams.get("cnpj") === leads[0].cnpj);
    await wait(page.getByRole("link", { name: "Abrir análise de Empresa B Sintética", exact: true }));
    assert.equal(queueReads, 0);
    passed(`${viewport.width}px endereço antigo da pipeline abre Leads sem consultar a fila`);
    await page.goto(new URL(`/workspaces/${workspaceId}?returnTo=${encodeURIComponent("/leads?page=1&pageSize=20&priority=B")}`, base).href, { waitUntil: "domcontentloaded" });
    await wait(page.getByRole("heading", { name: "Acompanhamento comercial", exact: true }));
    await wait(page.getByRole("button", { name: "Criar plano de 4 contatos", exact: true }));
    await wait(page.getByRole("region", { name: "Auditoria comercial", exact: true }).getByText("Acompanhamento comercial iniciado", { exact: true }));
    assert.match(await page.locator("main").innerText(), /recomendação da análise permanece a mesma/);
    await page.getByLabel("Próxima ação", { exact: true }).fill(nextAction);
    expectedCommercialMutation = "workspace";
    await page.getByRole("button", { name: "Salvar acompanhamento", exact: true }).click();
    await wait(page.getByText("Acompanhamento comercial salvo.", { exact: true }));
    assert.equal(workspace.version, 2);
    const activityRegion = page.getByRole("region", { name: "Atividades comerciais", exact: true });
    await activityRegion.getByLabel("Resumo da atividade", { exact: true }).fill(activitySummary);
    expectedCommercialMutation = "activities";
    await activityRegion.getByRole("button", { name: "Registrar atividade", exact: true }).click();
    await wait(activityRegion.getByText("Atividade registrada.", { exact: true }));
    await wait(activityRegion.getByText(activitySummary, { exact: true }));
    const noteRegion = page.getByRole("region", { name: "Notas comerciais", exact: true });
    await noteRegion.getByLabel("Nova nota", { exact: true }).fill(noteBody);
    expectedCommercialMutation = "notes";
    await noteRegion.getByRole("button", { name: "Adicionar nota", exact: true }).click();
    await wait(noteRegion.getByText("Nota adicionada.", { exact: true }));
    await wait(noteRegion.getByText(noteBody, { exact: true }));
    assert.deepEqual(commercialMutations, ["workspace", "activities", "notes"]);
    await noOverflow("acompanhamento comercial sem overflow");
    await page.getByRole("link", { name: "Voltar para leads", exact: true }).click();
    await wait(page.getByRole("link", { name: "Abrir análise de Empresa B Sintética", exact: true }));
    assert.equal(new URL(page.url()).searchParams.get("priority"), "B");
    assert.equal(workspace.next_action, nextAction);
    passed(`${viewport.width}px acompanhamento histórico preserva próxima ação, atividade, nota, auditoria e retorno a Leads`);
    for (const status of [401, 403]) {
      listAccessStatus = null;
      await page.goto(new URL("/imports/batches", base).href, { waitUntil: "domcontentloaded" });
      await wait(page.getByRole("table", { name: "Importações registradas" }));
      listAccessStatus = status;
      await page.getByRole("button", { name: "Atualizar importações", exact: true }).click();
      await wait(page.getByRole("heading", { name: status === 401 ? "Sua sessão expirou" : "Acesso não autorizado", exact: true }));
      assert.equal(await page.getByRole("table", { name: "Importações registradas" }).count(), 0);
      assert.equal(await companyNotice.isVisible(), false);
      assert.equal(await page.getByRole("button", { name: "Atualizar importações", exact: true }).count(), 0);
      assert.equal(await page.getByRole("link", { name: "Entrar novamente", exact: true }).count(), status === 401 ? 1 : 0);
      if (viewport.width === 1366) {
        const readsAfterDenial = listReads;
        const processedReadsAfterDenial = processedCompanyReads;
        await page.waitForTimeout(5_500);
        assert.equal(listReads, readsAfterDenial);
        assert.equal(processedCompanyReads, processedReadsAfterDenial);
      }
      passed(`${viewport.width}px ${status} retira dados e interrompe recuperação sem permissão`);
    }
    listAccessStatus = null;
    await page.goto(new URL("/imports/batches?page=3&pageSize=50", base).href, { waitUntil: "domcontentloaded" });
    await wait(page.getByRole("table", { name: "Importações registradas" }));
    const paginatedBatch = page.getByRole("link", { name: "Ver detalhes da importação enviada em 06/10/2026", exact: true });
    assert.equal(new URL(await paginatedBatch.getAttribute("href"), base).searchParams.get("returnTo"), "/imports/batches?page=3&pageSize=50");
    await paginatedBatch.click();
    await wait(page.getByRole("region", { name: "Contagens do lote" }));
    const returnToBatches = page.getByRole("link", { name: "Voltar para importações", exact: true });
    assert.equal(await returnToBatches.getAttribute("href"), "/imports/batches?page=3&pageSize=50");
    await returnToBatches.click();
    await page.waitForURL((url) => url.pathname === "/imports/batches" && url.searchParams.get("page") === "3" && url.searchParams.get("pageSize") === "50");
    await wait(page.getByRole("table", { name: "Importações registradas" }));
    assert.match(await page.getByRole("navigation", { name: "Paginação das importações", exact: true }).innerText(), /Página 3 de 3/);
    await noOverflow("retorno à página de importações sem overflow");
    passed(`${viewport.width}px detalhe da importação retorna à página 3 com 50 itens por página`);
    const missingResponse = await page.goto(new URL("/pagina-sintetica-inexistente", base).href, { waitUntil: "domcontentloaded" });
    assert.equal(missingResponse.status(), 404);
    await wait(page.getByRole("heading", { name: "Página não encontrada", exact: true }));
    await noOverflow("página inexistente sem overflow");
    await page.getByRole("link", { name: "Voltar ao início", exact: true }).click();
    await wait(page.getByRole("heading", { name: "Importar e analisar empresas", exact: true }));
    passed(`${viewport.width}px página inexistente oferece retorno sem mutação`);
    assert.equal(submissions, 5);
    assert.equal(uploadKeys.size, 5);
    assert.equal(queueReads, 0);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    passed(`${viewport.width}px zero externos, mutações inesperadas ou erros de runtime`);
  } finally {
    await context.close();
  }
}

try {
  await verifyViewport({ width: 1366, height: 900 });
  await verifyViewport({ width: 1440, height: 1000 });
  await verifyViewport({ width: 375, height: 812 });
  await verifyViewport({ width: 390, height: 844 });
  console.log(JSON.stringify({ result: "PASS", checks: checks.length, syntheticOnly: true }));
} finally {
  await browser.close();
}
