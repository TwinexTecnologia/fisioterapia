const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 8000);
const ROOT_DIR = __dirname;
const CREFITO3_DETAILS_URL = "https://www.crefito3.org.br/dsn/consultapf/detalhes.asp?tb=ni";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf"
};

function openBrowser(url) {
  const platform = process.platform;
  let command = "";

  if (platform === "win32") {
    command = `start "" "${url}"`;
  } else if (platform === "darwin") {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.warn("Nao foi possivel abrir o navegador automaticamente.", error.message);
    }
  });
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

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end(error.code === "ENOENT" ? "Arquivo nao encontrado." : "Erro ao carregar arquivo.");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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

function resolveStaticFile(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const safePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!safePath.startsWith(ROOT_DIR)) return null;
  return safePath;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "fisioflow-local-app" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/validate-crefito3") {
    try {
      const body = await readJsonBody(req);
      const result = await queryCrefito3(body?.crefito, body?.name);
      sendJson(res, result.statusCode, result.payload);
    } catch (error) {
      console.error("local-app-server api error", error);
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Nao foi possivel consultar o CREFITO-3 agora."
      });
    }
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Metodo nao permitido." });
    return;
  }

  const filePath = resolveStaticFile(req.url || "/");
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Acesso negado.");
    return;
  }

  sendFile(res, filePath);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`A porta ${PORT} ja esta em uso. Feche o servidor antigo antes de iniciar o ambiente local unificado.`);
    return;
  }
  console.error("Erro no servidor local:", error);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`Fisiotosta local rodando em ${url}`);
  openBrowser(url);
});
