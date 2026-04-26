const CREFITO3_DETAILS_URL = "https://www.crefito3.org.br/dsn/consultapf/detalhes.asp?tb=ni";
const CREFITO2_URL = "https://www.crefito2.com.br/spw/consultacadastral/TelaConsultaPublicaCompleta.aspx";
const ZENROWS_API_URL = "https://api.zenrows.com/v1/";
const DEFAULT_SOURCE_CHAIN = ["crefito3", "crefito2"];
const CREFITO3_DIRECT_TIMEOUT_MS = 4500;
const CREFITO3_PROXY_TIMEOUT_MS = 7000;
const CREFITO2_TIMEOUT_MS = 6000;
const DEFAULT_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
};

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function stripAccents(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeComparableText(value) {
  return stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(
    String(value ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanHtmlText(match[1]);
  }
  return "";
}

function deriveStatus(rawStatus) {
  const normalized = normalizeComparableText(rawStatus);
  if (!normalized) return "unknown";
  if (/(BAIXADO|INATIVO|CANCELADO|SUSPENSO|IRREGULAR)/.test(normalized)) return "inactive";
  if (/\bATIVO\b/.test(normalized)) return "active";
  return "unknown";
}

function parseRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {}
  }
  return {};
}

function parseCrefito(crefito) {
  const parsed = String(crefito ?? "").trim().toUpperCase().replace(/\s+/g, "").match(/^(\d{1,8})-(F|TO)$/i);
  if (!parsed) return null;
  const number = parsed[1];
  const suffix = parsed[2].toUpperCase();
  return {
    raw: `${number}-${suffix}`,
    number,
    suffix,
    paddedNumber: number.padStart(6, "0"),
    typeCode: suffix === "TO" ? "3" : "4",
    professionType: suffix === "TO" ? "Terapeuta Ocupacional" : "Fisioterapeuta"
  };
}

function buildMessage(sourceLabel, status, officialStatus, officialName) {
  if (status === "active") {
    return officialName
      ? `CREFITO ativo no ${sourceLabel} para ${officialName}.`
      : `CREFITO ativo no ${sourceLabel}.`;
  }

  if (status === "inactive") {
    const label = officialStatus || "INATIVO";
    return officialName
      ? `CREFITO localizado, mas consta como ${label} no ${sourceLabel} para ${officialName}.`
      : `CREFITO localizado, mas consta como ${label} no ${sourceLabel}.`;
  }

  if (status === "not_found") {
    return `Nenhum profissional foi localizado no ${sourceLabel} com esse registro.`;
  }

  return `O registro foi localizado no ${sourceLabel}, mas o status nao pode ser classificado automaticamente.`;
}

function buildResult({ source, sourceLabel, parsed, status, officialName = "", officialStatus = "", professionType = "", name, canProceed }) {
  const providedName = String(name ?? "").trim();
  const resolvedProfessionType = professionType || parsed.professionType;
  const nameMatches = providedName
    ? normalizeComparableText(providedName) === normalizeComparableText(officialName)
    : null;

  return {
    source,
    sourceLabel,
    crefito: parsed.raw,
    status,
    officialName,
    officialStatus,
    professionType: resolvedProfessionType,
    canProceed: typeof canProceed === "boolean" ? canProceed : status === "active",
    nameMatches,
    message: buildMessage(sourceLabel, status, officialStatus, officialName)
  };
}

function getSourceLabel(source) {
  if (source === "crefito2") return "CREFITO-2";
  if (source === "crefito3") return "CREFITO-3";
  if (source === "coffito") return "COFFITO";
  return String(source ?? "").toUpperCase() || "fonte";
}

