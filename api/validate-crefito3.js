const CREFITO3_DETAILS_URL = "https://www.crefito3.org.br/dsn/consultapf/detalhes.asp?tb=ni";
const ZENROWS_API_URL = "https://api.zenrows.com/v1/";

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

function buildMessage(status, officialStatus, officialName) {
  if (status === "active") {
    return officialName
      ? `CREFITO ativo no CREFITO-3 para ${officialName}.`
      : "CREFITO ativo no CREFITO-3.";
  }

  if (status === "inactive") {
    const label = officialStatus || "INATIVO";
    return officialName
      ? `CREFITO localizado, mas consta como ${label} no CREFITO-3 para ${officialName}.`
      : `CREFITO localizado, mas consta como ${label} no CREFITO-3.`;
  }

  if (status === "not_found") {
    return "Nenhum profissional foi localizado no CREFITO-3 com esse registro.";
  }

  return "O registro foi localizado, mas o status nao pode ser classificado automaticamente.";
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
    typeCode: suffix === "TO" ? "3" : "4"
  };
}

function parseCrefitoHtml(html, parsed, name) {
  const normalizedHtml = normalizeComparableText(html);

  if (normalizedHtml.includes("NAO FORAM LOCALIZADOS PROFISSIONAIS COM OS DADOS INFORMADOS")) {
    return {
      source: "crefito3",
      crefito: parsed.raw,
      status: "not_found",
      officialName: "",
      officialStatus: "",
      professionType: parsed.suffix === "TO" ? "Terapeuta Ocupacional" : "Fisioterapeuta",
      canProceed: false,
      nameMatches: null,
      message: buildMessage("not_found", "", "")
    };
  }

  const officialName = firstMatch(html, [
    /Doutor\(a\)\s*<b>([\s\S]*?)<\/b>/i
  ]);
  const professionType = firstMatch(html, [
    /<em>([\s\S]*?)<\/em>/i
  ]) || (parsed.suffix === "TO" ? "Terapeuta Ocupacional" : "Fisioterapeuta");
  const rawStatus = firstMatch(html, [
    /Exerc[^<]{0,40}<b[^>]*>([\s\S]*?)<\/b>/i
  ]);

  if (!officialName && !rawStatus) {
    return {
      source: "crefito3",
      crefito: parsed.raw,
      status: "not_found",
      officialName: "",
      officialStatus: "",
      professionType,
      canProceed: false,
      nameMatches: null,
      message: buildMessage("not_found", "", "")
    };
  }

  const status = deriveStatus(rawStatus);
  const providedName = String(name ?? "").trim();
  const nameMatches = providedName
    ? normalizeComparableText(providedName) === normalizeComparableText(officialName)
    : null;

  return {
    source: "crefito3",
    crefito: parsed.raw,
    status,
    officialName,
    officialStatus: rawStatus.toUpperCase(),
    professionType,
    canProceed: status === "active",
    nameMatches,
    message: buildMessage(status, rawStatus.toUpperCase(), officialName)
  };
}

async function fetchDirectHtml(parsed) {
  const body = new URLSearchParams({
    xi: parsed.number,
    xc: parsed.typeCode
  });

  const response = await fetch(CREFITO3_DETAILS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const bodyPreview = await response.text().catch(() => "");
    throw new Error(`CREFITO upstream ${response.status}: ${bodyPreview.slice(0, 180)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("latin1");
}

async function fetchZenRowsHtml(parsed) {
  const apiKey = process.env.ZENROWS_API_KEY;
  if (!apiKey) {
    throw new Error("ZENROWS_API_KEY não configurada na Vercel.");
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

  const response = await fetch(scraperUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const bodyPreview = await response.text().catch(() => "");
    throw new Error(`ZenRows ${response.status}: ${bodyPreview.slice(0, 180)}`);
  }

  return response.text();
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

  const provider = String(process.env.CREFITO_PROXY_PROVIDER || "direct").trim().toLowerCase();
  const errors = [];

  if (provider === "zenrows") {
    try {
      const html = await fetchZenRowsHtml(parsed);
      return res.status(200).json(parseCrefitoHtml(html, parsed, body?.name));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const html = await fetchDirectHtml(parsed);
    return res.status(200).json(parseCrefitoHtml(html, parsed, body?.name));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return res.status(502).json({
    error: "Nao foi possivel consultar o CREFITO-3 agora.",
    debug: {
      provider,
      attempts: errors
    }
  });
};
