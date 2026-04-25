const http = require("http");

const PORT = 8787;
const HOST = "127.0.0.1";
const CREFITO3_DETAILS_URL = "https://www.crefito3.org.br/dsn/consultapf/detalhes.asp?tb=ni";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
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

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function queryCrefito3(crefito, name) {
  const parsed = String(crefito ?? "").trim().toUpperCase().replace(/\s+/g, "").match(/^(\d{1,8})-(F|TO)$/i);
  if (!parsed) {
    return { statusCode: 400, payload: { error: "Formato de CREFITO invalido." } };
  }

  const number = parsed[1];
  const suffix = parsed[2].toUpperCase();
  const typeCode = suffix === "TO" ? "3" : "4";
  const body = new URLSearchParams({ xi: number, xc: typeCode });

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
    const upstreamBody = await response.text().catch(() => "");
    return {
      statusCode: 502,
      payload: {
        error: "Falha ao consultar o CREFITO-3.",
        debug: {
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText,
          upstreamUrl: response.url,
          upstreamBodyPreview: upstreamBody.slice(0, 300)
        }
      }
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const html = buffer.toString("latin1");
  const normalizedHtml = normalizeComparableText(html);

  if (normalizedHtml.includes("NAO FORAM LOCALIZADOS PROFISSIONAIS COM OS DADOS INFORMADOS")) {
    return {
      statusCode: 200,
      payload: {
        source: "crefito3-local",
        crefito: `${number}-${suffix}`,
        status: "not_found",
        officialName: "",
        officialStatus: "",
        professionType: suffix === "TO" ? "Terapeuta Ocupacional" : "Fisioterapeuta",
        canProceed: false,
        nameMatches: null,
        message: buildMessage("not_found", "", "")
      }
    };
  }

  const officialName = firstMatch(html, [
    /Doutor\(a\)\s*<b>([\s\S]*?)<\/b>/i
  ]);
  const professionType = firstMatch(html, [
    /<em>([\s\S]*?)<\/em>/i
  ]) || (suffix === "TO" ? "Terapeuta Ocupacional" : "Fisioterapeuta");
  const rawStatus = firstMatch(html, [
    /Exerc[^<]{0,40}<b[^>]*>([\s\S]*?)<\/b>/i
  ]);
  if (!officialName && !rawStatus) {
    return {
      statusCode: 200,
      payload: {
        source: "crefito3-local",
        crefito: `${number}-${suffix}`,
        status: "not_found",
        officialName: "",
        officialStatus: "",
        professionType: suffix === "TO" ? "Terapeuta Ocupacional" : "Fisioterapeuta",
        canProceed: false,
        nameMatches: null,
        message: buildMessage("not_found", "", "")
      }
    };
  }
  const status = deriveStatus(rawStatus);
  const providedName = String(name ?? "").trim();
  const nameMatches = providedName
    ? normalizeComparableText(providedName) === normalizeComparableText(officialName)
    : null;

  return {
    statusCode: 200,
    payload: {
      source: "crefito3-local",
      crefito: `${number}-${suffix}`,
      status,
      officialName,
      officialStatus: rawStatus.toUpperCase(),
      professionType,
      canProceed: status === "active",
      nameMatches,
      message: buildMessage(status, rawStatus.toUpperCase(), officialName)
    }
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "crefito3-local" });
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/validate-crefito3") {
    sendJson(res, 404, { error: "Rota nao encontrada." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await queryCrefito3(body?.crefito, body?.name);
    sendJson(res, result.statusCode, result.payload);
  } catch (error) {
    console.error("crefito-local-server error", error);
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Nao foi possivel consultar o CREFITO-3 agora."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor local do CREFITO rodando em http://${HOST}:${PORT}`);
});