function getSourceChain() {
  const configured = String(process.env.CREFITO_VALIDATION_SOURCES || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_SOURCE_CHAIN;
}

async function fetchDirectHtml(parsed) {
  const body = new URLSearchParams({
    xi: parsed.number,
    xc: parsed.typeCode
  });

  const response = await fetchWithTimeout(CREFITO3_DETAILS_URL, {
    method: "POST",
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: body.toString()
  }, CREFITO3_DIRECT_TIMEOUT_MS, "CREFITO-3");

  if (!response.ok) {
    const bodyPreview = await response.text().catch(() => "");
    throw new Error(`CREFITO-3 upstream ${response.status}: ${bodyPreview.slice(0, 180)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("latin1");
}

async function fetchZenRowsHtml(parsed) {
  const apiKey = process.env.ZENROWS_API_KEY;
  if (!apiKey) {
    throw new Error("ZENROWS_API_KEY nao configurada na Vercel.");
  }

  const targetUrl = new URL(CREFITO3_DETAILS_URL);
  const body = new URLSearchParams({
    xi: parsed.number,
    xc: parsed.typeCode
  });

  const scraperUrl = new URL(ZENROWS_API_URL);
  scraperUrl.searchParams.set("apikey", apiKey);
  scraperUrl.searchParams.set("url", targetUrl.toString());
  scraperUrl.searchParams.set("js_render", "true");
  scraperUrl.searchParams.set("premium_proxy", "true");
  scraperUrl.searchParams.set("proxy_country", "br");
  scraperUrl.searchParams.set("custom_headers", "true");
  scraperUrl.searchParams.set("original_status", "true");

  const response = await fetchWithTimeout(scraperUrl, {
    method: "POST",
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: body.toString()
  }, CREFITO3_PROXY_TIMEOUT_MS, "ZenRows/CREFITO-3");

  if (!response.ok) {
    const bodyPreview = await response.text().catch(() => "");
    throw new Error(`ZenRows ${response.status}: ${bodyPreview.slice(0, 180)}`);
  }

  return response.text();
}

function parseCrefito3Html(html, parsed, name) {
  const normalizedHtml = normalizeComparableText(html);

  if (normalizedHtml.includes("NAO FORAM LOCALIZADOS PROFISSIONAIS COM OS DADOS INFORMADOS")) {
    return buildResult({
      source: "crefito3",
      sourceLabel: "CREFITO-3",
      parsed,
      status: "not_found",
      name
    });
  }

  const officialName = firstMatch(html, [/Doutor\(a\)\s*<b>([\s\S]*?)<\/b>/i]);
  const professionType = firstMatch(html, [/<em>([\s\S]*?)<\/em>/i]) || parsed.professionType;
  const rawStatus = firstMatch(html, [/Exerc[^<]{0,40}<b[^>]*>([\s\S]*?)<\/b>/i]);

  if (!officialName && !rawStatus) {
    return buildResult({
      source: "crefito3",
      sourceLabel: "CREFITO-3",
      parsed,
      status: "not_found",
      name
    });
  }

  return buildResult({
    source: "crefito3",
    sourceLabel: "CREFITO-3",
    parsed,
    status: deriveStatus(rawStatus),
    officialName,
    officialStatus: rawStatus.toUpperCase(),
    professionType,
    name
  });
}

function extractHiddenValue(html, fieldName) {
  const match = html.match(new RegExp(`name="${fieldName.replace(/[$]/g, "\\$")}"[^>]*value="([^"]*)"`, "i"));
  return match?.[1] ?? "";
}

function buildCrefito2Form(html, parsed) {
  return new URLSearchParams({
    "__VIEWSTATE": extractHiddenValue(html, "__VIEWSTATE"),
    "__VIEWSTATEGENERATOR": extractHiddenValue(html, "__VIEWSTATEGENERATOR"),
    "__EVENTVALIDATION": extractHiddenValue(html, "__EVENTVALIDATION"),
    "cbousuario_VI": "1",
    "ctl00$ContentPlaceHolder1$Callbackconsulta$cbousuario": "Profissional",
    "ctl00$ContentPlaceHolder1$Callbackconsulta$cbousuario$DDD$L": "1",
    "ContentPlaceHolder1_Callbackconsulta_cboTipoBusca_VI": "NumRegistro",
    "ctl00$ContentPlaceHolder1$Callbackconsulta$cboTipoBusca": "Num. Registro",
    "ctl00$ContentPlaceHolder1$Callbackconsulta$cboTipoBusca$DDD$L": "NumRegistro",
    "ctl00$ContentPlaceHolder1$Callbackconsulta$txtConsultaTotal": parsed.paddedNumber,
    "ContentPlaceHolder1_Callbackconsulta_cboCidade_VI": "TODOS",
    "ctl00$ContentPlaceHolder1$Callbackconsulta$cboCidade": "TODOS",
    "ctl00$ContentPlaceHolder1$Callbackconsulta$cboCidade$DDD$L": "TODOS",
    "ctl00$ContentPlaceHolder1$Callbackconsulta$btnConsultaTotal": "Pesquisar"
  });
}

function parseCrefito2Html(html, parsed, name) {
  const normalizedHtml = normalizeComparableText(html);

  if (normalizedHtml.includes("NAO FORAM LOCALIZADOS") || normalizedHtml.includes("NENHUM REGISTRO ENCONTRADO")) {
    return buildResult({
      source: "crefito2",
      sourceLabel: "CREFITO-2",
      parsed,
      status: "not_found",
      name
    });
  }

  const gridRowMatch = html.match(/<tr id="ContentPlaceHolder1_Callbackconsulta_gridConsulta_DXDataRow\d+"[\s\S]*?<\/tr>/i);
  if (gridRowMatch?.[0]) {
    const rowCells = Array.from(
      gridRowMatch[0]
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)
    )
      .map((match) => cleanHtmlText(match[1]))
      .filter(Boolean);

    if (rowCells.length >= 4) {
      const [officialRegistration, officialName, professionType, rawStatus] = rowCells;
      const result = buildResult({
        source: "crefito2",
        sourceLabel: "CREFITO-2",
        parsed,
        status: deriveStatus(rawStatus),
        officialName,
        officialStatus: rawStatus.toUpperCase(),
        professionType,
        name
      });
      result.officialRegistration = officialRegistration;
      return result;
    }
  }

  const officialName = firstMatch(html, [
    /<td[^>]*>\s*Nome\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    /<td[^>]*>\s*Nome\s*<\/td>[\s\S]{0,400}?<td[^>]*>([\s\S]*?)<\/td>/i
  ]);
  const rawStatus = firstMatch(html, [
    /<td[^>]*>\s*Situa(?:ç|c)ao\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    /DescSitCadastralWEB[^>]*>([\s\S]*?)<\/td>/i
  ]);
  const professionType = firstMatch(html, [
    /<td[^>]*>\s*Profiss[aã]o\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i
  ]) || parsed.professionType;

  if (!officialName && !rawStatus) {
    throw new Error("Nao foi possivel interpretar o retorno do CREFITO-2.");
  }

  return buildResult({
    source: "crefito2",
    sourceLabel: "CREFITO-2",
    parsed,
    status: deriveStatus(rawStatus),
    officialName,
    officialStatus: rawStatus.toUpperCase(),
    professionType,
    name
  });
}

