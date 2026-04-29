import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const CREFITO3_DETAILS_URL = "https://www.crefito3.org.br/dsn/consultapf/detalhes.asp?tb=ni";

type ValidationStatus = "active" | "inactive" | "not_found" | "unknown";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeComparableText(value: string) {
  return stripAccents(String(value ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
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

function cleanHtmlText(value: string) {
  return decodeHtmlEntities(
    String(value ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanHtmlText(match[1]);
  }
  return "";
}

function deriveStatus(rawStatus: string): ValidationStatus {
  const normalized = normalizeComparableText(rawStatus);
  if (!normalized) return "unknown";
  if (/(BAIXADO|INATIVO|CANCELADO|SUSPENSO|IRREGULAR)/.test(normalized)) return "inactive";
  if (/\bATIVO\b/.test(normalized)) return "active";
  return "unknown";
}

function buildMessage(status: ValidationStatus, officialStatus: string, officialName: string) {
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

function buildDebugError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? "",
      cause: error.cause ? String(error.cause) : ""
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
    stack: "",
    cause: ""
  };
}

async function readResponseHtml(response: Response) {
  const buffer = await response.arrayBuffer();
  try {
    return new TextDecoder("windows-1252").decode(buffer);
  } catch {
    return new TextDecoder().decode(buffer);
  }
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  let payload: { crefito?: string; name?: string | null };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisicao invalido." }, 400);
  }

  const crefito = String(payload?.crefito ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const parsed = crefito.match(/^(\d{1,8})-(F|TO)$/i);
  if (!parsed) {
    return jsonResponse({ error: "Formato de CREFITO invalido." }, 400);
  }

  const number = parsed[1];
  const suffix = parsed[2].toUpperCase();
  const typeCode = suffix === "TO" ? "3" : "4";

  const body = new URLSearchParams({
    xi: number,
    xc: typeCode
  });

  try {
    const response = await fetch(CREFITO3_DETAILS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; Fisiotosta/1.0; +https://supabase.com)"
      },
      redirect: "follow",
      body: body.toString()
    });

    if (!response.ok) {
      const upstreamBody = await response.text().catch(() => "");
      console.error("validate-crefito3 upstream non-ok", {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        bodyPreview: upstreamBody.slice(0, 400)
      });
      return jsonResponse({
        error: "Falha ao consultar o CREFITO-3.",
        debug: {
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText,
          upstreamUrl: response.url,
          upstreamBodyPreview: upstreamBody.slice(0, 400)
        }
      }, 502);
    }

    const html = await readResponseHtml(response);
    const normalizedHtml = normalizeComparableText(html);

    if (normalizedHtml.includes("NAO FORAM LOCALIZADOS PROFISSIONAIS COM OS DADOS INFORMADOS")) {
      return jsonResponse({
        source: "crefito3",
        crefito,
        status: "not_found",
        officialName: "",
        officialStatus: "",
        professionType: suffix === "TO" ? "Terapeuta Ocupacional" : "Fisioterapeuta",
        canProceed: false,
        nameMatches: null,
        message: buildMessage("not_found", "", "")
      });
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

    const status = deriveStatus(rawStatus);
    const providedName = String(payload?.name ?? "").trim();
    const nameMatches = providedName
      ? normalizeComparableText(providedName) === normalizeComparableText(officialName)
      : null;

    return jsonResponse({
      source: "crefito3",
      crefito,
      status,
      officialName,
      officialStatus: rawStatus.toUpperCase(),
      professionType,
      canProceed: status === "active",
      nameMatches,
      message: buildMessage(status, rawStatus.toUpperCase(), officialName)
    });
  } catch (error) {
    const debug = buildDebugError(error);
    console.error("validate-crefito3 error", debug);
    return jsonResponse({
      error: "Nao foi possivel consultar o CREFITO-3 agora.",
      debug
    }, 500);
  }
});