async function queryCrefito3(parsed, name) {
  const provider = String(process.env.CREFITO_PROXY_PROVIDER || "direct").trim().toLowerCase();
  const attempts = [];

  if (provider === "zenrows") {
    try {
      const html = await fetchZenRowsHtml(parsed);
      return parseCrefito3Html(html, parsed, name);
    } catch (error) {
      attempts.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const html = await fetchDirectHtml(parsed);
    return parseCrefito3Html(html, parsed, name);
  } catch (error) {
    attempts.push(error instanceof Error ? error.message : String(error));
  }

  const failure = new Error("Nao foi possivel consultar o CREFITO-3 agora.");
  failure.details = { provider, attempts };
  throw failure;
}

async function queryCrefito2(parsed, name) {
  const initialResponse = await fetchWithTimeout(CREFITO2_URL, {
    method: "GET",
    headers: DEFAULT_HEADERS
  }, CREFITO2_TIMEOUT_MS, "CREFITO-2 GET");

  if (!initialResponse.ok) {
    throw new Error(`CREFITO-2 GET ${initialResponse.status}`);
  }

  const initialHtml = await initialResponse.text();
  const formBody = buildCrefito2Form(initialHtml, parsed);

  const searchResponse = await fetchWithTimeout(CREFITO2_URL, {
    method: "POST",
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formBody.toString()
  }, CREFITO2_TIMEOUT_MS, "CREFITO-2 POST");

  if (!searchResponse.ok) {
    const preview = await searchResponse.text().catch(() => "");
    throw new Error(`CREFITO-2 POST ${searchResponse.status}: ${preview.slice(0, 180)}`);
  }

  const html = await searchResponse.text();
  return parseCrefito2Html(html, parsed, name);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

  const body = parseRequestBody(req);
  const parsed = parseCrefito(body?.crefito);

  if (!parsed) {
    return res.status(400).json({ error: "Formato de CREFITO invalido." });
  }

  const sourceChain = getSourceChain();
  const attempts = [];

  for (const source of sourceChain) {
    try {
      if (source === "crefito3") {
        const result = await queryCrefito3(parsed, body?.name);
        if (result.status !== "not_found") {
          return res.status(200).json(result);
        }
        attempts.push({ source, status: result.status, message: result.message });
        continue;
      }

      if (source === "crefito2") {
        const result = await queryCrefito2(parsed, body?.name);
        if (result.status !== "not_found") {
          return res.status(200).json(result);
        }
        attempts.push({ source, status: result.status, message: result.message });
        continue;
      }
    } catch (error) {
      attempts.push({
        source,
        error: error instanceof Error ? error.message : String(error),
        details: error?.details ?? null
      });
    }
  }

  const searchedSources = attempts
    .filter((item) => item.source)
    .map((item) => item.source);

  const foundNotFound = attempts.find((item) => item.status === "not_found");
  if (foundNotFound) {
    const labels = searchedSources.map(getSourceLabel);
    const result = buildResult({
      source: foundNotFound.source,
      sourceLabel: labels.length > 0 ? labels.join(" e ") : getSourceLabel(foundNotFound.source),
      parsed,
      status: "not_found",
      name: body?.name
    });
    result.searchedSources = searchedSources;
    result.searchedSourceLabels = labels;
    result.message = labels.length > 1
      ? `Nenhum registro foi localizado apos consultar ${labels.join(" e ")}.`
      : result.message;
    return res.status(200).json(result);
  }

  return res.status(502).json({
    error: "Nao foi possivel consultar os CREFITOs configurados agora.",
    debug: {
      sources: sourceChain,
      attempts
    }
  });
};
