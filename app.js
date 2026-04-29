import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STORAGE = {
  protocol: "thompson.protocol.v1",
  session: "thompson.session.v1",
  viewerNotificationsSeen: "thompson.viewer.notifications.seen.v1",
  deviceId: "thompson.device.id.v1"
};

const DEFAULT_PROTOCOL_URL = "./protocol.generated.json";
const SUPABASE_URL = "https://uoqeewalrlzrmrtbqxgi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcWVld2Fscmx6cm1ydGJxeGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5OTU3ODgsImV4cCI6MjA5MjU3MTc4OH0.CHa8PVpph4mYf7RYN2tzESbNrbH92ITrNeWAYDGBok8";
const CREFITO_LOCAL_API_URL = getCrefitoLocalApiUrl();
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

function $(id) {
  return document.getElementById(id);
}

function getCrefitoLocalApiUrl() {
  const origin = String(window.location?.origin ?? "").trim();
  if (origin && !/^file:/i.test(origin)) {
    return `${origin}/api/validate-crefito3`;
  }
  return "http://127.0.0.1:8000/api/validate-crefito3";
}

function now() {
  return Date.now();
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function createPersistentDeviceId() {
  const fallback = `device-${now()}-${Math.random().toString(36).slice(2, 10)}`;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return fallback;
}

function getCurrentDeviceId() {
  try {
    const existing = String(localStorage.getItem(STORAGE.deviceId) ?? "").trim();
    if (existing) return existing;
    const nextId = createPersistentDeviceId();
    localStorage.setItem(STORAGE.deviceId, nextId);
    return nextId;
  } catch {
    return createPersistentDeviceId();
  }
}

function detectDeviceKind(userAgent = "") {
  const ua = String(userAgent ?? "").toLowerCase();
  if (/ipad|tablet/.test(ua)) return "Tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) return "Celular";
  return "PC";
}

function detectBrowserName(userAgent = "") {
  const ua = String(userAgent ?? "").toLowerCase();
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
  if (ua.includes("chrome/")) return "Chrome";
  if (ua.includes("firefox/")) return "Firefox";
  if (ua.includes("safari/") && !ua.includes("chrome/")) return "Safari";
  return "Navegador";
}

function detectOperatingSystem(userAgent = "") {
  const ua = String(userAgent ?? "").toLowerCase();
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iOS";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macOS";
  if (ua.includes("linux")) return "Linux";
  return "Sistema";
}

function getCurrentDeviceDescriptor() {
  const userAgent = String(window.navigator?.userAgent ?? "").trim();
  const kind = detectDeviceKind(userAgent);
  const browser = detectBrowserName(userAgent);
  const os = detectOperatingSystem(userAgent);
  return {
    id: getCurrentDeviceId(),
    kind,
    label: `${kind} • ${browser} • ${os}`,
    userAgent
  };
}

function getDefaultViewForRole(role) {
  return canAccessDashboard(role) ? "dashboard" : "modulos";
}

function getRoleLabel(role) {
  if (isOwnerRole(role)) return "Gestao da plataforma";
  if (isFisioAdminRole(role)) return "Responsavel clinico";
  return "Profissional autorizado";
}

function getAccessMetaLabel(role) {
  if (isOwnerRole(role)) return "Painel Fisiotosta";
  if (isFisioAdminRole(role)) return "Area clinica Fisiotosta";
  return "Acesso Fisiotosta liberado";
}

function isOwnerRole(role) {
  return String(role ?? "").trim().toLowerCase() === "owner";
}

function isFisioAdminRole(role) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "fisio_admin" || normalized === "admin";
}

function isFisioPacienteRole(role) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "fisio_paciente" || normalized === "fisio";
}

function canAccessDashboard(role) {
  return isOwnerRole(role) || isFisioAdminRole(role);
}

function canManageProfiles(role) {
  return isOwnerRole(role) || isFisioAdminRole(role);
}

function canAccessOwnProfile(role) {
  return isFisioAdminRole(role) || isFisioPacienteRole(role);
}

function getManagedChildRole(role) {
  if (isOwnerRole(role)) return "fisio_admin";
  if (isFisioAdminRole(role)) return "fisio_paciente";
  return "";
}

function getManagedProfileContext(role) {
  if (isOwnerRole(role)) {
    return {
      listTitle: "Clientes Fisio Admin",
      listSubtitle: "Gerencie os clientes da plataforma, acompanhe status e centralize os acessos dos administradores clinicos.",
      buttonLabel: "+ Novo Cliente",
      formTitle: "Cadastrar Cliente Fisio Admin",
      formSubtitle: "Crie o login do fisio admin que vai montar modulos, ver dashboard e gerenciar os proprios pacientes.",
      emptyState: "Nenhum fisio admin cadastrado ainda."
    };
  }

  return {
    listTitle: "Fisio Pacientes",
    listSubtitle: "Cadastre os acessos dos seus fisio pacientes e controle quais contas ficam ativas no seu app.",
    buttonLabel: "+ Novo Fisio Paciente",
    formTitle: "Cadastrar Fisio Paciente",
    formSubtitle: "Crie um acesso para o fisio paciente que vai consumir apenas os modulos liberados por voce.",
    emptyState: "Nenhum fisio paciente cadastrado ainda."
  };
}

function getExitFlowView(role) {
  if (isFisioAdminRole(role)) return "modulos";
  return getDefaultViewForRole(role);
}

function createIsolatedSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `thompson-managed-user-${now()}`
    }
  });
}

function parseCrefitoInput(value) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,8})-(F|TO)$/i);
  if (!match) return null;
  const suffix = match[2].toUpperCase();
  return {
    raw: `${match[1]}-${suffix}`,
    number: match[1],
    suffix,
    typeCode: suffix === "TO" ? "3" : "4"
  };
}

function setCrefitoStatus(message = "", variant = "") {
  const status = $("crefitoStatus");
  if (!status) return;
  status.textContent = message;
  status.className = "crefito-status";
  if (!message) {
    status.classList.add("hidden");
    return;
  }
  if (variant === "success") status.classList.add("crefito-status--success");
  if (variant === "warning") status.classList.add("crefito-status--warning");
  if (variant === "error") status.classList.add("crefito-status--error");
  if (variant === "info") status.classList.add("crefito-status--info");
}

function resetManagedProfileCrefitoState(app = null, options = {}) {
  if (app) app.crefitoValidation = null;
  if (options.clearStatus) setCrefitoStatus("");
}

function highlightInputTemporarily(input, color) {
  if (!input) return;
  const previousColor = input.style.backgroundColor;
  input.style.backgroundColor = color;
  setTimeout(() => {
    input.style.backgroundColor = previousColor;
  }, 1400);
}

function getStoredCrefitoValidation(app) {
  const parsed = parseCrefitoInput($("crefitoInput")?.value ?? "");
  if (!parsed) return null;
  if (app?.crefitoValidation?.checkedCrefito !== parsed.raw) return null;
  return app.crefitoValidation;
}

function rememberCrefitoValidation(app, result) {
  const parsed = parseCrefitoInput($("crefitoInput")?.value ?? "");
  const nextResult = {
    checkedAt: now(),
    checkedCrefito: parsed?.raw ?? "",
    ...result
  };
  if (app) app.crefitoValidation = nextResult;
  return nextResult;
}

function normalizeCrefitoLookupResult(data, fallbackCrefito = "") {
  return {
    source: String(data?.source ?? "").trim().toLowerCase() || "crefito3",
    sourceLabel: String(data?.sourceLabel ?? "").trim(),
    crefito: String(data?.crefito ?? fallbackCrefito ?? "").trim().toUpperCase(),
    status: String(data?.status ?? "").trim().toLowerCase() || "lookup_error",
    officialName: String(data?.officialName ?? "").trim(),
    officialStatus: String(data?.officialStatus ?? "").trim().toUpperCase(),
    professionType: String(data?.professionType ?? "").trim(),
    message: String(data?.message ?? "").trim(),
    canProceed: Boolean(data?.canProceed),
    nameMatches: typeof data?.nameMatches === "boolean" ? data.nameMatches : null,
    searchedSources: Array.isArray(data?.searchedSources) ? data.searchedSources : [],
    searchedSourceLabels: Array.isArray(data?.searchedSourceLabels) ? data.searchedSourceLabels : []
  };
}

function getReadableCrefitoLookupError(error) {
  const message = String(
    error?.cause?.message
    ?? error?.message
    ?? error
    ?? ""
  ).trim();
  if (!message) return "Nao foi possivel consultar os CREFITOs agora.";
  if (/aborted|timeout/i.test(message)) {
    return "A consulta aos CREFITOs demorou mais do que o esperado. Tente novamente.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Nao foi possivel acessar o validador do CREFITO agora. Verifique se o ambiente local ou a rota da Vercel estao ativos.";
  }
  return message;
}

function applyCrefitoLookupToForm(result, options = {}) {
  const allowNameAutofill = options.allowNameAutofill !== false;
  const nomeInput = $("nomeFisioInput");
  const sourceLabel = String(result?.sourceLabel ?? "").trim() || "CREFITO";

  if (result.status === "active") {
    if (allowNameAutofill && nomeInput && !String(nomeInput.value ?? "").trim() && result.officialName) {
      nomeInput.value = result.officialName;
      highlightInputTemporarily(nomeInput, "#ecfdf5");
    }

    let message = `Validacao concluida via ${sourceLabel}. CREFITO ativo.`;
    if (result.officialName) {
      message = `Validacao concluida via ${sourceLabel}. CREFITO ativo para ${result.officialName}.`;
    }
    if (result.nameMatches === false) {
      message += " O nome digitado nao bate exatamente com o cadastro oficial.";
      setCrefitoStatus(message, "warning");
      return;
    }
    setCrefitoStatus(message, "success");
    return;
  }

  if (result.status === "inactive") {
    const label = result.officialStatus || "INATIVO";
    const suffix = result.officialName ? ` Registro localizado para ${result.officialName}.` : "";
    setCrefitoStatus(`Validacao concluida via ${sourceLabel}. O registro foi localizado, mas consta como ${label}.${suffix}`, "warning");
    return;
  }

  if (result.status === "not_found") {
    setCrefitoStatus(
      result.message || "Nenhum registro foi localizado nos CREFITOs consultados para esse CREFITO.",
      "error"
    );
    return;
  }

  if (result.status === "invalid_format") {
    setCrefitoStatus("Formato invalido. Use apenas numero e sufixo, por exemplo: 212658-F.", "error");
    return;
  }

  const fallbackMessage = result.message || "Nao foi possivel consultar os CREFITOs agora.";
  setCrefitoStatus(fallbackMessage, result.status === "lookup_error" ? "warning" : "info");
}

function buildCrefitoProceedMessage(result) {
  const sourceLabel = String(result?.sourceLabel ?? "").trim() || "CREFITO";

  if (result.status === "inactive") {
    const label = result.officialStatus || "INATIVO";
    const officialName = result.officialName ? `\nProfissional localizado: ${result.officialName}` : "";
    return `O CREFITO informado foi localizado via ${sourceLabel}, mas esta como ${label}.${officialName}\n\nDeseja continuar o cadastro mesmo assim?`;
  }

  if (result.status === "not_found") {
    const sourceLabels = Array.isArray(result.searchedSourceLabels) && result.searchedSourceLabels.length > 0
      ? result.searchedSourceLabels
      : Array.isArray(result.searchedSources) ? result.searchedSources : [];
    const sourceText = sourceLabels.length > 0
      ? ` nos CREFITOs consultados (${sourceLabels.join(", ")})`
      : "";
    return `Nao foi encontrado nenhum registro desse CREFITO${sourceText}.\n\nDeseja continuar o cadastro mesmo assim?`;
  }

  if (result.status === "invalid_format") {
    return "O formato do CREFITO esta invalido.\n\nDeseja continuar o cadastro mesmo assim?";
  }

  const fallbackMessage = result.message || "Nao foi possivel validar os CREFITOs agora.";
  return `${fallbackMessage}\n\nDeseja continuar o cadastro mesmo assim?`;
}

async function validateManagedProfileCrefito(app, options = {}) {
  const parsed = parseCrefitoInput($("crefitoInput")?.value ?? "");
  if (!parsed) {
    const result = rememberCrefitoValidation(app, {
      status: "invalid_format",
      message: "Formato invalido."
    });
    applyCrefitoLookupToForm(result, options);
    return result;
  }

  const validateButton = $("btnValidateCrefito");
  const typedName = String($("nomeFisioInput")?.value ?? "").trim();
  setCrefitoStatus("Consultando CREFITOs...", "info");
  if (validateButton) validateButton.disabled = true;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    const response = await fetch(CREFITO_LOCAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        crefito: parsed.raw,
        name: typedName || null
      }),
      signal: controller.signal
    });
    window.clearTimeout(timeoutId);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error ?? "Nao foi possivel consultar os CREFITOs agora."));
    }

    const result = rememberCrefitoValidation(app, normalizeCrefitoLookupResult(payload, parsed.raw));
    applyCrefitoLookupToForm(result, options);
    return result;
  } catch (error) {
    console.error("Erro ao validar CREFITO", error);
    const result = rememberCrefitoValidation(app, {
      status: "lookup_error",
      message: getReadableCrefitoLookupError(error)
    });
    applyCrefitoLookupToForm(result, options);
    return result;
  } finally {
    if (validateButton) validateButton.disabled = false;
  }
}

async function ensureManagedProfileCrefitoBeforeSave(app) {
  let result = getStoredCrefitoValidation(app);
  if (!result) {
    result = await validateManagedProfileCrefito(app, { allowNameAutofill: true });
  } else {
    applyCrefitoLookupToForm(result, { allowNameAutofill: true });
  }

  if (result.status === "active") return result;

  const shouldContinue = window.confirm(buildCrefitoProceedMessage(result));
  if (!shouldContinue) {
    throw new Error("Cadastro pausado para revisar o CREFITO informado.");
  }
  return result;
}

function setFisioFormStatus(message = "", variant = "") {
  const status = $("formFisioStatus");
  if (!status) return;
  status.textContent = message;
  status.className = "form-status";
  if (!message) {
    status.classList.add("hidden");
    return;
  }
  if (variant === "success") status.classList.add("form-status--success");
  if (variant === "error") status.classList.add("form-status--error");
}

function resetFisioForm(app = null) {
  const form = $("formFisio");
  if (form) form.reset();
  if (app) {
    app.editingManagedProfileId = null;
    app.editingManagedProfileAvatarUrl = "";
  }
  const emailInput = $("emailFisioInput");
  const passwordInput = $("senhaFisioInput");
  const submitButton = $("btnSubmitFisioForm");
  if (emailInput) {
    emailInput.disabled = false;
    emailInput.readOnly = false;
  }
  if (passwordInput) {
    passwordInput.disabled = false;
    passwordInput.required = true;
    passwordInput.placeholder = "Crie uma senha inicial";
    passwordInput.value = "";
  }
  if (submitButton) submitButton.textContent = "Salvar Cadastro";
  refreshManagedProfileAvatarPreview(app);
  resetManagedProfileCrefitoState(app, { clearStatus: true });
  setFisioFormStatus("");
}

function getEditingManagedProfile(app) {
  const editingId = String(app?.editingManagedProfileId ?? "").trim();
  if (!editingId) return null;
  const profiles = Array.isArray(app?.managedProfiles) ? app.managedProfiles : [];
  return profiles.find((profile) => String(profile?.id ?? "").trim() === editingId) ?? null;
}

function refreshManagedProfileAvatarPreview(app, profile = null) {
  const currentProfile = profile ?? getEditingManagedProfile(app);
  const displayName = String(currentProfile?.full_name ?? $("nomeFisioInput")?.value ?? "Paciente").trim() || "Paciente";
  const avatarUrl = String(
    currentProfile?.avatar_url
    ?? app?.editingManagedProfileAvatarUrl
    ?? ""
  ).trim();
  const preview = $("managedProfileAvatarPreview");
  const caption = $("managedProfileAvatarCaption");
  setAvatarElement(preview, displayName, avatarUrl);
  if (caption) {
    caption.textContent = avatarUrl
      ? "Foto atual do cadastro"
      : "Sem foto cadastrada";
  }
}

async function loadManagedProfileAvatarUrl(profileId) {
  const safeProfileId = String(profileId ?? "").trim();
  if (!safeProfileId) return "";
  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", safeProfileId)
    .single();
  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) return "";
    throw error;
  }
  return String(data?.avatar_url ?? "").trim();
}

function applyManagedProfileFormMode(app) {
  const editingProfile = getEditingManagedProfile(app);
  const context = getManagedProfileContext(app?.currentProfile?.role);
  const formTitle = $("fisioFormTitle");
  const formSubtitle = $("fisioFormSubtitle");
  const submitButton = $("btnSubmitFisioForm");
  const emailInput = $("emailFisioInput");
  const passwordInput = $("senhaFisioInput");

  if (formTitle) {
    formTitle.textContent = editingProfile
      ? `Editar ${context.childLabel}`
      : context.formTitle;
  }
  if (formSubtitle) {
    formSubtitle.textContent = editingProfile
      ? "Atualize os dados do acesso selecionado."
      : context.formSubtitle;
  }
  if (submitButton) {
    submitButton.textContent = editingProfile ? "Salvar Alteracoes" : "Salvar Cadastro";
  }
  if (emailInput) {
    emailInput.disabled = Boolean(editingProfile);
    emailInput.readOnly = Boolean(editingProfile);
  }
  if (passwordInput) {
    passwordInput.disabled = Boolean(editingProfile);
    passwordInput.required = !editingProfile;
    passwordInput.placeholder = editingProfile
      ? "Senha mantida na edicao"
      : "Crie uma senha inicial";
    if (editingProfile) passwordInput.value = "";
  }
  refreshManagedProfileAvatarPreview(app, editingProfile);
}

function fillManagedProfileFormForEdit(app, profile) {
  if (!profile) return;
  app.editingManagedProfileId = String(profile.id ?? "").trim();
  app.editingManagedProfileAvatarUrl = "";
  if ($("nomeFisioInput")) $("nomeFisioInput").value = String(profile.full_name ?? "");
  if ($("emailFisioInput")) $("emailFisioInput").value = getManagedProfileEmail(profile);
  if ($("senhaFisioInput")) $("senhaFisioInput").value = "";
  if ($("crefitoInput")) $("crefitoInput").value = String(profile.crefito ?? "");
  if ($("cepInput")) $("cepInput").value = String(profile.cep ?? "");
  if ($("ruaInput")) $("ruaInput").value = String(profile.street ?? "");
  if ($("numeroInput")) $("numeroInput").value = String(profile.address_number ?? "");
  if ($("complementoInput")) $("complementoInput").value = String(profile.address_complement ?? "");
  if ($("bairroInput")) $("bairroInput").value = String(profile.neighborhood ?? "");
  if ($("cidadeInput")) $("cidadeInput").value = String(profile.city ?? "");
  if ($("ufInput")) $("ufInput").value = String(profile.state ?? "");

  const modules = getManagedProfileModules(profile);
  renderManagedModuleOptions(app, modules);

  resetManagedProfileCrefitoState(app, { clearStatus: true });
  applyManagedProfileFormMode(app);
  refreshManagedProfileAvatarPreview(app, profile);
  setFisioFormStatus("");

  const profileId = String(profile.id ?? "").trim();
  if (!profileId) return;
  loadManagedProfileAvatarUrl(profileId)
    .then((avatarUrl) => {
      if (String(app.editingManagedProfileId ?? "").trim() !== profileId) return;
      app.editingManagedProfileAvatarUrl = avatarUrl;
      refreshManagedProfileAvatarPreview(app, { ...profile, avatar_url: avatarUrl });
    })
    .catch((error) => {
      console.error("Erro ao carregar foto do perfil gerenciado", error);
    });
}

function isManagedProfileActive(profile) {
  if (typeof profile?.is_active === "boolean") return profile.is_active;
  if (typeof profile?.active === "boolean") return profile.active;
  const status = String(profile?.status ?? "").trim().toLowerCase();
  if (status) return status !== "inactive" && status !== "inativo";
  return true;
}

function getManagedProfileEmail(profile) {
  return String(
    profile?.email
    ?? profile?.login_email
    ?? "Login criado com sucesso"
  ).trim();
}

function getManagedProfileCrefito(profile) {
  const raw = profile?.crefito ?? profile?.license_code;
  return String(raw ?? "").trim();
}

function getManagedProfileModules(profile) {
  const directModules = Array.isArray(profile?.allowed_modules) ? profile.allowed_modules : null;
  if (directModules && directModules.length > 0) return directModules;
  return [];
}

function getAvailableManagedModuleOptions(app) {
  const supabaseModules = getSupabaseBackedModules(app)
    .filter((module) => String(module?.status ?? "").trim().toLowerCase() === "published");
  const sourceModules = supabaseModules.length > 0 ? supabaseModules : getProtocolModules(app?.protocol);
  const options = [];
  const seen = new Set();

  for (const module of sourceModules) {
    const name = normalizeDashboardModuleName(module?.name ?? module?.slug ?? module?.flowId ?? module?.startFlowId ?? "");
    if (!name) continue;
    const key = slugifyText(name) || name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      key,
      value: name,
      label: name
    });
  }

  return options;
}

function getDefaultManagedModuleSelection(app) {
  const options = getAvailableManagedModuleOptions(app);
  const starter = options.find((option) => normalizeDashboardModuleName(option.value) === "Roteiro de Thompson");
  return starter ? [starter.value] : [];
}

function renderManagedModuleOptions(app, selectedModules = null) {
  const container = $("managedModulesOptions");
  if (!container) return;

  const options = getAvailableManagedModuleOptions(app);
  const selectedLookup = new Set(
    (Array.isArray(selectedModules) ? selectedModules : getDefaultManagedModuleSelection(app))
      .map((entry) => normalizeDashboardModuleName(entry))
      .filter(Boolean)
  );

  if (options.length === 0) {
    container.innerHTML = `<div class="muted">Nenhum modulo real disponivel para liberar no momento.</div>`;
    return;
  }

  container.innerHTML = options.map((option) => {
    const checked = selectedLookup.has(normalizeDashboardModuleName(option.value)) ? "checked" : "";
    return `
      <label class="checkbox-label">
        <input type="checkbox" data-managed-module-option value="${escapeHtml(option.value)}" ${checked}>
        ${escapeHtml(option.label)}
      </label>
    `;
  }).join("");
}

function getSelectedManagedModuleValues() {
  const selected = [];
  const seen = new Set();
  document
    .querySelectorAll('[data-managed-module-option]:checked')
    .forEach((input) => {
      const value = normalizeDashboardModuleName(input?.value ?? "");
      const key = slugifyText(value) || value.toLowerCase();
      if (!value || seen.has(key)) return;
      seen.add(key);
      selected.push(value);
    });
  return selected;
}

function getMissingManagedProfileColumnsMessage(error) {
  const message = String(error?.message ?? error ?? "");
  if (/column .* does not exist/i.test(message) || /schema cache/i.test(message)) {
    return "Falta concluir a configuracao necessaria para salvar todos os campos do cadastro.";
  }
  if (/save_managed_profile/i.test(message) && /function/i.test(message)) {
    return "Falta concluir a configuracao necessaria para salvar todos os campos do cadastro.";
  }
  if (/register_patient_device_login|list_managed_patient_login_history|release_managed_patient_device_lock|list_admin_security_notifications/i.test(message) && /function/i.test(message)) {
    return "Falta rodar o SQL novo no Supabase para ativar o controle de device e o historico de login.";
  }
  return "";
}

function getUserDisplayName(profile, user) {
  return String(
    profile?.full_name
    ?? user?.email?.split("@")[0]
    ?? "Usuario"
  ).trim();
}

function getUserAvatarUrl(profile, user) {
  return String(
    profile?.avatar_url
    ?? ""
  ).trim();
}

function getUserInitial(name) {
  const cleanName = String(name ?? "").trim();
  return cleanName ? cleanName.charAt(0).toUpperCase() : "U";
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function setAvatarElement(el, name, avatarUrl) {
  if (!el) return;
  const safeUrl = String(avatarUrl ?? "").trim();
  if (safeUrl) {
    el.innerHTML = `<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(name || "Avatar")}" />`;
    el.classList.add("avatar--image");
    return;
  }
  el.textContent = getUserInitial(name);
  el.classList.remove("avatar--image");
}

function getViewerProfileMetadata(user) {
  return {
    fullName: "",
    phone: "",
    clinic: "",
    bio: "",
    avatarUrl: ""
  };
}

function getOwnProfileViewCopy(role) {
  if (isFisioAdminRole(role)) {
    return {
      eyebrow: "Perfil profissional",
      title: "Ajuste seu perfil",
      subtitle: "Atualize sua foto e os dados que aparecem na sua area Fisiotosta.",
      cardHint: "Mantenha seu perfil profissional atualizado para personalizar melhor sua area de trabalho na Fisiotosta.",
      showNotifications: false
    };
  }

  return {
    eyebrow: "Seu perfil",
    title: "Atualize seus dados",
    subtitle: "Mantenha suas informacoes de atendimento e sua foto sempre atualizadas na Fisiotosta.",
    cardHint: "Ajuste seus dados de exibicao para deixar sua area Fisiotosta mais personalizada.",
    showNotifications: true
  };
}

function syncOwnProfileScreenCopy(app) {
  const copy = getOwnProfileViewCopy(app?.currentProfile?.role);
  if ($("viewerProfileEyebrow")) $("viewerProfileEyebrow").textContent = copy.eyebrow;
  if ($("viewerProfileTitle")) $("viewerProfileTitle").textContent = copy.title;
  if ($("viewerProfileSubtitle")) $("viewerProfileSubtitle").textContent = copy.subtitle;
  if ($("viewerProfileCardHint")) $("viewerProfileCardHint").textContent = copy.cardHint;
  const topbar = $("viewerProfileTopbar");
  if (topbar) topbar.classList.toggle("hidden", !copy.showNotifications);
}

async function loadOwnProfileDetails(app, options = {}) {
  const profileId = String(app?.currentUser?.id ?? "").trim();
  if (!profileId) return app?.currentProfile ?? null;

  const force = options.force === true;
  if (!force && String(app?.ownProfileDetailsLoadedFor ?? "").trim() === profileId) {
    return app?.currentProfile ?? null;
  }

  const extendedSelect = "full_name, login_email, crefito, phone, clinic_name, bio, avatar_url";
  const fallbackSelect = "full_name, login_email, crefito";

  let data = null;
  let error = null;

  const extendedResult = await supabase
    .from("profiles")
    .select(extendedSelect)
    .eq("id", profileId)
    .single();

  data = extendedResult.data;
  error = extendedResult.error;

  if (error && getMissingManagedProfileColumnsMessage(error)) {
    const fallbackResult = await supabase
      .from("profiles")
      .select(fallbackSelect)
      .eq("id", profileId)
      .single();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) throw error;

  app.currentProfile = {
    ...(app.currentProfile ?? {}),
    ...(data ?? {})
  };
  app.ownProfileDetailsLoadedFor = profileId;
  return app.currentProfile;
}

function preloadOwnProfileDetails(app) {
  loadOwnProfileDetails(app)
    .then(() => {
      applyAuthUi(app);
      if (app?.view === "viewer_profile") {
        syncOwnProfileScreenCopy(app);
        fillViewerProfileForm(app);
      }
      if (isFisioPacienteRole(app?.currentProfile?.role)) {
        syncViewerNotificationBadge(app);
      }
    })
    .catch((error) => {
      console.error("Erro ao pre-carregar perfil completo do usuario", error);
    });
}

function isViewerRuntimeView(app) {
  return isFisioPacienteRole(app?.currentProfile?.role)
    && (app?.view === "intro" || app?.view === "node");
}

function syncViewerRuntimeShell(app) {
  const appContainer = $("appContainer");
  const mainAdmin = $("mainAdmin");
  const isRuntime = isViewerRuntimeView(app);
  if (appContainer) appContainer.classList.toggle("app--viewer-runtime", isRuntime);
  if (mainAdmin) mainAdmin.classList.toggle("main--viewer-runtime", isRuntime);
}

function syncRuntimeIntroIdentity(app) {
  const homeTopline = $("homeTopline");
  if (!homeTopline) return;
  const displayName = getUserDisplayName(app?.currentProfile, app?.currentUser);
  const loginEmail = String(app?.currentProfile?.login_email ?? app?.currentUser?.email ?? "").trim();
  homeTopline.textContent = loginEmail
    ? `${displayName}, ${loginEmail}`
    : displayName;
}

let appToastHideTimer = 0;

function getCurrentRuntimeModule(app) {
  const modules = getModulesForView(app);
  const currentModuleId = String(app?.currentModuleId ?? "").trim();
  if (currentModuleId) {
    const explicitMatch = modules.find((module) => String(module?.id ?? "").trim() === currentModuleId);
    if (explicitMatch) return explicitMatch;
  }

  const activeFlowId = String(app?.session?.flowId ?? app?.selectedFlowId ?? "").trim();
  if (!activeFlowId) return null;

  return modules.find((module) => {
    const candidates = [
      module?.id,
      module?.slug,
      module?.flowId,
      module?.startFlowId
    ].map((value) => String(value ?? "").trim()).filter(Boolean);
    return candidates.includes(activeFlowId);
  }) ?? null;
}

function formatRuntimeModuleTitle(moduleName) {
  const normalized = normalizeDashboardModuleName(moduleName || "Modulo");
  const words = normalized.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return escapeHtml(words.join(" "));

  const lines = [];
  for (let index = 0; index < words.length; index += 2) {
    lines.push(words.slice(index, index + 2).join(" "));
  }
  return escapeHtml(lines.join("\n")).replace(/\n/g, "<br>");
}

function syncRuntimeIntroModule(app) {
  const homeTitle = $("homeTitle");
  if (!homeTitle) return;

  const activeModule = getCurrentRuntimeModule(app);
  const fallbackFlowId = String(app?.session?.flowId ?? app?.selectedFlowId ?? "").trim();
  const fallbackFlowName = fallbackFlowId
    ? String(app?.protocol?.flowsById?.[fallbackFlowId]?.name ?? "").trim()
    : "";
  const moduleName = normalizeDashboardModuleName(activeModule?.name ?? fallbackFlowName ?? "Roteiro de Thompson");

  homeTitle.innerHTML = formatRuntimeModuleTitle(moduleName);
}

function hideAppToast() {
  const toast = $("appToast");
  if (!toast) return;
  toast.classList.remove("app-toast--open");
  toast.classList.add("hidden");
  if (appToastHideTimer) {
    window.clearTimeout(appToastHideTimer);
    appToastHideTimer = 0;
  }
}

function showAppToast(message = "", tone = "success", options = {}) {
  const toast = $("appToast");
  if (!toast) return;

  const eyebrow = $("appToastEyebrow");
  const title = $("appToastTitle");
  const messageEl = $("appToastMessage");
  if (eyebrow) eyebrow.textContent = String(options.eyebrow ?? "Editor de modulos");
  if (title) title.textContent = String(options.title ?? "Tudo certo");
  if (messageEl) messageEl.textContent = String(message ?? "");

  toast.className = "app-toast";
  toast.classList.add(`app-toast--${tone}`);
  toast.classList.remove("hidden");
  requestAnimationFrame(() => toast.classList.add("app-toast--open"));

  if (appToastHideTimer) window.clearTimeout(appToastHideTimer);
  appToastHideTimer = window.setTimeout(() => {
    const currentToast = $("appToast");
    if (!currentToast) return;
    currentToast.classList.remove("app-toast--open");
    currentToast.classList.add("hidden");
    appToastHideTimer = 0;
  }, Number(options.durationMs ?? 3200));
}

function closeDeleteModuleModal(app) {
  app.pendingDeleteModuleId = null;
  const modal = $("deleteModuleModal");
  if (modal) modal.classList.add("hidden");
}

function openDeleteModuleModal(app, module) {
  if (!module) return;
  app.pendingDeleteModuleId = String(module.id ?? "");
  const modal = $("deleteModuleModal");
  if (!modal) return;
  const nameEl = $("deleteModuleModalName");
  const subtitleEl = $("deleteModuleModalSubtitle");
  if (nameEl) nameEl.textContent = normalizeDashboardModuleName(module.name || "Módulo");
  if (subtitleEl) {
    subtitleEl.textContent = "Essa ação remove o módulo da plataforma e não poderá ser desfeita.";
  }
  modal.classList.remove("hidden");
}

async function deleteModule(app, module) {
  if (!module) return;

  const flowIds = Array.isArray(module.flowIds) && module.flowIds.length > 0
    ? module.flowIds.map((flowId) => String(flowId ?? "").trim()).filter(Boolean)
    : [String(module.startFlowId ?? module.flowId ?? module.slug ?? module.id ?? "").trim()].filter(Boolean);

  if (app.authSession && (module.slug || module.flowId || module.startFlowId)) {
    await deleteSupabaseModuleBySlug(app, String(module.slug ?? module.flowId ?? module.startFlowId ?? "").trim());
  }

  if (Array.isArray(app.supabaseModules)) {
    const moduleId = String(module.id ?? "").trim();
    const moduleSlug = String(module.slug ?? module.flowId ?? module.startFlowId ?? "").trim();
    app.supabaseModules = app.supabaseModules.filter((row) => {
      const rowId = String(row?.id ?? "").trim();
      const rowSlug = String(row?.slug ?? row?.protocol_json?.id ?? "").trim();
      return rowId !== moduleId && rowSlug !== moduleSlug;
    });
  }

  const flowsById = { ...(app.protocol?.flowsById ?? {}) };
  const moduleBlueprints = { ...(app.protocol?.moduleBlueprints ?? {}) };
  for (const flowId of flowIds) {
    delete flowsById[flowId];
    delete moduleBlueprints[flowId];
  }
  const remainingFlowIds = Object.keys(flowsById);
  if (remainingFlowIds.length > 0) {
    const currentDefaultFlowId = String(app.protocol?.defaultFlowId ?? "").trim();
    const nextDefaultFlowId = flowsById[currentDefaultFlowId] ? currentDefaultFlowId : remainingFlowIds[0];
    app.protocol = normalizeProtocol({
      flowsById,
      defaultFlowId: nextDefaultFlowId,
      moduleBlueprints
    });
    saveProtocolToStorage(app.protocol);
  }

  if (String(app.currentModuleId ?? "").trim() === String(module.id ?? "").trim()) {
    app.currentModuleId = null;
  }
  if (String(app.selectedFlowId ?? "").trim() === String(module.startFlowId ?? module.flowId ?? "").trim()) {
    app.selectedFlowId = null;
  }
  app.view = "modulos";
  renderState(app);
  showAppToast("O módulo foi excluído com sucesso.", "success", {
    title: "Módulo excluído",
    eyebrow: "Biblioteca clínica"
  });
}

async function saveEditorModule(app) {
  app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
  const issues = getBuilderValidationIssues(app.builderDraft);
  renderBuilderValidation(app);
  if (issues.length > 0) {
    showAppToast(
      "Revise os pontos destacados no editor antes de salvar novamente.",
      "warning",
      { title: "Ajuste o modulo" }
    );
    return;
  }

  syncVisualDraftFromDom(app);
  const flow = buildFlowFromBuilderDraft(app.builderDraft);
  const flowsById = { ...(app.protocol?.flowsById ?? {}) };
  const moduleBlueprints = { ...(app.protocol?.moduleBlueprints ?? {}) };
  if (app.editorOriginalFlowId && app.editorOriginalFlowId !== flow.id) {
    delete flowsById[app.editorOriginalFlowId];
    delete moduleBlueprints[app.editorOriginalFlowId];
  }
  flowsById[flow.id] = flow;
  moduleBlueprints[flow.id] = normalizeModuleBlueprint(app.visualDraft);
  const defaultFlowId = app.protocol?.defaultFlowId && flowsById[app.protocol.defaultFlowId]
    ? app.protocol.defaultFlowId
    : flow.id;
  app.protocol = normalizeProtocol({
    flowsById,
    defaultFlowId,
    moduleBlueprints
  });
  if (app.authSession) {
    await upsertSupabaseModule(app, flow, app.visualDraft);
    if (app.editorOriginalFlowId && app.editorOriginalFlowId !== flow.id) {
      await deleteSupabaseModuleBySlug(app, app.editorOriginalFlowId);
    }
    await refreshSupabaseModules(app);
  }
  app.selectedFlowId = flow.id;
  app.currentModuleId = app.currentModuleId ?? flow.id;
  app.session = initSession(flow.id, flow.startNodeId);
  app.editorOriginalFlowId = flow.id;
  saveProtocolToStorage(app.protocol);
  showAppToast("Modulo salvo com sucesso!", "success", {
    title: normalizeDashboardModuleName(flow.name || "Modulo"),
    eyebrow: "Editor de modulos"
  });
  app.view = "modulos";
  renderState(app);
}

function setLoginError(message = "") {
  const loginError = $("loginError");
  if (!loginError) return;
  loginError.textContent = message || "E-mail ou senha incorretos.";
  loginError.style.display = message ? "block" : "none";
}

function getReadableAuthError(error) {
  const rawMessage = String(error?.message ?? error ?? "").trim();
  if (!rawMessage) return "Nao foi possivel entrar.";
  if (/acesso esta inativo|acesso está inativo/i.test(rawMessage)) {
    return "Seu acesso esta inativo no momento. Fale com o administrador responsavel.";
  }
  if (/dispositivo vinculado diferente do primeiro acesso/i.test(rawMessage)) {
    return "Dispositivo vinculado diferente do primeiro acesso. Favor entrar em contato com o fisioterapeuta para liberar um novo dispositivo.";
  }
  if (/invalid login credentials/i.test(rawMessage)) {
    return "Credenciais invalidas. Confira o e-mail e a senha cadastrados.";
  }
  if (/email not confirmed/i.test(rawMessage)) {
    return "O e-mail ainda nao foi confirmado.";
  }
  if (/database error querying schema/i.test(rawMessage)) {
    return "Erro ao consultar os dados.";
  }
  return rawMessage;
}

function getReadableRuntimeError(error, fallback = "Ocorreu um erro inesperado.") {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  const authMessage = String(error?.message ?? "").trim();
  if (authMessage) return authMessage;

  const nestedError = String(error?.error_description ?? error?.error ?? "").trim();
  if (nestedError) return nestedError;

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {}

  return fallback;
}

function applyAuthUi(app) {
  const role = String(app.currentProfile?.role ?? "fisio_paciente");
  const displayName = getUserDisplayName(app.currentProfile, app.currentUser);
  const avatarUrl = getUserAvatarUrl(app.currentProfile, app.currentUser);
  const sidebarRole = $("sidebarRole");
  const sidebarUserName = $("sidebarUserName");
  const sidebarUserMeta = $("sidebarUserMeta");
  const sidebarAvatar = $("sidebarAvatar");
  const navDashboard = $("navDashboard");
  const navFisios = $("navFisios");
  const navModulos = $("navModulos");
  const navPerfil = $("navPerfil");
  const viewerProfileShortcutName = $("viewerProfileShortcutName");
  const viewerProfileShortcutAvatar = $("viewerProfileShortcutAvatar");
  const adminSecurityNotificationsBtn = $("adminSecurityNotificationsBtn");
  const adminSecurityNotificationsLabel = $("adminSecurityNotificationsLabel");
  const adminSecurityNotificationsDot = adminSecurityNotificationsBtn?.querySelector(".sidebar__alert-dot");

  if (sidebarRole) sidebarRole.textContent = getRoleLabel(role);
  if (sidebarUserName) sidebarUserName.textContent = displayName;
  if (sidebarUserMeta) {
    sidebarUserMeta.textContent = getAccessMetaLabel(role);
  }
  setAvatarElement(sidebarAvatar, displayName, avatarUrl);
  if (navDashboard) navDashboard.classList.toggle("hidden", !canAccessDashboard(role));
  if (navFisios) navFisios.classList.toggle("hidden", !canManageProfiles(role));
  if (navModulos) navModulos.classList.toggle("hidden", isOwnerRole(role));
  if (navPerfil) navPerfil.classList.toggle("hidden", !canAccessOwnProfile(role));
  if (viewerProfileShortcutName) viewerProfileShortcutName.textContent = displayName;
  setAvatarElement(viewerProfileShortcutAvatar, displayName, avatarUrl);
  if (adminSecurityNotificationsBtn) {
    const canShowAdminSecurity = canManageProfiles(role);
    adminSecurityNotificationsBtn.classList.toggle("hidden", !canShowAdminSecurity);
    const pendingCount = Array.isArray(app.adminSecurityNotifications) ? app.adminSecurityNotifications.length : 0;
    if (adminSecurityNotificationsLabel) {
      adminSecurityNotificationsLabel.textContent = pendingCount === 0
        ? "Nenhum alerta novo"
        : pendingCount === 1
          ? "1 tentativa bloqueada"
          : `${pendingCount} tentativas bloqueadas`;
    }
    if (adminSecurityNotificationsDot) {
      adminSecurityNotificationsDot.classList.toggle("hidden", !hasUnreadAdminSecurityNotifications(app));
    }
  }
}

async function loadAuthContext() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data?.session ?? null;

  if (!session?.user) {
    return { session: null, user: null, profile: null };
  }

  // Keep login/session hydration lightweight so a large avatar or profile text
  // stored in managed fields does not block the patient from entering the app.
  const profileSelect = "id, full_name, role, parent_admin_id, login_email, crefito, is_active, allowed_modules";

  let profile = null;
  let profileError = null;

  const profileResult = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", session.user.id)
    .single();

  profile = profileResult.data;
  profileError = profileResult.error;

  if (profileError) throw profileError;
  return { session, user: session.user, profile };
}

async function ensureActiveAuthContext(authContext) {
  if (!authContext?.session || !authContext?.profile) return authContext;
  if (isManagedProfileActive(authContext.profile)) return authContext;

  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Erro ao encerrar sessao de perfil inativo", error);
  }

  throw new Error("Seu acesso esta inativo. Fale com o administrador responsavel.");
}

async function ensurePatientDeviceAccess(authContext) {
  if (!authContext?.session || !authContext?.profile) return authContext;
  if (!isFisioPacienteRole(authContext.profile?.role)) return authContext;

  const device = getCurrentDeviceDescriptor();
  const { data, error } = await supabase.rpc("register_patient_device_login", {
    p_device_id: device.id,
    p_device_label: device.label,
    p_device_kind: device.kind,
    p_user_agent: device.userAgent
  });

  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) throw new Error(missingColumnsMessage);
    throw error;
  }

  const allowed = Boolean(data?.allowed);
  if (allowed) {
    return {
      ...authContext,
      deviceInfo: device,
      deviceAccess: data
    };
  }

  try {
    await supabase.auth.signOut();
  } catch (signOutError) {
    console.error("Erro ao encerrar sessao apos bloqueio por device", signOutError);
  }

  throw new Error(String(
    data?.message
    ?? "Dispositivo vinculado diferente do primeiro acesso. Favor entrar em contato com o fisioterapeuta para liberar um novo dispositivo."
  ));
}

async function hydrateAuthenticatedApp(app) {
  if (!app?.authSession) return;

  try {
    await refreshSupabaseModules(app, { seedStarterForAdmin: true });
  } catch (error) {
    console.error("Erro ao carregar modulos apos autenticar", error);
    app.supabaseModules = [];
    app.hasLoadedSupabaseModules = false;
  }

  try {
    await loadManagedProfiles(app);
  } catch (error) {
    console.error("Erro ao carregar perfis gerenciados apos autenticar", error);
    app.managedProfiles = [];
  }

  try {
    await loadAdminSecurityNotifications(app);
  } catch (error) {
    console.error("Erro ao carregar notificacoes de seguranca", error);
    app.adminSecurityNotifications = [];
  }
  preloadOwnProfileDetails(app);
}

function buildModuleDescription(flowId) {
  if (flowId === "roteiro_thompsom") {
    return "Roteiro clinico Thompson pronto para uso na plataforma.";
  }
  return "Fluxo clinico criado pelo builder visual.";
}

function buildSupabaseModulePayload(app, flow, blueprint) {
  const normalizedBlueprint = normalizeModuleBlueprint(blueprint);
  return {
    owner_id: app.currentUser.id,
    slug: flow.id,
    name: flow.name,
    description: buildModuleDescription(flow.id),
    status: "published",
    protocol_json: {
      id: flow.id,
      name: flow.name,
      startNodeId: flow.startNodeId,
      nodesById: flow.nodesById
    },
    blueprint_json: normalizedBlueprint,
    cover_image_url: String(normalizedBlueprint?.branding?.coverImageUrl ?? "").trim()
  };
}

function mergeProtocolWithSupabaseModules(baseProtocol, rows, options = {}) {
  const replaceAll = Boolean(options.replaceAll);
  const flowsById = replaceAll ? {} : { ...(baseProtocol?.flowsById ?? {}) };
  const moduleBlueprints = replaceAll ? {} : { ...(baseProtocol?.moduleBlueprints ?? {}) };

  for (const row of Array.isArray(rows) ? rows : []) {
    const rawFlow = row?.protocol_json;
    if (!rawFlow || typeof rawFlow !== "object") continue;

    try {
      const flow = normalizeFlow({
        ...rawFlow,
        id: String(rawFlow.id ?? row.slug ?? ""),
        name: String(rawFlow.name ?? row.name ?? row.slug ?? "")
      });
      flowsById[flow.id] = flow;
      moduleBlueprints[flow.id] = normalizeModuleBlueprint(row.blueprint_json);
    } catch (err) {
      console.error("Falha ao normalizar modulo do Supabase", row?.slug, err);
    }
  }

  const flowIds = Object.keys(flowsById);
  if (flowIds.length === 0) return baseProtocol;

  const defaultFlowId = baseProtocol?.defaultFlowId && flowsById[baseProtocol.defaultFlowId]
    ? baseProtocol.defaultFlowId
    : (flowsById.roteiro_thompsom ? "roteiro_thompsom" : flowIds[0]);

  return normalizeProtocol({
    flowsById,
    defaultFlowId,
    moduleBlueprints
  });
}

async function loadSupabaseModuleRows() {
  const { data, error } = await supabase
    .from("modules")
    .select("id, owner_id, slug, name, description, status, protocol_json, blueprint_json, cover_image_url, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function upsertSupabaseModule(app, flow, blueprint) {
  if (!app.currentUser?.id) return null;
  const payload = buildSupabaseModulePayload(app, flow, blueprint);
  const { data, error } = await supabase
    .from("modules")
    .upsert(payload, { onConflict: "slug" })
    .select("id, owner_id, slug, name, description, status, protocol_json, blueprint_json, cover_image_url")
    .single();

  if (error) throw error;
  return data;
}

async function deleteSupabaseModuleBySlug(app, slug) {
  if (!app.currentUser?.id || !slug) return;
  const { error } = await supabase
    .from("modules")
    .delete()
    .eq("slug", slug)
    .eq("owner_id", app.currentUser.id);

  if (error) throw error;
}

async function refreshSupabaseModules(app, options = {}) {
  if (!app.authSession || !app.currentUser?.id) return [];

  let rows = await loadSupabaseModuleRows();
  const shouldSeedStarter = Boolean(options.seedStarterForAdmin) && isFisioAdminRole(app.currentProfile?.role);
  const hasStarter = rows.some((row) => String(row?.slug ?? "") === "roteiro_thompsom");

  if (shouldSeedStarter && !hasStarter && app.protocol?.flowsById?.roteiro_thompsom) {
    await upsertSupabaseModule(app, app.protocol.flowsById.roteiro_thompsom, getModuleBlueprint(app.protocol, "roteiro_thompsom"));
    rows = await loadSupabaseModuleRows();
  }

  app.supabaseModules = filterModulesForCurrentProfile(
    app,
    rows.map((row) => ({
      ...row,
      flowId: String(row?.protocol_json?.id ?? row?.slug ?? row?.id ?? ""),
      startFlowId: String(row?.protocol_json?.id ?? row?.slug ?? row?.id ?? "")
    }))
  ).map(({ flowId, startFlowId, ...row }) => row);
  app.hasLoadedSupabaseModules = true;
  app.protocol = mergeProtocolWithSupabaseModules(app.protocol, app.supabaseModules);
  if (app.protocol) saveProtocolToStorage(app.protocol);
  return app.supabaseModules;
}

async function loadProtocolFromUrl(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const raw = await res.json();
    return normalizeProtocol(raw);
  } catch {
    return null;
  }
}

function normalizeFlow(rawFlow) {
  if (!rawFlow || typeof rawFlow !== "object") throw new Error("Flow inválido.");

  const id = String(rawFlow.id ?? "");
  if (!id) throw new Error("Flow precisa de id.");

  const startNodeId = String(rawFlow.startNodeId ?? rawFlow.start ?? "");
  if (!startNodeId) throw new Error(`Flow ${id} precisa de startNodeId.`);

  const nodesById = normalizeNodesById(rawFlow.nodesById ?? rawFlow.nodes ?? rawFlow.nodeList);

  if (!nodesById[startNodeId]) throw new Error(`Flow ${id}: startNodeId não existe em nodesById (${startNodeId}).`);

  return {
    id,
    name: String(rawFlow.name ?? id),
    startNodeId,
    nodesById
  };
}

function normalizeNodesById(nodesLike) {
  if (!nodesLike) throw new Error("nodesById/nodes ausente.");

  const sanitizeNodeOptions = (node, options) => {
    if (!Array.isArray(options)) return options;

    const normalizedTitle = String(node?.title ?? "").toLowerCase();
    const normalizedBody = String(node?.body ?? "").toLowerCase();
    const isCervicalExtensionQuestion = normalizedTitle.includes("rotação cervical para direita e para a esquerda")
      && normalizedBody.includes("joelho em extensão");

    let nextOptions = options;

    if (isCervicalExtensionQuestion) {
      nextOptions = nextOptions
        .filter((opt) => !/occipital posterior/i.test(String(opt?.label ?? "")))
        .map((opt) => /perna neutra/i.test(String(opt?.label ?? "")) && !/resposta/i.test(String(opt?.label ?? ""))
          ? { ...opt, nextNodeId: "page_10" }
          : opt);
    }

    const isKneeFlexionQuestion = normalizedBody.includes("realizar a flexao do joelho")
      || normalizedBody.includes("realizar a flexão do joelho");

    if (isKneeFlexionQuestion) {
      nextOptions = nextOptions.filter((opt) => !/resposta/i.test(String(opt?.label ?? "")));
    }

    const isCervicalFlexionQuestion = normalizedTitle.includes("leg checking")
      && (normalizedBody.includes("rotacao cervical") || normalizedBody.includes("rotação cervical"))
      && (normalizedBody.includes("joelho em flexão") || normalizedBody.includes("joelho em flexao"));

    if (isCervicalFlexionQuestion) {
      nextOptions = nextOptions.filter((opt) => /^(perna neutra|perna curta)$/i.test(String(opt?.label ?? "").trim()));
    }

    return nextOptions;
  };

  const mapNode = (rawNode, forcedId) => {
    if (!rawNode || typeof rawNode !== "object") throw new Error("Node inválido.");
    const id = String(forcedId || rawNode.id || "");
    if (!id) throw new Error("Node sem id.");

    // Suporte ao schema em português
    const type = rawNode.type || rawNode.tipo || "orientacao";
    const title = rawNode.title || rawNode.texto || "";
    const body = rawNode.body || rawNode.descricao || "";
    const contentType = rawNode.contentType || rawNode.tipoConteudo || "text";
    const imageUrl = rawNode.imageUrl || rawNode.imagemUrl || rawNode.image || "";
    
    let options = rawNode.options || rawNode.opcoes;
    if (Array.isArray(options)) {
      options = options.map(opt => ({
        ...opt,
        label: opt.label || opt.texto || "Selecionar",
        nextNodeId: opt.nextNodeId || opt.proximo || "",
      }));
      options = sanitizeNodeOptions({ title, body }, options);
    }

    return { ...rawNode, id, type, title, body, contentType, imageUrl, options };
  };

  if (Array.isArray(nodesLike)) {
    const byId = {};
    for (const node of nodesLike) {
      const mapped = mapNode(node);
      if (byId[mapped.id]) throw new Error(`Node id duplicado: ${mapped.id}`);
      byId[mapped.id] = mapped;
    }
    return byId;
  }

  if (typeof nodesLike === "object") {
    const byId = {};
    for (const [id, node] of Object.entries(nodesLike)) {
      const mapped = mapNode(node, id);
      byId[mapped.id] = mapped;
    }
    return byId;
  }

  throw new Error("nodesById precisa ser um dicionário ou array.");
}

function normalizeProtocol(raw) {
  if (!raw || typeof raw !== "object") throw new Error("JSON inválido.");

  const moduleBlueprints = typeof raw.moduleBlueprints === "object" && raw.moduleBlueprints
    ? raw.moduleBlueprints
    : {};

  if (Array.isArray(raw.flows)) {
    const flowsById = {};
    for (const f of raw.flows) {
      const flow = normalizeFlow(f);
      if (flowsById[flow.id]) throw new Error(`Flow id duplicado: ${flow.id}`);
      flowsById[flow.id] = flow;
    }
    if (Object.keys(flowsById).length === 0) throw new Error("flows vazio.");
    return applyDefaultsToProtocol({ flowsById, defaultFlowId: Object.keys(flowsById)[0], moduleBlueprints });
  }

  if (raw.flowsById && typeof raw.flowsById === "object") {
    const flowsById = {};
    for (const [id, rawFlow] of Object.entries(raw.flowsById)) {
      const flow = normalizeFlow({ ...rawFlow, id });
      if (flowsById[flow.id]) throw new Error(`Flow id duplicado: ${flow.id}`);
      flowsById[flow.id] = flow;
    }
    if (Object.keys(flowsById).length === 0) throw new Error("flowsById vazio.");
    const defaultFlowId = String(raw.defaultFlowId ?? Object.keys(flowsById)[0]);
    return applyDefaultsToProtocol({
      flowsById,
      defaultFlowId: flowsById[defaultFlowId] ? defaultFlowId : Object.keys(flowsById)[0],
      moduleBlueprints
    });
  }

  if (raw.startNodeId || raw.nodesById || raw.nodes) {
    const flow = normalizeFlow({ ...raw, id: String(raw.id ?? "principal") });
    return applyDefaultsToProtocol({ flowsById: { [flow.id]: flow }, defaultFlowId: flow.id, moduleBlueprints });
  }

  throw new Error("Formato não reconhecido. Esperado flows[] ou flowsById, ou um flow único.");
}

function applyDefaultsToProtocol(protocol) {
  const flowsById = {};

  for (const flow of Object.values(protocol.flowsById)) {
    const nodesById = {};
    for (const [nodeId, node] of Object.entries(flow.nodesById)) {
      if (!node || typeof node !== "object") continue;
      const type = String(node.type ?? "").toLowerCase();
      if (type === "interpretation" || type === "interpretacao") {
        nodesById[nodeId] = {
          ...node,
          primaryActions: buildInterpretationActions(node.primaryActions, flow.startNodeId)
        };
      } else {
        nodesById[nodeId] = node;
      }
    }
    flowsById[flow.id] = { ...flow, nodesById };
  }

  return { ...protocol, flowsById, moduleBlueprints: protocol.moduleBlueprints ?? {} };
}

function buildInterpretationActions(existing, startNodeId) {
  const actions = Array.isArray(existing) ? [...existing] : [];
  const hasAction = (actionName) => actions.some((a) => String(a?.action ?? "") === actionName);

  if (!hasAction("mark_corrected")) actions.unshift({ label: "Corrigir", action: "mark_corrected" });
  if (!hasAction("restart_flow")) actions.push({ label: "Reavaliar", action: "restart_flow", targetNodeId: startNodeId });

  return actions;
}

function validateFlowGraph(flow) {
  const issues = [];
  const nodes = flow.nodesById;

  for (const [id, node] of Object.entries(nodes)) {
    if (!node.type) issues.push(`Node ${id}: type ausente.`);
    if (!node.title) issues.push(`Node ${id}: title ausente.`);

    const options = Array.isArray(node.options) ? node.options : [];
    for (const opt of options) {
      if (!opt || typeof opt !== "object") {
        issues.push(`Node ${id}: opção inválida.`);
        continue;
      }
      const next = String(opt.nextNodeId ?? "");
      if (!next) issues.push(`Node ${id}: opção sem nextNodeId.`);
      else if (!nodes[next]) issues.push(`Node ${id}: nextNodeId inexistente (${next}).`);
    }

    const actions = Array.isArray(node.primaryActions) ? node.primaryActions : [];
    for (const a of actions) {
      const action = String(a.action ?? "");
      if (!action) issues.push(`Node ${id}: primaryAction sem action.`);
      if ((action === "goto" || action === "restart_flow") && !a.targetNodeId) {
        issues.push(`Node ${id}: action ${action} sem targetNodeId.`);
      }
      if ((action === "goto" || action === "restart_flow") && a.targetNodeId && !nodes[a.targetNodeId]) {
        issues.push(`Node ${id}: targetNodeId inexistente (${a.targetNodeId}).`);
      }
    }
  }

  return issues;
}

function loadProtocolFromStorage() {
  const raw = localStorage.getItem(STORAGE.protocol);
  if (!raw) return null;
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) return null;
  try {
    return normalizeProtocol(parsed.value);
  } catch {
    return null;
  }
}

function saveProtocolToStorage(protocol) {
  try {
    localStorage.setItem(STORAGE.protocol, JSON.stringify(protocol));
  } catch (e) {
    console.error("Erro ao salvar protocolo", e);
  }
}

function loadSessionFromStorage() {
  const raw = localStorage.getItem(STORAGE.session);
  if (!raw) return null;
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) return null;
  return parsed.value;
}

function saveSessionToStorage(session) {
  localStorage.setItem(STORAGE.session, JSON.stringify(session));
}

function clearSessionStorage() {
  localStorage.removeItem(STORAGE.session);
}

function clearAllStorage() {
  localStorage.removeItem(STORAGE.protocol);
  localStorage.removeItem(STORAGE.session);
}

function initSession(flowId, startNodeId) {
  return {
    flowId,
    currentNodeId: startNodeId,
    path: [],
    answers: {}
  };
}

function chooseOption(protocol, session, option) {
  const flow = protocol.flowsById[session.flowId];
  const nextId = String(option.nextNodeId ?? "");
  if (!flow.nodesById[nextId]) throw new Error(`nextNodeId inválido: ${nextId}`);

  const currentId = session.currentNodeId;
  const currentNode = flow.nodesById[currentId];
  const entry = {
    nodeId: currentId,
    nodeTitle: String(currentNode?.title ?? currentId),
    chosenLabel: String(option.label ?? ""),
    chosenValue: option.value != null ? String(option.value) : undefined,
    at: now()
  };

  return {
    ...session,
    currentNodeId: nextId,
    path: [...session.path, entry]
  };
}

function goTo(protocol, session, nodeId, meta) {
  const flow = protocol.flowsById[session.flowId];
  if (!flow.nodesById[nodeId]) throw new Error(`nodeId inválido: ${nodeId}`);

  const currentId = session.currentNodeId;
  const currentNode = flow.nodesById[currentId];
  const entry = {
    nodeId: currentId,
    nodeTitle: String(currentNode?.title ?? currentId),
    chosenLabel: meta?.label ? String(meta.label) : undefined,
    chosenValue: meta?.value != null ? String(meta.value) : undefined,
    at: now()
  };

  return {
    ...session,
    currentNodeId: nodeId,
    path: [...session.path, entry]
  };
}

function back(protocol, session) {
  const flow = protocol.flowsById[session.flowId];
  if (session.path.length === 0) return session;
  const newPath = session.path.slice(0, -1);
  const previousNodeId = newPath.length === 0 ? flow.startNodeId : newPath[newPath.length - 1].nodeId;
  return { ...session, currentNodeId: previousNodeId, path: newPath };
}

function reset(protocol, session) {
  const flow = protocol.flowsById[session.flowId];
  return { ...session, currentNodeId: flow.startNodeId, path: [] };
}

function restartAt(protocol, session, nodeId) {
  const flow = protocol.flowsById[session.flowId];
  if (!flow.nodesById[nodeId]) throw new Error(`nodeId inválido: ${nodeId}`);
  return { ...session, currentNodeId: nodeId, path: [] };
}

function exitFlow(app) {
  clearSessionStorage();
  app.session = null;
  app.view = getExitFlowView(app.currentProfile?.role);
}

function setCheckpointValue(session, key, value) {
  return {
    ...session,
    answers: {
      ...session.answers,
      [key]: value
    }
  };
}

function slugifyText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createBuilderAnswer(label = "", nextNodeId = "") {
  return {
    id: `answer_${Math.random().toString(36).slice(2, 10)}`,
    label,
    nextNodeId
  };
}

function createBuilderNode(type, partial = {}) {
  const defaultTitle = type === "interpretacao" ? "Novo diagnóstico" : "Nova pergunta";
  return {
    id: partial.id ?? `${type === "interpretacao" ? "diagnostico" : "pergunta"}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: partial.title ?? defaultTitle,
    body: partial.body ?? "",
    contentType: ["image", "mixed"].includes(String(partial.contentType ?? "")) ? String(partial.contentType) : "text",
    imageUrl: String(partial.imageUrl ?? ""),
    answers: Array.isArray(partial.answers) ? partial.answers : []
  };
}

function ensureBuilderDraftConsistency(draft) {
  if (!draft || typeof draft !== "object") return createEmptyBuilderDraft();

  const nodes = Array.isArray(draft.nodes) ? draft.nodes : [];
  const normalizedNodes = nodes.map((node, idx) => {
    const type = node?.type === "interpretacao" ? "interpretacao" : "pergunta";
    const normalizedNode = createBuilderNode(type, {
      id: String(node?.id ?? `${type}_${idx + 1}`),
      title: String(node?.title ?? ""),
      body: String(node?.body ?? ""),
      contentType: String(node?.contentType ?? "text"),
      imageUrl: String(node?.imageUrl ?? ""),
      answers: type === "pergunta"
        ? (Array.isArray(node?.answers) ? node.answers.map((answer, answerIdx) => ({
          id: String(answer?.id ?? `${node?.id ?? `pergunta_${idx + 1}`}__answer_${answerIdx + 1}`),
          label: String(answer?.label ?? ""),
          nextNodeId: String(answer?.nextNodeId ?? "")
        })) : [])
        : []
    });
    return normalizedNode;
  });

  if (!normalizedNodes.some((node) => node.type === "pergunta")) {
    normalizedNodes.unshift(createBuilderNode("pergunta", {
      id: "pergunta_1",
      title: "Nova pergunta inicial",
      answers: []
    }));
  }

  const startCandidates = normalizedNodes.filter((node) => node.type === "pergunta");
  const startNodeId = startCandidates.some((node) => node.id === draft.startNodeId)
    ? draft.startNodeId
    : startCandidates[0].id;

  return {
    id: String(draft.id ?? "novo_modulo"),
    name: String(draft.name ?? "Novo Módulo"),
    startNodeId,
    nodes: normalizedNodes
  };
}

function createEmptyBuilderDraft() {
  const perguntaInicial = createBuilderNode("pergunta", {
    id: "pergunta_1",
    title: "Nova pergunta inicial",
    answers: []
  });

  return ensureBuilderDraftConsistency({
    id: "novo_modulo",
    name: "Novo Módulo",
    startNodeId: perguntaInicial.id,
    nodes: [perguntaInicial]
  });
}

function getBuilderDraftNode(draft, nodeId) {
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.nodes)) return null;
  return draft.nodes.find((node) => node.id === nodeId) ?? null;
}

function ensureBuilderSelection(app) {
  app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
  const availableIds = new Set(app.builderDraft.nodes.map((node) => node.id));
  if (!availableIds.has(app.selectedBuilderNodeId)) {
    app.selectedBuilderNodeId = app.builderDraft.startNodeId || app.builderDraft.nodes[0]?.id || null;
  }
  if (app.answerRoutingDraft) {
    const sourceNode = getBuilderDraftNode(app.builderDraft, app.answerRoutingDraft.nodeId);
    const answerExists = sourceNode?.answers?.some((answer) => answer.id === app.answerRoutingDraft.answerId);
    if (!answerExists) app.answerRoutingDraft = null;
  }
}

function getBuilderTargetLabel(draft, nextNodeId) {
  const nextNode = draft.nodes.find((node) => node.id === nextNodeId);
  return String(nextNode?.title ?? nextNodeId ?? "").trim() || "Sem destino";
}

function updateFlowBuilderStatus(app) {
  const status = $("flowBuilderStatus");
  if (!status) return;
  if (app.answerRoutingDraft) {
    const sourceNode = getBuilderDraftNode(app.builderDraft, app.answerRoutingDraft.nodeId);
    const answer = sourceNode?.answers?.find((item) => item.id === app.answerRoutingDraft.answerId);
    const answerLabel = String(answer?.label ?? "essa resposta").trim() || "essa resposta";
    status.textContent = `Definindo o proximo passo para "${answerLabel}".`;
    return;
  }
  status.textContent = "Clique em um card para editar a etapa. Clique em uma resposta para definir o próximo passo.";
}

function setBuilderSidebarOpen(app, isOpen) {
  app.isBuilderSidebarOpen = Boolean(isOpen);
  const sidebar = $("builderSidebar");
  if (sidebar) sidebar.classList.toggle("hidden", !app.isBuilderSidebarOpen);
}

function setBuilderViewMode(app, mode) {
  app.builderViewMode = mode === "advanced" ? "advanced" : "simple";
  const editor = $("screenEditor");
  const simpleSection = $("simpleBuilderSection");
  const advancedSection = $("advancedJsonSection");
  const toggleBtn = $("btnToggleLegacyBuilder");
  if (editor) {
    editor.classList.toggle("editor-mode-simple", app.builderViewMode === "simple");
    editor.classList.toggle("editor-mode-advanced", app.builderViewMode === "advanced");
  }
  if (simpleSection) simpleSection.classList.toggle("hidden", app.builderViewMode !== "advanced");
  if (advancedSection) advancedSection.classList.toggle("hidden", app.builderViewMode !== "advanced");
  if (toggleBtn) toggleBtn.textContent = app.builderViewMode === "advanced" ? "Modo Simples" : "Modo Avançado";
}

function closeBuilderRouteModal(app) {
  app.answerRoutingDraft = null;
  const modal = $("builderRouteModal");
  if (modal) modal.classList.add("hidden");
}

function refreshBuilderRouteModal(app) {
  const modal = $("builderRouteModal");
  if (!modal || !app.answerRoutingDraft) return;
  const routeMode = document.querySelector('input[name="builderRouteMode"]:checked')?.value ?? "create";
  const createFields = $("builderRouteCreateFields");
  const connectFields = $("builderRouteConnectFields");
  if (createFields) createFields.classList.toggle("hidden", routeMode !== "create");
  if (connectFields) connectFields.classList.toggle("hidden", routeMode !== "connect");

  const draft = ensureBuilderDraftConsistency(app.builderDraft);
  const sourceNode = getBuilderDraftNode(draft, app.answerRoutingDraft.nodeId);
  const answer = sourceNode?.answers?.find((item) => item.id === app.answerRoutingDraft.answerId);
  const answerLabel = String(answer?.label ?? "essa resposta").trim() || "essa resposta";
  const subtitle = $("builderRouteModalSubtitle");
  if (subtitle) subtitle.textContent = `Defina o próximo passo para "${answerLabel}".`;

  const titleInput = $("builderRouteCreateTitle");
  const createType = String($("builderRouteCreateType")?.value ?? "pergunta");
  if (titleInput && !titleInput.dataset.userEdited) {
    const count = draft.nodes.filter((node) => node.type === createType).length + 1;
    titleInput.value = createType === "interpretacao" ? `Resultado ${count}` : `Pergunta ${count}`;
  }

  const existingTarget = $("builderRouteExistingTarget");
  if (existingTarget) {
    const currentNext = String(answer?.nextNodeId ?? "");
    const options = draft.nodes
      .filter((node) => node.id !== app.answerRoutingDraft.nodeId)
      .map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === currentNext ? "selected" : ""}>${escapeHtml(node.title || node.id)} • ${node.type === "interpretacao" ? "Resultado" : "Pergunta"}</option>`)
      .join("");
    existingTarget.innerHTML = `<option value="">Selecione uma etapa</option>${options}`;
  }
}

function openBuilderRouteModal(app, nodeId, answerId) {
  app.answerRoutingDraft = { nodeId, answerId };
  const modal = $("builderRouteModal");
  if (!modal) return;
  const createRadio = document.querySelector('input[name="builderRouteMode"][value="create"]');
  if (createRadio) createRadio.checked = true;
  const titleInput = $("builderRouteCreateTitle");
  if (titleInput) {
    titleInput.dataset.userEdited = "";
    titleInput.value = "";
  }
  refreshBuilderRouteModal(app);
  modal.classList.remove("hidden");
}

function getBuilderReachability(draft) {
  const cleanDraft = ensureBuilderDraftConsistency(draft);
  const visited = new Set();
  const stack = [cleanDraft.startNodeId];
  const nodesById = Object.fromEntries(cleanDraft.nodes.map((node) => [node.id, node]));
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || visited.has(nodeId) || !nodesById[nodeId]) continue;
    visited.add(nodeId);
    const node = nodesById[nodeId];
    if (node.type === "pergunta") {
      for (const answer of node.answers) {
        if (answer.nextNodeId) stack.push(answer.nextNodeId);
      }
    }
  }
  return visited;
}

function getBuilderValidationIssues(draft) {
  const cleanDraft = ensureBuilderDraftConsistency(draft);
  const issues = [];
  const reachable = getBuilderReachability(cleanDraft);
  const nodesById = Object.fromEntries(cleanDraft.nodes.map((node) => [node.id, node]));

  for (const node of cleanDraft.nodes) {
    if (node.type !== "pergunta") continue;
    if (!Array.isArray(node.answers) || node.answers.length === 0) {
      issues.push(`A pergunta "${node.title}" precisa ter pelo menos uma resposta.`);
    }
    for (const answer of node.answers) {
      if (!String(answer.label ?? "").trim()) {
        issues.push(`A pergunta "${node.title}" possui resposta sem texto.`);
      }
      if (!String(answer.nextNodeId ?? "").trim()) {
        issues.push(`A pergunta "${node.title}" possui resposta sem próximo passo.`);
      }
    }
  }

  const unreachableNodes = cleanDraft.nodes.filter((node) => !reachable.has(node.id));
  if (unreachableNodes.length > 0) {
    issues.push("Existem etapas fora do caminho principal.");
  }

  const memo = new Map();
  const visiting = new Set();
  function hasResultPath(nodeId) {
    if (memo.has(nodeId)) return memo.get(nodeId);
    if (visiting.has(nodeId)) return false;
    const node = nodesById[nodeId];
    if (!node) return false;
    if (node.type === "interpretacao") {
      memo.set(nodeId, true);
      return true;
    }
    visiting.add(nodeId);
    const answers = Array.isArray(node.answers) ? node.answers : [];
    const result = answers.length > 0 && answers.some((answer) => answer.nextNodeId && hasResultPath(answer.nextNodeId));
    visiting.delete(nodeId);
    memo.set(nodeId, result);
    return result;
  }

  if (!hasResultPath(cleanDraft.startNodeId)) {
    issues.push("Existe fluxo sem saída final.");
  }

  return Array.from(new Set(issues));
}

function getBuilderPathSummaries(draft, maxPaths = 6) {
  const cleanDraft = ensureBuilderDraftConsistency(draft);
  const nodesById = Object.fromEntries(cleanDraft.nodes.map((node) => [node.id, node]));
  const summaries = [];

  function walk(nodeId, segments, visited) {
    if (summaries.length >= maxPaths || visited.has(nodeId)) return;
    const node = nodesById[nodeId];
    if (!node) return;
    if (node.type === "interpretacao") {
      summaries.push([...segments, node.title].filter(Boolean).join(" -> "));
      return;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    for (const answer of node.answers) {
      if (!answer.nextNodeId) continue;
      walk(answer.nextNodeId, [...segments, answer.label], nextVisited);
      if (summaries.length >= maxPaths) break;
    }
  }

  walk(cleanDraft.startNodeId, [], new Set());
  return summaries;
}

function renderBuilderValidation(app) {
  const issues = getBuilderValidationIssues(app.builderDraft);
  const wrap = $("builderValidationList");
  if (!wrap) return issues;
  wrap.innerHTML = "";
  wrap.classList.toggle("hidden", issues.length === 0);
  for (const issue of issues) {
    const item = document.createElement("div");
    item.className = "builder-validation__item";
    item.textContent = `⚠ ${issue}`;
    wrap.appendChild(item);
  }
  return issues;
}

function renderBuilderPathPreview(app) {
  const wrap = $("builderPathPreview");
  if (!wrap) return;
  const paths = getBuilderPathSummaries(app.builderDraft);
  wrap.innerHTML = "";
  if (paths.length === 0) {
    wrap.innerHTML = `<div class="builder-path-preview__empty">Conecte as etapas para visualizar os caminhos finais do módulo.</div>`;
    return;
  }
  for (const path of paths) {
    const item = document.createElement("div");
    item.className = "builder-path-preview__item";
    item.textContent = path;
    wrap.appendChild(item);
  }
}

function getBuilderDraftVisualGraph(draft) {
  const cleanDraft = ensureBuilderDraftConsistency(draft);
  const nodesById = Object.fromEntries(cleanDraft.nodes.map((node) => [node.id, node]));
  const orderedNodes = [];
  const visited = new Set();
  const queue = [];
  const levels = {};
  const edges = [];
  const startNodeId = cleanDraft.startNodeId;

  if (startNodeId && nodesById[startNodeId]) {
    queue.push(startNodeId);
    levels[startNodeId] = 0;
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId) || !nodesById[nodeId]) continue;
    visited.add(nodeId);
    orderedNodes.push(nodesById[nodeId]);

    const node = nodesById[nodeId];
    const nodeLevel = levels[nodeId] ?? 0;
    for (const answer of Array.isArray(node.answers) ? node.answers : []) {
      const nextNodeId = String(answer?.nextNodeId ?? "");
      if (!nextNodeId || !nodesById[nextNodeId]) continue;
      edges.push({
        from: nodeId,
        to: nextNodeId,
        label: String(answer?.label ?? "Resposta"),
        kind: "option"
      });
      if (levels[nextNodeId] == null || levels[nextNodeId] > nodeLevel + 1) {
        levels[nextNodeId] = nodeLevel + 1;
      }
      if (!visited.has(nextNodeId)) queue.push(nextNodeId);
    }
  }

  let fallbackLevel = Object.values(levels).reduce((max, level) => Math.max(max, level), 0) + 1;
  for (const node of cleanDraft.nodes) {
    if (visited.has(node.id)) continue;
    levels[node.id] = fallbackLevel;
    orderedNodes.push(node);
    fallbackLevel += 1;
  }

  return { orderedNodes, levels, edges };
}

function fillBuilderInspector(app) {
  ensureBuilderSelection(app);
  const emptyState = $("builderInspectorEmpty");
  const panel = $("builderInspectorPanel");
  const answersSection = $("builderSelectedAnswersSection");
  const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);

  if (!node) {
    if (emptyState) emptyState.classList.remove("hidden");
    if (panel) panel.classList.add("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");
  if (panel) panel.classList.remove("hidden");

  if ($("builderSelectedNodeId")) $("builderSelectedNodeId").value = node.id;
  if ($("builderSelectedNodeType")) $("builderSelectedNodeType").value = node.type;
  if ($("builderSelectedNodeTitle")) $("builderSelectedNodeTitle").value = node.title ?? "";
  if ($("builderSelectedContentType")) $("builderSelectedContentType").value = node.contentType ?? "text";
  if ($("builderSelectedNodeImageUrl")) $("builderSelectedNodeImageUrl").value = node.imageUrl ?? "";
  if ($("builderSelectedNodeBody")) $("builderSelectedNodeBody").value = node.body ?? "";
  const imagePreviewWrap = $("builderNodeImagePreviewWrap");
  const imagePreview = $("builderNodeImagePreview");
  const imageUrl = String(node.imageUrl ?? "").trim();
  const contentType = ["image", "mixed"].includes(String(node.contentType ?? "")) ? String(node.contentType) : "text";
  const showsImageFields = contentType === "image" || contentType === "mixed";
  const showsBodyField = contentType !== "image";
  if (imagePreview) imagePreview.src = imageUrl;
  if (imagePreviewWrap) imagePreviewWrap.classList.toggle("hidden", !imageUrl);
  if ($("builderNodeImageUrlGroup")) $("builderNodeImageUrlGroup").classList.toggle("hidden", !showsImageFields);
  if ($("builderNodeBodyGroup")) $("builderNodeBodyGroup").classList.toggle("hidden", !showsBodyField);

  const setStartBtn = $("btnSetSelectedAsStart");
  if (setStartBtn) {
    const isStart = node.id === app.builderDraft.startNodeId;
    setStartBtn.textContent = isStart ? "Bloco Inicial" : "Definir como Início";
    setStartBtn.disabled = isStart || node.type !== "pergunta";
  }

  if (answersSection) answersSection.classList.toggle("hidden", node.type !== "pergunta");

  const answersList = $("builderSelectedAnswersList");
  if (!answersList) return;
  answersList.innerHTML = "";

  if (node.type !== "pergunta") return;

  const targetOptions = app.builderDraft.nodes
    .map((targetNode) => `<option value="${escapeHtml(targetNode.id)}">${escapeHtml(targetNode.title || targetNode.id)} • ${targetNode.type === "interpretacao" ? "Resultado" : "Pergunta"}</option>`)
    .join("");

  node.answers.forEach((answer, idx) => {
    const row = document.createElement("div");
    row.className = "flow-editor-answer-row";
    row.innerHTML = `
      <div class="row row--between">
        <strong>Resposta ${idx + 1}</strong>
        <button class="btn btn--ghost btn--sm" type="button" data-action="remove-builder-answer" data-node-id="${escapeHtml(node.id)}" data-answer-id="${escapeHtml(answer.id)}" style="flex: 0;">Remover</button>
      </div>
      <div class="input-group" style="margin-bottom: 0;">
        <label class="label">Texto da resposta</label>
        <input type="text" class="input-text" data-inspector-field="answerLabel" data-node-id="${escapeHtml(node.id)}" data-answer-id="${escapeHtml(answer.id)}" value="${escapeHtml(answer.label)}" />
      </div>
      <div class="input-group" style="margin-bottom: 0;">
        <label class="label">Próximo passo</label>
        <select class="input-text" data-inspector-field="answerNextNodeId" data-node-id="${escapeHtml(node.id)}" data-answer-id="${escapeHtml(answer.id)}">
          <option value="">Selecione</option>
          ${targetOptions.replace(`value="${escapeHtml(answer.nextNodeId)}"`, `value="${escapeHtml(answer.nextNodeId)}" selected`)}
        </select>
      </div>
      <div class="builder-actions">
        <button class="btn btn--ghost btn--sm" type="button" data-action="begin-builder-connection" data-node-id="${escapeHtml(node.id)}" data-answer-id="${escapeHtml(answer.id)}" style="flex: 0;">Definir próximo passo</button>
      </div>
    `;
    answersList.appendChild(row);
  });
}

function renderBuilderFlowEditor(app) {
  ensureBuilderSelection(app);
  const host = $("builderFlowCanvas");
  if (!host) return;

  const draft = ensureBuilderDraftConsistency(app.builderDraft);
  const { orderedNodes } = getBuilderDraftVisualGraph(draft);
  if (orderedNodes.length === 0) {
    host.innerHTML = `<div class="flow-empty">Esse módulo ainda não possui blocos para editar.</div>`;
    updateFlowBuilderStatus(app);
    return;
  }
  host.innerHTML = `<div class="timeline-builder"></div>`;
  const timeline = host.querySelector(".timeline-builder");
  if (!timeline) return;

  let questionCount = 0;
  let resultCount = 0;
  for (const node of orderedNodes) {
    const isQuestion = node.type === "pergunta";
    if (isQuestion) questionCount += 1;
    else resultCount += 1;
    const isStart = node.id === draft.startNodeId;
    const isSelected = node.id === app.selectedBuilderNodeId;
    const bodyText = String(node.body ?? "").trim();
    const contentType = ["image", "mixed"].includes(String(node.contentType ?? "")) ? String(node.contentType) : "text";
    const imageUrl = String(node.imageUrl ?? "").trim();
    const shouldShowImage = imageUrl && (contentType === "image" || contentType === "mixed");
    const shouldShowText = contentType !== "image";
    const answersHtml = isQuestion
      ? (Array.isArray(node.answers) ? node.answers : []).map((answer) => {
          const targetLabel = answer.nextNodeId
            ? `Proximo passo: ${escapeHtml(getBuilderTargetLabel(draft, answer.nextNodeId))}`
            : "Defina o proximo passo";
          return `
            <button class="timeline-step__answer" type="button" data-action="open-answer-routing" data-node-id="${escapeHtml(node.id)}" data-answer-id="${escapeHtml(answer.id)}">
              <span class="timeline-step__answer-copy">
                <span class="timeline-step__answer-label">${escapeHtml(answer.label || "Opcao sem texto")}</span>
                <span class="timeline-step__answer-target">${targetLabel}</span>
              </span>
            </button>
          `;
        }).join("")
      : `
        <div class="timeline-step__result-actions">
          <span class="timeline-step__result-chip">Corrigir</span>
          <span class="timeline-step__result-chip">Reavaliar</span>
        </div>
      `;

    const card = document.createElement("article");
    card.className = `timeline-step ${isQuestion ? "timeline-step--question" : "timeline-step--result"} ${isSelected ? "timeline-step--selected" : ""}`;
    card.setAttribute("data-node-id", node.id);
    card.innerHTML = `
      <div class="timeline-step__head">
        <span class="timeline-step__badge">${isQuestion ? "Pergunta" : "Resultado"}</span>
        <span class="timeline-step__subtitle">${isStart ? "Etapa inicial" : (isQuestion ? `Pergunta ${questionCount}` : `Resultado ${resultCount}`)}</span>
      </div>
      ${shouldShowImage ? `<img class="timeline-step__media" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(node.title || "Imagem da etapa")}" />` : ""}
      <h3 class="timeline-step__title">${escapeHtml(node.title || (isQuestion ? "Nova pergunta" : "Novo resultado")).replace(/\n/g, "<br>")}</h3>
      ${shouldShowText && bodyText ? `<div class="timeline-step__body">${escapeHtml(bodyText).replace(/\n/g, "<br>")}</div>` : ""}
      <div class="timeline-step__answers">${answersHtml}</div>
      <div class="timeline-step__footer">
        ${app.builderViewMode === "advanced" ? `<span class="timeline-step__meta">ID: ${escapeHtml(node.id)}</span>` : `<span class="timeline-step__meta">${isQuestion ? "Clique no card para editar a etapa" : "Resultado final do caminho"}</span>`}
        ${isQuestion ? `<button class="timeline-step__action" type="button" data-action="add-builder-answer" data-node-id="${escapeHtml(node.id)}">Adicionar Resposta</button>` : ""}
      </div>
    `;
    timeline.appendChild(card);
  }

  updateFlowBuilderStatus(app);
  requestAnimationFrame(() => {
    const selectedCard = host.querySelector(".timeline-step--selected");
    if (selectedCard) {
      selectedCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

function renderBuilderWorkspace(app) {
  ensureBuilderSelection(app);
  renderBuilderNodes(app);
  fillBuilderInspector(app);
  renderBuilderFlowEditor(app);
  setBuilderSidebarOpen(app, app.isBuilderSidebarOpen);
  renderBuilderValidation(app);
  renderBuilderPathPreview(app);
  setBuilderViewMode(app, app.builderViewMode);
  syncBuilderJsonPreview(app);
  renderVisualPreview(app);
}

function createDefaultModuleBlueprint() {
  return {
    page: {
      backgroundColor: "#f5f4ee",
      backgroundImage: "",
      backgroundSize: "cover",
      fontFamily: "Arial, sans-serif",
      textColor: "#0f172a"
    },
    blocks: {
      questionBg: "#a9cf8b",
      questionText: "#111111",
      answerBg: "#f0c89c",
      answerText: "#111111",
      diagnosisBg: "#d9d9d9",
      diagnosisText: "#111111"
    },
    branding: {
      iconUrl: "",
      coverImageUrl: ""
    }
  };
}

function normalizeModuleBlueprint(raw) {
  const defaults = createDefaultModuleBlueprint();
  return {
    page: {
      ...defaults.page,
      ...(raw?.page ?? {})
    },
    blocks: {
      ...defaults.blocks,
      ...(raw?.blocks ?? {})
    },
    branding: {
      ...defaults.branding,
      ...(raw?.branding ?? {})
    }
  };
}

function getModuleBlueprint(protocol, flowId) {
  return normalizeModuleBlueprint(protocol?.moduleBlueprints?.[flowId]);
}

function syncVisualDraftFromDom(app) {
  app.visualDraft = normalizeModuleBlueprint({
    page: {
      backgroundColor: $("visualBackgroundColor")?.value ?? "#f5f4ee",
      backgroundImage: String($("visualBackgroundImage")?.value ?? "").trim(),
      backgroundSize: String($("visualBackgroundSize")?.value ?? "cover"),
      fontFamily: String($("visualFontFamily")?.value ?? "Arial, sans-serif"),
      textColor: $("visualTextColor")?.value ?? "#0f172a"
    },
    blocks: {
      questionBg: $("visualQuestionBg")?.value ?? "#a9cf8b",
      questionText: $("visualQuestionText")?.value ?? "#111111",
      answerBg: $("visualAnswerBg")?.value ?? "#f0c89c",
      answerText: $("visualAnswerText")?.value ?? "#111111",
      diagnosisBg: $("visualDiagnosisBg")?.value ?? "#d9d9d9",
      diagnosisText: $("visualDiagnosisText")?.value ?? "#111111"
    },
    branding: {
      iconUrl: String($("visualIconUrl")?.value ?? "").trim(),
      coverImageUrl: String($("visualCoverImageUrl")?.value ?? "").trim()
    }
  });
  return app.visualDraft;
}

function renderVisualPreview(app) {
  const draft = ensureBuilderDraftConsistency(app.builderDraft ?? createEmptyBuilderDraft());
  const blueprint = normalizeModuleBlueprint(app.visualDraft);
  const preview = $("visualPreviewCanvas");
  if (!preview) return;

  const questionNode = draft.nodes.find((node) => node.type === "pergunta");
  const diagnosisNode = draft.nodes.find((node) => node.type === "interpretacao");
  const answers = Array.isArray(questionNode?.answers) ? questionNode.answers : [];

  preview.style.backgroundColor = blueprint.page.backgroundColor;
  preview.style.backgroundImage = blueprint.page.backgroundImage ? `url("${blueprint.page.backgroundImage}")` : "none";
  preview.style.backgroundSize = blueprint.page.backgroundImage ? blueprint.page.backgroundSize : "auto";
  preview.style.backgroundPosition = "center";
  preview.style.fontFamily = blueprint.page.fontFamily;
  preview.style.color = blueprint.page.textColor;

  const icon = $("visualPreviewIcon");
  const cover = $("visualPreviewCover");
  const art = $("visualPreviewArt");
  const coverImageUrl = String(blueprint.branding.coverImageUrl ?? "").trim();
  if (cover) {
    cover.src = coverImageUrl;
    cover.classList.toggle("hidden", !coverImageUrl);
  }
  if (icon) {
    const iconUrl = String(blueprint.branding.iconUrl ?? "").trim();
    icon.src = iconUrl;
    icon.classList.toggle("hidden", !iconUrl || Boolean(coverImageUrl));
  }
  if (art) art.classList.toggle("visual-preview__art--cover", Boolean(coverImageUrl));

  const moduleName = $("visualPreviewModuleName");
  if (moduleName) moduleName.textContent = String(draft.name ?? "Novo Modulo");

  const questionBox = $("visualPreviewQuestion");
  if (questionBox) {
    questionBox.style.background = blueprint.blocks.questionBg;
    questionBox.style.color = blueprint.blocks.questionText;
    const questionImage = $("visualPreviewQuestionImage");
    const questionImageUrl = String(questionNode?.imageUrl ?? "").trim();
    const questionContentType = String(questionNode?.contentType ?? "text");
    const showQuestionImage = questionImageUrl && (questionContentType === "image" || questionContentType === "mixed");
    if (questionImage) {
      questionImage.src = questionImageUrl;
      questionImage.classList.toggle("hidden", !showQuestionImage);
    }
    const text = questionBox.querySelector(".visual-preview__text");
    if (text) {
      text.textContent = String(questionNode?.title ?? "Sua pergunta principal aparece aqui");
      text.classList.toggle("hidden", questionContentType === "image");
    }
  }

  const answerA = $("visualPreviewAnswerA");
  const answerB = $("visualPreviewAnswerB");
  [answerA, answerB].forEach((el, idx) => {
    if (!el) return;
    el.style.background = blueprint.blocks.answerBg;
    el.style.color = blueprint.blocks.answerText;
    el.textContent = String(answers[idx]?.label ?? `Resposta ${idx + 1}`);
  });

  const diagnosis = $("visualPreviewDiagnosis");
  if (diagnosis) {
    diagnosis.style.background = blueprint.blocks.diagnosisBg;
    diagnosis.style.color = blueprint.blocks.diagnosisText;
    const diagnosisImage = $("visualPreviewDiagnosisImage");
    const diagnosisImageUrl = String(diagnosisNode?.imageUrl ?? "").trim();
    const diagnosisContentType = String(diagnosisNode?.contentType ?? "text");
    const showDiagnosisImage = diagnosisImageUrl && (diagnosisContentType === "image" || diagnosisContentType === "mixed");
    if (diagnosisImage) {
      diagnosisImage.src = diagnosisImageUrl;
      diagnosisImage.classList.toggle("hidden", !showDiagnosisImage);
    }
    const text = diagnosis.querySelector(".visual-preview__diagnosis-text");
    if (text) {
      text.textContent = String(diagnosisNode?.title ?? "Seu diagnostico final aparece aqui");
      text.classList.toggle("hidden", diagnosisContentType === "image");
    }
  }
}

function applyRuntimeModuleBlueprint(protocol, flowId) {
  const blueprint = getModuleBlueprint(protocol, flowId);
  const screenNode = $("screenNode");
  if (screenNode) {
    screenNode.style.backgroundColor = blueprint.page.backgroundColor;
    screenNode.style.backgroundImage = blueprint.page.backgroundImage ? `url("${blueprint.page.backgroundImage}")` : "none";
    screenNode.style.backgroundSize = blueprint.page.backgroundImage ? blueprint.page.backgroundSize : "auto";
    screenNode.style.backgroundPosition = "center";
    screenNode.style.fontFamily = blueprint.page.fontFamily;
    screenNode.style.color = blueprint.page.textColor;
  }

  const nodeCard = $("nodeCard");
  if (nodeCard) {
    nodeCard.style.color = blueprint.page.textColor;
  }

  return blueprint;
}

function fillVisualEditor(app) {
  const blueprint = normalizeModuleBlueprint(app.visualDraft ?? createDefaultModuleBlueprint());
  app.visualDraft = blueprint;

  if ($("visualBackgroundColor")) $("visualBackgroundColor").value = blueprint.page.backgroundColor;
  if ($("visualBackgroundImage")) $("visualBackgroundImage").value = blueprint.page.backgroundImage;
  if ($("visualBackgroundSize")) $("visualBackgroundSize").value = blueprint.page.backgroundSize;
  if ($("visualFontFamily")) $("visualFontFamily").value = blueprint.page.fontFamily;
  if ($("visualTextColor")) $("visualTextColor").value = blueprint.page.textColor;
  if ($("visualQuestionBg")) $("visualQuestionBg").value = blueprint.blocks.questionBg;
  if ($("visualQuestionText")) $("visualQuestionText").value = blueprint.blocks.questionText;
  if ($("visualAnswerBg")) $("visualAnswerBg").value = blueprint.blocks.answerBg;
  if ($("visualAnswerText")) $("visualAnswerText").value = blueprint.blocks.answerText;
  if ($("visualDiagnosisBg")) $("visualDiagnosisBg").value = blueprint.blocks.diagnosisBg;
  if ($("visualDiagnosisText")) $("visualDiagnosisText").value = blueprint.blocks.diagnosisText;
  if ($("visualIconUrl")) $("visualIconUrl").value = blueprint.branding.iconUrl;
  if ($("visualCoverImageUrl")) $("visualCoverImageUrl").value = blueprint.branding.coverImageUrl;

  renderVisualPreview(app);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlSize(dataUrl) {
  const value = String(dataUrl ?? "");
  const commaIndex = value.indexOf(",");
  const base64 = commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Nao foi possivel processar essa imagem."));
    };
    image.src = objectUrl;
  });
}

async function readAvatarFileAsOptimizedDataUrl(file) {
  if (!file || !String(file.type ?? "").startsWith("image/")) {
    throw new Error("Selecione uma imagem valida para a foto de perfil.");
  }

  const image = await loadImageFromFile(file);
  const maxDimension = 960;
  const targetBytes = 360 * 1024;
  const hardLimitBytes = 700 * 1024;
  const minQuality = 0.5;
  const qualityStep = 0.08;
  const scaleStep = 0.85;

  let width = image.naturalWidth || image.width || maxDimension;
  let height = image.naturalHeight || image.height || maxDimension;
  if (width <= 0 || height <= 0) {
    throw new Error("Nao foi possivel ler o tamanho da imagem.");
  }

  const initialScale = Math.min(1, maxDimension / Math.max(width, height));
  width = Math.max(1, Math.round(width * initialScale));
  height = Math.max(1, Math.round(height * initialScale));

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Seu navegador nao conseguiu preparar a imagem.");
  }

  const render = (nextWidth, nextHeight) => {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    context.clearRect(0, 0, nextWidth, nextHeight);
    context.drawImage(image, 0, 0, nextWidth, nextHeight);
  };

  render(width, height);

  let bestDataUrl = "";
  let bestSize = Number.POSITIVE_INFINITY;
  let currentWidth = width;
  let currentHeight = height;

  for (let pass = 0; pass < 6; pass += 1) {
    render(currentWidth, currentHeight);
    for (let quality = 0.92; quality >= minQuality; quality -= qualityStep) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const size = estimateDataUrlSize(dataUrl);
      if (size < bestSize) {
        bestSize = size;
        bestDataUrl = dataUrl;
      }
      if (size <= targetBytes) return dataUrl;
    }
    currentWidth = Math.max(320, Math.round(currentWidth * scaleStep));
    currentHeight = Math.max(320, Math.round(currentHeight * scaleStep));
  }

  if (bestDataUrl && bestSize <= hardLimitBytes) return bestDataUrl;
  throw new Error("Essa foto ainda ficou pesada. Tente outra imagem ou corte um pouco antes de enviar.");
}

function setVisualEditorFullscreen(isOpen) {
  const section = $("visualEditorSection");
  const closeBtn = $("btnCloseVisualFullscreen");
  if (section) section.classList.toggle("visual-editor-card--fullscreen", Boolean(isOpen));
  if (closeBtn) closeBtn.classList.toggle("hidden", !isOpen);
  document.body.classList.toggle("visual-editor-open", Boolean(isOpen));
}

function createBuilderDraftFromFlow(flow) {
  const orderedNodes = Object.values(flow?.nodesById ?? {});
  return ensureBuilderDraftConsistency({
    id: String(flow?.id ?? "novo_modulo"),
    name: String(flow?.name ?? "Novo Módulo"),
    startNodeId: String(flow?.startNodeId ?? ""),
    nodes: orderedNodes.map((node) => ({
      id: String(node?.id ?? ""),
      type: String(node?.type ?? "") === "interpretacao" ? "interpretacao" : "pergunta",
      title: String(node?.title ?? ""),
      body: String(node?.body ?? ""),
      contentType: String(node?.contentType ?? "text"),
      imageUrl: String(node?.imageUrl ?? ""),
      answers: (Array.isArray(node?.options) ? node.options : []).map((opt, idx) => ({
        id: `${String(node?.id ?? "node")}__answer_${idx + 1}`,
        label: String(opt?.label ?? ""),
        nextNodeId: String(opt?.nextNodeId ?? "")
      }))
    }))
  });
}

function buildFlowFromBuilderDraft(draft) {
  const cleanDraft = ensureBuilderDraftConsistency(draft);
  const flowId = slugifyText(cleanDraft.id || cleanDraft.name || "novo_modulo") || "novo_modulo";
  const flowName = String(cleanDraft.name ?? "").trim() || "Novo Módulo";
  const nodeIds = new Set(cleanDraft.nodes.map((node) => node.id));

  if (!cleanDraft.startNodeId || !nodeIds.has(cleanDraft.startNodeId)) {
    throw new Error("Escolha qual pergunta inicia o módulo.");
  }

  const startNode = cleanDraft.nodes.find((node) => node.id === cleanDraft.startNodeId);
  if (!startNode || startNode.type !== "pergunta") {
    throw new Error("A etapa inicial precisa ser uma pergunta.");
  }

  const nodes = cleanDraft.nodes.map((node) => {
    const title = String(node.title ?? "").trim();
    if (!title) {
      throw new Error("Toda etapa precisa ter um título.");
    }

    if (node.type === "pergunta") {
      const answers = (Array.isArray(node.answers) ? node.answers : [])
        .map((answer) => ({
          label: String(answer.label ?? "").trim(),
          nextNodeId: String(answer.nextNodeId ?? "").trim()
        }));

      if (answers.length === 0) {
        throw new Error(`A pergunta "${title}" precisa de pelo menos uma resposta.`);
      }

      for (const answer of answers) {
        if (!answer.label) {
          throw new Error(`A pergunta "${title}" possui resposta sem texto. Escreva a opcao antes de salvar.`);
        }
        if (!answer.nextNodeId || !nodeIds.has(answer.nextNodeId)) {
          throw new Error(`A resposta "${answer.label}" da pergunta "${title}" precisa apontar para outra etapa ou diagnóstico.`);
        }
      }

      return {
        id: node.id,
        type: "pergunta",
        title,
        body: String(node.body ?? "").trim(),
        contentType: ["image", "mixed"].includes(String(node.contentType ?? "")) ? String(node.contentType) : "text",
        imageUrl: String(node.imageUrl ?? "").trim(),
        options: answers
      };
    }

    return {
      id: node.id,
      type: "interpretacao",
      title,
      body: String(node.body ?? "").trim(),
      contentType: ["image", "mixed"].includes(String(node.contentType ?? "")) ? String(node.contentType) : "text",
      imageUrl: String(node.imageUrl ?? "").trim()
    };
  });

  return normalizeFlow({
    id: flowId,
    name: flowName,
    startNodeId: cleanDraft.startNodeId,
    nodes
  });
}

function createStarterThompsomFlow() {
  const finalizadorAlta = createBuilderNode("interpretacao", {
    id: "alta_fim_sessao",
    title: "Alta\nFim da sessão",
    body: ""
  });
  const diagnosticoPernaNeutra = createBuilderNode("interpretacao", {
    id: "dx_perna_neutra_flexao",
    title: "Próximo passo - Perna neutra",
    body: "Vamos montar esse caminho juntos."
  });
  const diagnosticoDoisLados = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_dois_lados",
    title: "Síndrome\nCervical Bilateral",
    body: "",
    primaryActions: [
      { label: "1 - CORRIGIR", action: "mark_corrected" },
      { label: "2- REAVALIAÇÃO", action: "restart_flow", targetNodeId: "leg_checking_inicial" }
    ]
  });
  const diagnosticoIpsilateral = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_ipsilateral",
    title: "Síndrome\nCervical Unilateral",
    body: "",
    primaryActions: [
      { label: "1 - CORRIGIR", action: "mark_corrected" },
      { label: "2- REAVALIAÇÃO", action: "restart_flow", targetNodeId: "leg_checking_inicial" }
    ]
  });
  const diagnosticoContralateral = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_contralateral",
    title: "Síndrome\nOccipital Posterior",
    body: "",
    primaryActions: [
      { label: "1 - CORRIGIR", action: "mark_corrected" },
      { label: "2- REAVALIAÇÃO", action: "restart_flow", targetNodeId: "leg_checking_inicial" }
    ]
  });
  const diagnosticoCurtaDireita = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_neutra_direita",
    title: "Síndrome\nCervical à Direita",
    body: "",
    primaryActions: [
      { label: "1 - Nódulo à Esq.\nC7-C2      Atlas", action: "mark_corrected" },
      { label: "2 - Correção", action: "mark_corrected" },
      { label: "3- REAVALIAÇÃO", action: "restart_flow", targetNodeId: "leg_checking_inicial" }
    ]
  });
  const diagnosticoCurtaEsquerda = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_neutra_esquerda",
    title: "Síndrome\nCervical à Esquerda",
    body: "",
    primaryActions: [
      { label: "1 - Nódulo à Dir.\nC7-C2      Atlas", action: "mark_corrected" },
      { label: "2 - Correção", action: "mark_corrected" },
      { label: "3- REAVALIAÇÃO", action: "restart_flow", targetNodeId: "leg_checking_inicial" }
    ]
  });
  const diagnosticoCurtaNeutraDoisLados = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_neutra_dois_lados",
    title: "Bloqueio\nCervical Duplo",
    body: "",
    primaryActions: [
      { label: "1 - Nódulo Dir e Esq\nC7-C2      Atlas", action: "mark_corrected" },
      { label: "2 - Correção", action: "mark_corrected" },
      { label: "3- REAVALIAÇÃO", action: "restart_flow", targetNodeId: "leg_checking_inicial" }
    ]
  });
  const diagnosticoCurtaDoisLados = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_rodar_dois_lados",
    title: "Próximo passo - Perna curta ao rodar para os dois lados",
    body: "Vamos montar esse caminho juntos."
  });
  const diagnosticoPernaCurtaCurta = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_curta",
    title: "Derifield\nNegativo",
    body: "",
    primaryActions: [
      { label: "1 - CORRIGIR", action: "mark_corrected" },
      { label: "2- REAVALIAÇÃO", action: "restart_flow", targetNodeId: "leg_checking_inicial" }
    ]
  });
  const diagnosticoPernaCurtaLonga = createBuilderNode("interpretacao", {
    id: "dx_perna_curta_longa",
    title: "L5",
    body: "",
    primaryActions: [
      { label: "Corrigir", action: "mark_corrected" },
      { label: "Reavaliar", action: "restart_flow", targetNodeId: "leg_checking_inicial" }
    ]
  });
  const perguntaExtensao = createBuilderNode("pergunta", {
    id: "rotacao_cervical_extensao",
    title: "Rotação Cervical para Direita e para a Esquerda\ncom o joelho em EXTENSÃO",
    answers: [
      createBuilderAnswer("Perna Neutra", "realizar_flexao_joelho"),
      createBuilderAnswer("Perna curta para os dois lados", diagnosticoDoisLados.id),
      createBuilderAnswer("Perna Curta ipsilateral a cervical", diagnosticoIpsilateral.id),
      createBuilderAnswer("Perna Curta contralateral a cervical", diagnosticoContralateral.id)
    ]
  });
  const perguntaExtensaoPernaCurta = createBuilderNode("pergunta", {
    id: "rotacao_cervical_extensao_perna_curta",
    title: "Rotação Cervical para Direita e para a Esquerda\ncom o joelho em EXTENSÃO",
    answers: [
      createBuilderAnswer("Perna Neutra ao rodar a cervical para a Direita", diagnosticoCurtaDireita.id),
      createBuilderAnswer("Perna Neutra ao rodar a cervical para a Esquerda", diagnosticoCurtaEsquerda.id),
      createBuilderAnswer("Perna Neutra ao rodar a cervical para os dois lados", diagnosticoCurtaNeutraDoisLados.id),
      createBuilderAnswer("Perna Curta ao rodar a cervical para os dois lados", "realizar_flexao_joelho_perna_curta")
    ]
  });
  const perguntaFlexaoPernaCurta = createBuilderNode("pergunta", {
    id: "realizar_flexao_joelho_perna_curta",
    title: "Realizar a FLEXÃO do joelho",
    answers: [
      createBuilderAnswer("Perna Curta IPSILATERAL a perna curta em extensão\nPERNA CURTA CURTA", "pontos_gatilhos_perna_curta_curta"),
      createBuilderAnswer("Perna Curta CONTRALATERAL a perna curta em extensão\nPERNA CURTA LONGA", diagnosticoPernaCurtaLonga.id)
    ]
  });
  const perguntaPontosGatilhosCurta = createBuilderNode("pergunta", {
    id: "pontos_gatilhos_perna_curta_curta",
    title: "Pontos Gatilhos",
    body: [
      "Procurar",
      "Tendão de Aquiles",
      "Aspecto proximal da tíbia medial",
      "Tuberosidade isquiática",
      "EIPS",
      "Área do osso púbico",
      "Eretores da espinha T6-T2 (contralateral)"
    ].join("\n"),
    answers: [
      createBuilderAnswer("Sim", diagnosticoPernaCurtaCurta.id),
      createBuilderAnswer("Não", diagnosticoPernaCurtaLonga.id)
    ]
  });
  const diagnosticoCurta = createBuilderNode("interpretacao", {
    id: "proximo_passo_perna_curta",
    title: "Próximo passo - Perna curta",
    body: "Vamos montar esse caminho juntos."
  });
  const perguntaRotacaoFlexao = createBuilderNode("pergunta", {
    id: "rotacao_cervical_flexao",
    title: "Rotação Cervical para direita e para esquerda\ncom os joelhos em FLEXÃO",
    answers: [
      createBuilderAnswer("Perna Neutra", finalizadorAlta.id),
      createBuilderAnswer("Perna Curta", diagnosticoCurta.id)
    ]
  });
  const perguntaFlexao = createBuilderNode("pergunta", {
    id: "realizar_flexao_joelho",
    title: "Realizar a FLEXÃO do joelho",
    answers: [
      createBuilderAnswer("Perna Neutra", perguntaRotacaoFlexao.id),
      createBuilderAnswer("Perna Curta", diagnosticoCurta.id)
    ]
  });
  const perguntaInicial = createBuilderNode("pergunta", {
    id: "leg_checking_inicial",
    title: "Leg checking inicial",
    answers: [
      createBuilderAnswer("Perna neutra", perguntaExtensao.id),
      createBuilderAnswer("Perna curta", perguntaExtensaoPernaCurta.id)
    ]
  });

  return buildFlowFromBuilderDraft({
    id: "roteiro_thompsom",
    name: "Roteiro de Thompson",
    startNodeId: perguntaInicial.id,
    nodes: [
      perguntaInicial,
      perguntaExtensao,
      perguntaExtensaoPernaCurta,
      perguntaFlexaoPernaCurta,
      perguntaPontosGatilhosCurta,
      perguntaFlexao,
      perguntaRotacaoFlexao,
      finalizadorAlta,
      diagnosticoPernaNeutra,
      diagnosticoDoisLados,
      diagnosticoIpsilateral,
      diagnosticoContralateral,
      diagnosticoCurtaDireita,
      diagnosticoCurtaEsquerda,
      diagnosticoCurtaNeutraDoisLados,
      diagnosticoCurtaDoisLados,
      diagnosticoPernaCurtaCurta,
      diagnosticoPernaCurtaLonga,
      diagnosticoCurta
    ]
  });
}

function ensureStarterModules(protocol) {
  if (!protocol) return protocol;

  const starterFlow = createStarterThompsomFlow();
  const currentStarter = protocol.flowsById?.roteiro_thompsom;
  const extensaoOptions = Array.isArray(currentStarter?.nodesById?.rotacao_cervical_extensao?.options)
    ? currentStarter.nodesById.rotacao_cervical_extensao.options
    : [];
  const flexaoJoelhoOptions = Array.isArray(currentStarter?.nodesById?.realizar_flexao_joelho?.options)
    ? currentStarter.nodesById.realizar_flexao_joelho.options
    : [];
  const rotacaoFlexaoOptions = Array.isArray(currentStarter?.nodesById?.rotacao_cervical_flexao?.options)
    ? currentStarter.nodesById.rotacao_cervical_flexao.options
    : [];
  const extensaoPernaCurtaOptions = Array.isArray(currentStarter?.nodesById?.rotacao_cervical_extensao_perna_curta?.options)
    ? currentStarter.nodesById.rotacao_cervical_extensao_perna_curta.options
    : [];
  const inicialOptions = Array.isArray(currentStarter?.nodesById?.leg_checking_inicial?.options)
    ? currentStarter.nodesById.leg_checking_inicial.options
    : [];
  const extensaoPernaNeutraNext = extensaoOptions.find((opt) => String(opt?.label ?? "").toLowerCase() === "perna neutra")?.nextNodeId;
  const flexaoJoelhoPernaNeutraNext = flexaoJoelhoOptions.find((opt) => String(opt?.label ?? "").toLowerCase() === "perna neutra")?.nextNodeId;
  const rotacaoFlexaoPernaNeutraNext = rotacaoFlexaoOptions.find((opt) => String(opt?.label ?? "").toLowerCase() === "perna neutra")?.nextNodeId;
  const extensaoPernaCurtaDoisLadosNext = extensaoPernaCurtaOptions.find((opt) => String(opt?.label ?? "").toLowerCase() === "perna curta ao rodar a cervical para os dois lados")?.nextNodeId;
  const flexaoPernaCurtaOptions = Array.isArray(currentStarter?.nodesById?.realizar_flexao_joelho_perna_curta?.options)
    ? currentStarter.nodesById.realizar_flexao_joelho_perna_curta.options
    : [];
  const flexaoPernaCurtaIpsilateralNext = flexaoPernaCurtaOptions.find((opt) => String(opt?.label ?? "").toLowerCase().includes("ipsilateral"))?.nextNodeId;
  const inicialPernaCurtaNext = inicialOptions.find((opt) => String(opt?.label ?? "").toLowerCase() === "perna curta")?.nextNodeId;
  const needsStarterUpgrade = !currentStarter
    || !currentStarter.nodesById?.rotacao_cervical_extensao
    || !currentStarter.nodesById?.rotacao_cervical_extensao_perna_curta
    || !currentStarter.nodesById?.realizar_flexao_joelho_perna_curta
    || !currentStarter.nodesById?.pontos_gatilhos_perna_curta_curta
    || !/derifield/i.test(String(currentStarter.nodesById?.dx_perna_curta_curta?.title ?? ""))
    || String(currentStarter.nodesById?.dx_perna_curta_longa?.title ?? "").trim().toUpperCase() !== "L5"
    || !Array.isArray(currentStarter.nodesById?.dx_perna_curta_longa?.primaryActions)
    || !currentStarter.nodesById.dx_perna_curta_longa.primaryActions.some((a) => String(a?.label ?? "").toLowerCase() === "corrigir")
    || !currentStarter.nodesById.dx_perna_curta_longa.primaryActions.some((a) => String(a?.label ?? "").toLowerCase() === "reavaliar")
    || !currentStarter.nodesById?.realizar_flexao_joelho
    || !currentStarter.nodesById?.rotacao_cervical_flexao
    || !currentStarter.nodesById?.alta_fim_sessao
    || !/síndrome/i.test(String(currentStarter.nodesById?.dx_perna_curta_neutra_direita?.title ?? ""))
    || !/direita/i.test(String(currentStarter.nodesById?.dx_perna_curta_neutra_direita?.title ?? ""))
    || !/síndrome/i.test(String(currentStarter.nodesById?.dx_perna_curta_neutra_esquerda?.title ?? ""))
    || !/esquerda/i.test(String(currentStarter.nodesById?.dx_perna_curta_neutra_esquerda?.title ?? ""))
    || !/bloqueio/i.test(String(currentStarter.nodesById?.dx_perna_curta_neutra_dois_lados?.title ?? ""))
    || !/duplo/i.test(String(currentStarter.nodesById?.dx_perna_curta_neutra_dois_lados?.title ?? ""))
    || !/bilateral/i.test(String(currentStarter.nodesById?.dx_perna_curta_dois_lados?.title ?? ""))
    || !/unilateral/i.test(String(currentStarter.nodesById?.dx_perna_curta_ipsilateral?.title ?? ""))
    || !/occipital/i.test(String(currentStarter.nodesById?.dx_perna_curta_contralateral?.title ?? ""))
    || inicialPernaCurtaNext !== "rotacao_cervical_extensao_perna_curta"
    || extensaoPernaCurtaDoisLadosNext !== "realizar_flexao_joelho_perna_curta"
    || flexaoPernaCurtaIpsilateralNext !== "pontos_gatilhos_perna_curta_curta"
    || extensaoPernaNeutraNext !== "realizar_flexao_joelho"
    || flexaoJoelhoPernaNeutraNext !== "rotacao_cervical_flexao"
    || rotacaoFlexaoPernaNeutraNext !== "alta_fim_sessao";

  if (!needsStarterUpgrade) return protocol;

  return normalizeProtocol({
    flowsById: {
      ...(protocol.flowsById ?? {}),
      [starterFlow.id]: starterFlow
    },
    defaultFlowId: protocol.defaultFlowId ?? starterFlow.id,
    moduleBlueprints: protocol.moduleBlueprints ?? {}
  });
}

function syncBuilderDraftFromDom(app) {
  const moduleName = $("builderModuleName");
  const moduleId = $("builderModuleId");
  const startNodeId = $("builderStartNodeId");
  const nodeCards = Array.from(document.querySelectorAll(".builder-node"));

  app.builderDraft = ensureBuilderDraftConsistency({
    id: String(moduleId?.value ?? "").trim(),
    name: String(moduleName?.value ?? "").trim(),
    startNodeId: String(startNodeId?.value ?? "").trim(),
    nodes: nodeCards.map((card) => {
      const nodeType = String(card.querySelector('[data-field="nodeType"]')?.value ?? "pergunta");
      const answers = Array.from(card.querySelectorAll(".builder-answer")).map((answerCard) => ({
        id: String(answerCard.getAttribute("data-answer-id") ?? ""),
        label: String(answerCard.querySelector('[data-field="answerLabel"]')?.value ?? "").trim(),
        nextNodeId: String(answerCard.querySelector('[data-field="answerNextNodeId"]')?.value ?? "").trim()
      }));

      return {
        id: String(card.getAttribute("data-builder-node-id") ?? ""),
        type: nodeType === "interpretacao" ? "interpretacao" : "pergunta",
        title: String(card.querySelector('[data-field="nodeTitle"]')?.value ?? "").trim(),
        body: String(card.querySelector('[data-field="nodeBody"]')?.value ?? "").trim(),
        contentType: String(card.querySelector('[data-field="nodeContentType"]')?.value ?? "text"),
        imageUrl: String(card.querySelector('[data-field="nodeImageUrl"]')?.value ?? "").trim(),
        answers
      };
    })
  });
}

function syncBuilderJsonPreview(app) {
  const textarea = $("editorTextarea");
  if (!textarea) return;
  try {
    app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
    const flow = buildFlowFromBuilderDraft(app.builderDraft);
    textarea.value = JSON.stringify({
      id: flow.id,
      name: flow.name,
      startNodeId: flow.startNodeId,
      nodes: Object.values(flow.nodesById)
    }, null, 2);
  } catch {
    textarea.value = "";
  }
}

function renderBuilderNodes(app) {
  const list = $("builderNodesList");
  const startSelect = $("builderStartNodeId");
  if (!list || !startSelect) return;

  app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
  const draft = app.builderDraft;
  const questionNodes = draft.nodes.filter((node) => node.type === "pergunta");
  const targetOptions = draft.nodes.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.title || node.id)} • ${node.type === "interpretacao" ? "Resultado" : "Pergunta"}</option>`).join("");

  startSelect.innerHTML = questionNodes.map((node) => `
    <option value="${escapeHtml(node.id)}" ${node.id === draft.startNodeId ? "selected" : ""}>${escapeHtml(node.title || node.id)}</option>
  `).join("");

  list.innerHTML = "";

  draft.nodes.forEach((node, idx) => {
    const wrap = document.createElement("div");
    wrap.className = `builder-node ${node.type === "interpretacao" ? "builder-node--result" : "builder-node--question"}`;
    wrap.setAttribute("data-builder-node-id", node.id);

    const answersHtml = node.type === "pergunta"
      ? `
        <div class="builder-answer-list">
          ${(Array.isArray(node.answers) ? node.answers : []).map((answer, answerIdx) => `
            <div class="builder-answer" data-answer-id="${escapeHtml(answer.id)}">
              <div class="builder-answer__header">
                <div class="builder-answer__title">Resposta ${answerIdx + 1}</div>
                <button class="btn btn--ghost btn--sm" type="button" data-action="remove-builder-answer" data-node-id="${escapeHtml(node.id)}" data-answer-id="${escapeHtml(answer.id)}" style="flex: 0;">Remover</button>
              </div>
              <div class="row-inputs">
                <div class="input-group">
                  <label class="label">Texto da resposta</label>
                  <input type="text" class="input-text" data-field="answerLabel" value="${escapeHtml(answer.label)}" placeholder="Ex: Perna curta ipsilateral" />
                </div>
                <div class="input-group">
                  <label class="label">Próximo passo</label>
                  <select class="input-text" data-field="answerNextNodeId">
                    <option value="">Selecione</option>
                    ${targetOptions.replace(`value="${escapeHtml(answer.nextNodeId)}"`, `value="${escapeHtml(answer.nextNodeId)}" selected`)}
                  </select>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
        <button class="btn btn--ghost btn--sm" type="button" data-action="add-builder-answer" data-node-id="${escapeHtml(node.id)}" style="flex: 0;">Adicionar Resposta</button>
      `
      : "";

    wrap.innerHTML = `
      <div class="builder-node__header">
        <div class="builder-node__title">Etapa ${idx + 1}</div>
        <button class="btn btn--ghost btn--sm" type="button" data-action="remove-builder-node" data-node-id="${escapeHtml(node.id)}" style="flex: 0;">Remover</button>
      </div>
      <div class="row-inputs">
        <div class="input-group">
          <label class="label">Tipo</label>
          <select class="input-text" data-field="nodeType">
            <option value="pergunta" ${node.type === "pergunta" ? "selected" : ""}>Pergunta</option>
            <option value="interpretacao" ${node.type === "interpretacao" ? "selected" : ""}>Resultado</option>
          </select>
        </div>
        <div class="input-group">
          <label class="label">Título</label>
          <input type="text" class="input-text" data-field="nodeTitle" value="${escapeHtml(node.title)}" placeholder="Ex: Rotação cervical..." />
        </div>
      </div>
      <div class="row-inputs">
        <div class="input-group">
          <label class="label">Formato do conteúdo</label>
          <select class="input-text" data-field="nodeContentType">
            <option value="text" ${String(node.contentType ?? "text") === "text" ? "selected" : ""}>Texto</option>
            <option value="image" ${String(node.contentType ?? "") === "image" ? "selected" : ""}>Imagem</option>
            <option value="mixed" ${String(node.contentType ?? "") === "mixed" ? "selected" : ""}>Imagem + texto</option>
          </select>
        </div>
        <div class="input-group">
          <label class="label">URL da imagem</label>
          <input type="text" class="input-text" data-field="nodeImageUrl" value="${escapeHtml(String(node.imageUrl ?? ""))}" placeholder="Cole a URL da imagem" />
        </div>
      </div>
      <div class="input-group" style="margin-bottom: 0;">
        <label class="label">${node.type === "pergunta" ? "Orientação opcional" : "Descrição / conduta"}</label>
        <textarea class="textarea" data-field="nodeBody" style="min-height: 90px;">${String(node.body ?? "")}</textarea>
      </div>
      ${answersHtml}
    `;

    list.appendChild(wrap);
  });

  syncBuilderJsonPreview(app);
}

function fillBuilderForm(app) {
  const draft = ensureBuilderDraftConsistency(app.builderDraft ?? createEmptyBuilderDraft());
  const moduleName = $("builderModuleName");
  const moduleNameMain = $("builderModuleNameMain");
  const moduleId = $("builderModuleId");
  const startSelect = $("builderStartNodeId");
  const questionNodes = draft.nodes.filter((node) => node.type === "pergunta");

  if (moduleName) moduleName.value = draft.name ?? "";
  if (moduleNameMain) moduleNameMain.value = draft.name ?? "";
  if (moduleId) moduleId.value = draft.id ?? "";
  if (startSelect) {
    startSelect.innerHTML = questionNodes.map((node) => `
      <option value="${escapeHtml(node.id)}" ${node.id === draft.startNodeId ? "selected" : ""}>${escapeHtml(node.title || node.id)}</option>
    `).join("");
  }
  app.builderDraft = draft;
  ensureBuilderSelection(app);
  renderBuilderWorkspace(app);
  fillVisualEditor(app);
}

function setEditorMode(app, mode) {
  app.editorMode = mode;

  const title = $("editorTitle");
  const subtitle = $("editorSubtitle");
  const simpleSection = $("simpleBuilderSection");
  const advancedJsonSection = $("advancedJsonSection");
  const thompsonSection = $("thompsonWorkspaceSection");

  if (title) title.textContent = "Construtor de Módulo";
  if (subtitle) subtitle.textContent = "Monte o roteiro visualmente: clique nos blocos, edite o texto, crie ramificações e conecte as etapas como um fluxograma clínico.";
  if (simpleSection) simpleSection.classList.add("hidden");
  if (advancedJsonSection) advancedJsonSection.classList.remove("hidden");
  if (thompsonSection) thompsonSection.classList.add("hidden");
  fillBuilderForm(app);
}

function getFlowStepTypeLabel(node) {
  const type = String(node?.type ?? "").toLowerCase();
  if (type === "pergunta" || type === "question") return "Pergunta";
  if (type === "interpretacao" || type === "interpretation") return "Interpretação";
  if (type === "checkpoint") return "Checkpoint";
  if (type === "area" || type === "areas") return "Área";
  return "Orientação";
}

function getFlowNodeVariant(node) {
  if (node?.__virtualType === "root") return "root";
  if (node?.__virtualType === "branch") return "branch";
  if (node?.__virtualType === "support") return "support";
  if (node?.__virtualType === "answer") return "answer";
  if (node?.__virtualType === "action") return "action";

  const type = String(node?.type ?? "").toLowerCase();
  if (type === "pergunta" || type === "question") return "question";
  if (type === "interpretacao" || type === "interpretation") return "result";
  if (type === "checkpoint") return "checkpoint";
  return "neutral";
}

function getFlowTargetLabel(flow, nextNodeId) {
  const nextNode = flow?.nodesById?.[nextNodeId];
  return String(nextNode?.title ?? nextNodeId ?? "").trim() || "Fim";
}

function getFlowVisualGraph(flow, startNodeId = flow.startNodeId, includeUnvisited = true) {
  const order = [];
  const visited = new Set();
  const queue = [startNodeId];
  const levels = { [startNodeId]: 0 };
  const edges = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId) || !flow.nodesById[nodeId]) continue;
    visited.add(nodeId);
    order.push(nodeId);

    const node = flow.nodesById[nodeId];
    const nextIds = [];

    for (const opt of Array.isArray(node.options) ? node.options : []) {
      const nextId = String(opt?.nextNodeId ?? "");
      if (nextId && flow.nodesById[nextId]) {
        nextIds.push(nextId);
        edges.push({
          from: nodeId,
          to: nextId,
          label: String(opt?.label ?? "Opção"),
          kind: "option"
        });
      }
    }

    for (const action of Array.isArray(node.primaryActions) ? node.primaryActions : []) {
      const targetId = String(action?.targetNodeId ?? "");
      if ((action?.action === "goto" || action?.action === "restart_flow") && targetId && flow.nodesById[targetId]) {
        nextIds.push(targetId);
        edges.push({
          from: nodeId,
          to: targetId,
          label: String(action?.label ?? "Ação"),
          kind: "action"
        });
      }
    }

    for (const nextId of nextIds) {
      if (levels[nextId] == null || levels[nextId] > (levels[nodeId] ?? 0) + 1) {
        levels[nextId] = (levels[nodeId] ?? 0) + 1;
      }
      if (!visited.has(nextId)) queue.push(nextId);
    }
  }

  if (includeUnvisited) {
    for (const nodeId of Object.keys(flow.nodesById)) {
      if (!visited.has(nodeId)) {
        order.push(nodeId);
        if (levels[nodeId] == null) levels[nodeId] = Object.keys(levels).length;
      }
    }
  }

  return {
    orderedNodes: order.map((nodeId) => flow.nodesById[nodeId]),
    levels,
    edges
  };
}

function getThompsonStartBranches(module, protocol) {
  const startFlow = protocol?.flowsById?.[module?.startFlowId];
  const startNode = startFlow?.nodesById?.[startFlow?.startNodeId];
  const startOptions = Array.isArray(startNode?.options) ? startNode.options : [];

  const mainBranches = startOptions
    .filter((opt) => /perna curta|perna neutra/i.test(String(opt?.label ?? "")))
    .map((opt, idx) => {
      const targetId = String(opt?.nextNodeId ?? "");
      const resolved = resolveModuleNodeRef(module, protocol, targetId, startFlow.id);
      return {
        id: `__branch__::${idx + 1}`,
        label: String(opt?.label ?? `Ramo ${idx + 1}`),
        flowId: resolved?.flowId ?? startFlow.id,
        nodeId: resolved?.nodeId ?? targetId
      };
    });

  const supportFlows = module.flowIds
    .filter((flowId) => flowId !== module.startFlowId)
    .map((flowId) => protocol.flowsById[flowId])
    .filter(Boolean)
    .map((flow) => ({
      id: flow.id,
      label: flow.name,
      flowId: flow.id
    }));

  return { mainBranches, supportFlows };
}

function drawFlowboardConnections(host, edges) {
  const board = host.querySelector(".flowboard");
  const svg = host.querySelector(".flowboard__svg");
  if (!board || !svg) return;

  const boardRect = board.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, boardRect.width)} ${Math.max(1, boardRect.height)}`);
  svg.setAttribute("width", `${Math.max(1, boardRect.width)}`);
  svg.setAttribute("height", `${Math.max(1, boardRect.height)}`);
  svg.innerHTML = "";

  for (const edge of edges) {
    const fromEl = board.querySelector(`[data-node-id="${edge.from}"]`);
    const toEl = board.querySelector(`[data-node-id="${edge.to}"]`);
    if (!fromEl || !toEl) continue;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const x1 = fromRect.right - boardRect.left;
    const y1 = fromRect.top - boardRect.top + (fromRect.height / 2);
    const x2 = toRect.left - boardRect.left;
    const y2 = toRect.top - boardRect.top + (toRect.height / 2);
    const curve = Math.max(40, Math.abs(x2 - x1) * 0.35);
    const color = edge.kind === "action"
      ? "#64748b"
      : (edge.kind === "branch" ? "#60a5fa" : (edge.kind === "support" ? "#a78bfa" : "#39b54a"));

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "3");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
  }
}

function resolveModuleNodeRef(module, protocol, targetNodeId, preferredFlowId) {
  if (!targetNodeId || !module || !protocol) return null;
  const flows = module.flowIds
    .map((flowId) => protocol.flowsById[flowId])
    .filter(Boolean);

  if (preferredFlowId && protocol.flowsById[preferredFlowId]?.nodesById?.[targetNodeId]) {
    return { flowId: preferredFlowId, nodeId: targetNodeId };
  }

  for (const flow of flows) {
    if (flow.nodesById?.[targetNodeId]) return { flowId: flow.id, nodeId: targetNodeId };
  }

  return null;
}

function getModuleVisualGraph(module, protocol) {
  const order = [];
  const visited = new Set();
  const queue = [];
  const levels = {};
  const edges = [];
  const nodesByKey = {};

  const flows = module.flowIds
    .map((flowId) => protocol.flowsById[flowId])
    .filter(Boolean);

  for (const flow of flows) {
    for (const node of Object.values(flow.nodesById ?? {})) {
      nodesByKey[`${flow.id}::${node.id}`] = { ...node, __flowId: flow.id, __key: `${flow.id}::${node.id}` };
    }
  }

  const startFlow = protocol.flowsById[module.startFlowId];
  if (!startFlow) return { orderedNodes: [], levels: {}, edges: [] };

  const startNode = startFlow.nodesById[startFlow.startNodeId];
  const rootKey = "__overview__::inicio";
  const startQuestion = String(startNode?.title ?? "Leg checking inicial");
  nodesByKey[rootKey] = {
    id: "inicio",
    title: startQuestion,
    body: "Pergunta inicial do Thompson: o paciente está com perna curta ou perna neutra?",
    options: [],
    primaryActions: [],
    __flowId: startFlow.id,
    __key: rootKey,
    __virtualType: "root"
  };
  levels[rootKey] = 0;
  order.push(rootKey);

  const { mainBranches, supportFlows } = getThompsonStartBranches(module, protocol);

  mainBranches.forEach((branch, idx) => {
    const branchKey = branch.id;

    nodesByKey[branchKey] = {
      id: branchKey,
      title: branch.label,
      body: branch.nodeId && protocol.flowsById[branch.flowId]?.nodesById?.[branch.nodeId]
        ? `Segue para ${getFlowTargetLabel(protocol.flowsById[branch.flowId], branch.nodeId)}`
        : "Sem próximo passo mapeado",
      options: [],
      primaryActions: [],
      __flowId: branch.flowId ?? startFlow.id,
      __key: branchKey,
      __virtualType: "branch"
    };

    levels[branchKey] = 1;
    order.push(branchKey);
    edges.push({
      from: rootKey,
      to: branchKey,
      label: branch.label,
      kind: "branch"
    });

    if (branch.nodeId && protocol.flowsById[branch.flowId]?.nodesById?.[branch.nodeId]) {
      const nextKey = `${branch.flowId}::${branch.nodeId}`;
      edges.push({
        from: branchKey,
        to: nextKey,
        label: "seguir",
        kind: "option"
      });
      if (levels[nextKey] == null || levels[nextKey] > 2) levels[nextKey] = 2;
      queue.push(nextKey);
    }
  });

  if (supportFlows.length > 0) {
    const supportKey = "__overview__::apoios";
    nodesByKey[supportKey] = {
      id: "apoios",
      title: "Apoios clínicos",
      body: supportFlows.map((flow) => `• ${String(flow.label ?? "").trim()}`).join("\n"),
      options: [],
      primaryActions: [],
      __flowId: startFlow.id,
      __key: supportKey,
      __virtualType: "support"
    };
    levels[supportKey] = 1;
    order.push(supportKey);
    edges.push({
      from: rootKey,
      to: supportKey,
      label: "apoios",
      kind: "support"
    });
  }

  while (queue.length > 0) {
    const key = queue.shift();
    const node = nodesByKey[key];
    if (!node || visited.has(key)) continue;

    visited.add(key);
    if (!order.includes(key)) order.push(key);

    const currentFlow = protocol.flowsById[node.__flowId];
    const nextRefs = [];

    for (const [optIdx, opt] of (Array.isArray(node.options) ? node.options : []).entries()) {
      const targetId = String(opt?.nextNodeId ?? "");
      const resolved = resolveModuleNodeRef(module, protocol, targetId, currentFlow?.id);
      const answerKey = `${key}::answer_${optIdx + 1}`;
      nodesByKey[answerKey] = {
        id: answerKey,
        title: String(opt?.label ?? `Resposta ${optIdx + 1}`),
        body: resolved
          ? `Segue para ${getFlowTargetLabel(protocol.flowsById[resolved.flowId], resolved.nodeId)}`
          : "Sem próximo passo mapeado",
        options: [],
        primaryActions: [],
        __flowId: resolved?.flowId ?? currentFlow?.id,
        __key: answerKey,
        __virtualType: "answer"
      };

      if (!order.includes(answerKey)) order.push(answerKey);
      if (levels[answerKey] == null || levels[answerKey] > (levels[key] ?? 0) + 1) {
        levels[answerKey] = (levels[key] ?? 0) + 1;
      }

      edges.push({
        from: key,
        to: answerKey,
        label: String(opt?.label ?? "Opção"),
        kind: "option"
      });

      if (resolved) {
        const nextKey = `${resolved.flowId}::${resolved.nodeId}`;
        nextRefs.push({
          nextKey,
          parentLevel: levels[answerKey] ?? ((levels[key] ?? 0) + 1)
        });
        edges.push({
          from: answerKey,
          to: nextKey,
          label: "seguir",
          kind: "option"
        });
      }
    }

    for (const action of Array.isArray(node.primaryActions) ? node.primaryActions : []) {
      const targetId = String(action?.targetNodeId ?? "");
      const resolved = resolveModuleNodeRef(module, protocol, targetId, currentFlow?.id);
      if ((action?.action === "goto" || action?.action === "restart_flow") && resolved) {
        const nextKey = `${resolved.flowId}::${resolved.nodeId}`;
        nextRefs.push({
          nextKey,
          parentLevel: levels[key] ?? 0
        });
        edges.push({
          from: key,
          to: nextKey,
          label: String(action?.label ?? "Ação"),
          kind: "action"
        });
      }
    }

    for (const ref of nextRefs) {
      const nextKey = ref.nextKey;
      const nextLevel = (ref.parentLevel ?? (levels[key] ?? 0)) + 1;
      if (levels[nextKey] == null || levels[nextKey] > nextLevel) {
        levels[nextKey] = nextLevel;
      }
      if (!visited.has(nextKey)) queue.push(nextKey);
    }
  }

  return {
    orderedNodes: order.map((key) => nodesByKey[key]),
    levels,
    edges
  };
}

function renderThompsonDiagram(app) {
  const tabs = $("thompsonFlowTabs");
  const diagram = $("thompsonDiagram");
  if (!tabs || !diagram || !app.protocol) return;

  const module = getModulesForView(app).find((item) => item.id === (app.currentModuleId ?? "thompson"));
  if (!module) {
    tabs.innerHTML = "";
    diagram.innerHTML = `<div class="flow-empty">Nenhum módulo encontrado para visualizar.</div>`;
    return;
  }

  const availableFlows = (module.flowIds ?? [module.startFlowId])
    .map((flowId) => app.protocol.flowsById[flowId])
    .filter(Boolean);
  const { mainBranches, supportFlows } = getThompsonStartBranches(module, app.protocol);

  tabs.innerHTML = "";
  tabs.classList.add("hidden");

  if (module.mode === "multi_flow") {
    const { orderedNodes, levels, edges } = getModuleVisualGraph(module, app.protocol);
    if (orderedNodes.length === 0) {
      diagram.innerHTML = `<div class="flow-empty">Esse módulo ainda não possui etapas para exibir.</div>`;
      return;
    }

    const columnsMap = new Map();
    for (const node of orderedNodes) {
      const level = levels[node.__key] ?? 0;
      if (!columnsMap.has(level)) columnsMap.set(level, []);
      columnsMap.get(level).push(node);
    }

    diagram.innerHTML = `
      <div class="flowboard">
        <svg class="flowboard__svg"></svg>
        <div class="flowboard__content"></div>
      </div>
    `;

    const content = diagram.querySelector(".flowboard__content");
    if (!content) return;

    const sortedColumns = Array.from(columnsMap.entries()).sort((a, b) => a[0] - b[0]);
    for (const [level, nodes] of sortedColumns) {
      const column = document.createElement("div");
      column.className = "flowboard__column";
      column.innerHTML = `<div class="flowboard__column-title">${level === 0 ? "Início" : `Etapa ${level + 1}`}</div>`;

      for (const node of nodes) {
        const card = document.createElement("div");
        const variant = getFlowNodeVariant(node);
        const extraClass = ` flow-node--${variant}`;
        card.className = `flow-node${extraClass}`;
        card.setAttribute("data-node-id", node.__key);

        const actionsHtml = (Array.isArray(node.primaryActions) ? node.primaryActions : []).map((action) => {
          const actionName = String(action?.action ?? "");
          let targetText = "Ação clínica";
          if (actionName === "restart_flow") targetText = "Volta para o início";
          if (actionName === "goto") {
            const resolved = resolveModuleNodeRef(module, app.protocol, String(action?.targetNodeId ?? ""), node.__flowId);
            targetText = resolved ? getFlowTargetLabel(app.protocol.flowsById[resolved.flowId], resolved.nodeId) : "Destino";
          }
          if (actionName === "mark_corrected") targetText = "Marca como corrigido";
          return `<div class="flow-node__port flow-node__port--action"><strong>${String(action?.label ?? "Ação")}</strong><span>${targetText}</span></div>`;
        }).join("");

        const bodyHtml = String(node.body ?? "").trim()
          ? `<div class="flow-node__body">${String(node.body)}</div>`
          : "";

        const badgeText = node.__virtualType === "root"
          ? "Pergunta inicial"
          : (node.__virtualType === "branch"
            ? "Seleção inicial"
            : (node.__virtualType === "support"
              ? "Apoios clínicos"
              : (node.__virtualType === "answer" ? "Resposta" : `${getFlowStepTypeLabel(node)} • ${node.__flowId}`)));

        card.innerHTML = `
          <div class="flow-node__head">
            <span class="flow-node__badge">${badgeText}</span>
            <span class="muted">${node.id}</span>
          </div>
          <h3 class="flow-node__title">${String(node.title ?? node.id)}</h3>
          ${bodyHtml}
          ${actionsHtml ? `<div class="flow-node__ports"><div class="flow-node__section-title">Ações</div>${actionsHtml}</div>` : ""}
        `;
        column.appendChild(card);
      }

      content.appendChild(column);
    }

    requestAnimationFrame(() => drawFlowboardConnections(diagram, edges));
    return;
  }

  const activeFlow = app.protocol.flowsById[app.currentDiagramFlowId];
  if (!activeFlow) {
    diagram.innerHTML = `<div class="flow-empty">Selecione um fluxo para visualizar.</div>`;
    return;
  }

  const { orderedNodes, levels, edges } = getFlowVisualGraph(activeFlow);
  if (orderedNodes.length === 0) {
    diagram.innerHTML = `<div class="flow-empty">Esse fluxo ainda não possui etapas para exibir.</div>`;
    return;
  }

  const columnsMap = new Map();
  for (const node of orderedNodes) {
    const level = levels[node.id] ?? 0;
    if (!columnsMap.has(level)) columnsMap.set(level, []);
    columnsMap.get(level).push(node);
  }

  diagram.innerHTML = `
    <div class="flowboard">
      <svg class="flowboard__svg"></svg>
      <div class="flowboard__content"></div>
    </div>
  `;

  const content = diagram.querySelector(".flowboard__content");
  if (!content) return;

  const sortedColumns = Array.from(columnsMap.entries()).sort((a, b) => a[0] - b[0]);
  for (const [level, nodes] of sortedColumns) {
    const column = document.createElement("div");
    column.className = "flowboard__column";
    column.innerHTML = `<div class="flowboard__column-title">Etapa ${level + 1}</div>`;

    for (const node of nodes) {
      const card = document.createElement("div");
      card.className = "flow-node";
      card.setAttribute("data-node-id", node.id);

      const optionsHtml = (Array.isArray(node.options) ? node.options : []).map((opt) => {
        const nextId = String(opt?.nextNodeId ?? "");
        const action = String(opt?.action ?? "");
        const targetText = action === "change_flow"
          ? `Abrir ${String(opt?.label ?? "").trim()}`
          : getFlowTargetLabel(activeFlow, nextId);
        return `<div class="flow-node__port"><strong>${String(opt?.label ?? "Opção")}</strong><span>${targetText}</span></div>`;
      }).join("");

      const actionsHtml = (Array.isArray(node.primaryActions) ? node.primaryActions : []).map((action) => {
        const actionName = String(action?.action ?? "");
        let targetText = "Ação clínica";
        if (actionName === "restart_flow") targetText = "Volta para o início";
        if (actionName === "goto") targetText = getFlowTargetLabel(activeFlow, String(action?.targetNodeId ?? ""));
        if (actionName === "mark_corrected") targetText = "Marca como corrigido";
        return `<div class="flow-node__port flow-node__port--action"><strong>${String(action?.label ?? "Ação")}</strong><span>${targetText}</span></div>`;
      }).join("");

      const bodyHtml = String(node.body ?? "").trim()
        ? `<div class="flow-node__body">${String(node.body)}</div>`
        : "";

      card.innerHTML = `
        <div class="flow-node__head">
          <span class="flow-node__badge">${getFlowStepTypeLabel(node)}</span>
          <span class="muted">${node.id}</span>
        </div>
        <h3 class="flow-node__title">${String(node.title ?? node.id)}</h3>
        ${bodyHtml}
        ${optionsHtml ? `<div class="flow-node__ports">${optionsHtml}</div>` : ""}
        ${actionsHtml ? `<div class="flow-node__ports">${actionsHtml}</div>` : ""}
      `;
      column.appendChild(card);
    }

    content.appendChild(column);
  }

  requestAnimationFrame(() => drawFlowboardConnections(diagram, edges));
}

function getProtocolModules(protocol) {
  const flowsById = protocol?.flowsById ?? {};
  const modules = [];
  const hiddenLegacyFlowIds = new Set(["principal", "area_secundaria", "area_terciaria", "movimento_limpeza"]);

  for (const flow of Object.values(flowsById)) {
    if (hiddenLegacyFlowIds.has(flow.id)) continue;
    const blueprint = getModuleBlueprint(protocol, flow.id);
    modules.push({
      id: flow.id,
      name: flow.name,
      icon: "🧩",
      description: "Fluxo individual disponível para os fisioterapeutas.",
      flowIds: [flow.id],
      startFlowId: flow.id,
      nodeCount: Object.keys(flow.nodesById ?? {}).length,
      mode: "single_flow",
      coverImageUrl: String(blueprint?.branding?.coverImageUrl ?? "").trim()
    });
  }

  return modules;
}

function getSupabaseBackedModules(app) {
  const rows = Array.isArray(app.supabaseModules) ? app.supabaseModules : [];
  if (rows.length === 0) return [];

  return rows.map((row) => {
    const protocolJson = row?.protocol_json && typeof row.protocol_json === "object" ? row.protocol_json : {};
    const blueprint = normalizeModuleBlueprint(row?.blueprint_json);
    const flowId = String(protocolJson.id ?? row.slug ?? row.id ?? "");
    const nodesById = protocolJson?.nodesById && typeof protocolJson.nodesById === "object" ? protocolJson.nodesById : {};
    const nodeCount = Object.keys(nodesById).length;
    const status = String(row?.status ?? "draft").trim().toLowerCase() || "draft";
    const normalizedName = normalizeDashboardModuleName(row?.name ?? row?.slug ?? "Modulo sem nome");
    return {
      id: String(row?.id ?? flowId),
      flowId,
      slug: String(row?.slug ?? flowId),
      name: normalizedName,
      description: String(row?.description ?? "Modulo clinico disponivel para uso na plataforma."),
      status,
      nodeCount,
      ownerId: String(row?.owner_id ?? ""),
      createdAt: row?.created_at ?? null,
      updatedAt: row?.updated_at ?? null,
      startFlowId: flowId,
      coverImageUrl: String(row?.cover_image_url ?? blueprint?.branding?.coverImageUrl ?? "").trim(),
      icon: status === "published" ? "🧩" : "📝",
      source: "supabase"
    };
  });
}

function canEditModules(role) {
  return isFisioAdminRole(role);
}

function buildAllowedModuleLookup(profile) {
  const values = new Set();
  const allowed = Array.isArray(profile?.allowed_modules) ? profile.allowed_modules : [];

  for (const entry of allowed) {
    const raw = String(entry ?? "").trim();
    const normalizedName = normalizeDashboardModuleName(raw);
    const normalizedSlug = slugifyText(normalizedName).replace(/_/g, " ");
    const rawSlug = slugifyText(raw).replace(/_/g, " ");
    const candidates = [
      raw,
      raw.toLowerCase(),
      normalizedName,
      normalizedName.toLowerCase(),
      slugifyText(raw),
      slugifyText(normalizedName),
      raw.replace(/_/g, " "),
      normalizedName.replace(/_/g, " "),
      normalizedSlug,
      rawSlug
    ];

    for (const candidate of candidates) {
      if (candidate) values.add(candidate);
    }
  }

  return values;
}

function isModuleAllowedForCurrentProfile(app, module) {
  if (!isFisioPacienteRole(app.currentProfile?.role)) return true;
  if (!isManagedProfileActive(app.currentProfile)) return false;

  const allowed = buildAllowedModuleLookup(app.currentProfile);
  if (allowed.size === 0) return false;

  const normalizedName = normalizeDashboardModuleName(module?.name ?? "");
  const candidates = [
    module?.id,
    module?.slug,
    module?.flowId,
    module?.startFlowId,
    module?.name,
    normalizedName,
    String(module?.id ?? "").toLowerCase(),
    String(module?.slug ?? "").toLowerCase(),
    String(module?.flowId ?? "").toLowerCase(),
    String(module?.startFlowId ?? "").toLowerCase(),
    String(module?.name ?? "").toLowerCase(),
    normalizedName.toLowerCase(),
    slugifyText(module?.name ?? ""),
    slugifyText(normalizedName),
    slugifyText(module?.slug ?? ""),
    slugifyText(module?.flowId ?? ""),
    slugifyText(module?.startFlowId ?? "")
  ];

  return candidates.some((candidate) => candidate && allowed.has(candidate));
}

function filterModulesForCurrentProfile(app, modules) {
  const list = Array.isArray(modules) ? modules : [];
  if (!isFisioPacienteRole(app.currentProfile?.role)) return list;
  return list.filter((module) => isModuleAllowedForCurrentProfile(app, module));
}

function getViewerModuleIdentity(module) {
  const haystack = `${module?.name ?? ""} ${module?.description ?? ""}`.toLowerCase();
  if (haystack.includes("thompson") || haystack.includes("thompsom") || haystack.includes("aquiles") || haystack.includes("tornozelo") || haystack.includes("pe")) {
    return { icon: "🦶", label: "Tornozelo", accent: "emerald" };
  }
  if (haystack.includes("joelho")) {
    return { icon: "🦵", label: "Joelho", accent: "blue" };
  }
  if (haystack.includes("ombro")) {
    return { icon: "🫲", label: "Ombro", accent: "violet" };
  }
  if (haystack.includes("lombar") || haystack.includes("coluna") || haystack.includes("cervical")) {
    return { icon: "🦴", label: "Coluna", accent: "cyan" };
  }
  if (haystack.includes("esport")) {
    return { icon: "🏃", label: "Performance", accent: "amber" };
  }
  return { icon: "💪", label: "Reabilitacao", accent: "emerald" };
}

function buildViewerModuleCoverMarkup(module) {
  const identity = getViewerModuleIdentity(module);
  return `
    <div class="viewer-module-card__cover viewer-module-card__cover--fallback viewer-module-card__cover--${identity.accent}">
      <span class="viewer-module-card__cover-icon">${identity.icon}</span>
      <span class="viewer-module-card__cover-label">${identity.label}</span>
    </div>
  `;
}

function renderViewerModulesHome(app, modules) {
  const list = $("modulesList");
  const screen = $("screenAdminModulos");
  const eyebrow = $("modulesScreenEyebrow");
  const title = $("modulesScreenTitle");
  const subtitle = $("modulesScreenSubtitle");
  const header = subtitle?.closest(".dash-header");
  const topbar = $("viewerTopbar");
  const heroPanel = $("viewerHeroPanel");
  const toolbar = $("viewerModulesToolbar");
  const searchInput = $("viewerModuleSearch");
  const searchClear = $("viewerModuleSearchClear");
  const summary = $("viewerModulesSummary");
  const heroTitle = $("viewerHeroTitle");
  const heroSubtitle = $("viewerHeroSubtitle");
  const statsGrid = $("modulesStatsGrid");
  const createWrap = $("modulesCreateWrap");
  const statTotal = $("modulesStatTotal");
  const statPublished = $("modulesStatPublished");
  const statSteps = $("modulesStatSteps");
  if (!list) return;

  const totalLabel = modules.length === 1 ? "1 protocolo liberado" : `${modules.length} protocolos liberados`;
  const searchTerm = normalizeSearchText(app.viewerModuleSearch);
  const visibleModules = searchTerm
    ? modules.filter((module) => normalizeSearchText(`${module.name} ${module.description ?? ""} ${module.slug ?? ""} ${module.flowId ?? ""}`).includes(searchTerm))
    : modules;
  const visibleLabel = visibleModules.length === 1 ? "1 resultado" : `${visibleModules.length} resultados`;
  const displayName = getUserDisplayName(app.currentProfile, app.currentUser);

  list.classList.add("viewer-modules-grid");
  if (screen) screen.classList.add("viewer-screen-mode");
  if (header) header.classList.add("viewer-home-header");
  if (topbar) topbar.classList.remove("hidden");
  if (heroPanel) heroPanel.classList.remove("hidden");
  if (toolbar) toolbar.classList.remove("hidden");
  if (eyebrow) eyebrow.textContent = `Fisioterapia guiada • ${totalLabel}`;
  if (title) title.textContent = "Meus modulos";
  if (subtitle) subtitle.textContent = "Encontre rapidamente o protocolo liberado para o seu atendimento.";
  if (heroTitle) heroTitle.textContent = `Ola, ${displayName.split(" ")[0] || "Fisio"}. Seu atendimento na Fisiotosta comeca aqui.`;
  if (heroSubtitle) heroSubtitle.textContent = "Acesse seus protocolos autorizados com busca rapida, identidade Fisiotosta e uma experiencia clinica mais clara.";
  if (searchInput && searchInput.value !== String(app.viewerModuleSearch ?? "")) searchInput.value = String(app.viewerModuleSearch ?? "");
  if (searchClear) searchClear.classList.toggle("hidden", !String(app.viewerModuleSearch ?? "").trim());
  if (summary) summary.textContent = searchTerm ? `${visibleLabel} para "${String(app.viewerModuleSearch ?? "").trim()}"` : totalLabel;
  syncViewerNotificationBadge(app);
  if (statsGrid) statsGrid.classList.add("hidden");
  if (createWrap) createWrap.classList.add("hidden");
  if (statTotal) statTotal.textContent = String(modules.length);
  if (statPublished) statPublished.textContent = String(modules.filter((module) => module.status === "published").length);
  if (statSteps) statSteps.textContent = String(modules.reduce((sum, module) => sum + Number(module.nodeCount ?? 0), 0));

  if (modules.length === 0) {
    list.innerHTML = `<div class="dashboard-empty viewer-empty-state">Seu acesso ainda nao possui protocolos liberados. Fale com o fisioterapeuta responsavel para liberar o roteiro correto.</div>`;
    return;
  }

  if (visibleModules.length === 0) {
    list.innerHTML = `<div class="dashboard-empty viewer-empty-state">Nenhum protocolo encontrado para essa busca. Tente outro nome ou limpe o campo de pesquisa.</div>`;
    return;
  }

  list.innerHTML = visibleModules.map((module) => `
    <article class="dash-card viewer-module-card">
      <span class="viewer-module-card__status viewer-module-card__status--ready">Autorizado</span>
      <div class="viewer-module-card__layout">
        ${buildViewerModuleCoverMarkup(module)}
        <div class="viewer-module-card__content">
          <div class="viewer-module-card__eyebrow">Protocolo clinico</div>
          <h3 class="viewer-module-card__title">${escapeHtml(module.name)}</h3>
          <p class="viewer-module-card__desc">${escapeHtml(module.description || "Roteiro clinico liberado para o seu perfil.")}</p>
          <div class="viewer-module-card__meta">
            <span class="viewer-module-card__pill">Individual</span>
            <span class="viewer-module-card__pill">Autorizado</span>
          </div>
          <div class="viewer-module-card__footer">
            <span class="viewer-module-card__hint">Abra o protocolo e continue seu atendimento.</span>
            <button class="btn viewer-module-card__button" type="button" data-module-action="test" data-module-id="${escapeHtml(module.id)}">Acessar</button>
          </div>
        </div>
      </div>
    </article>
  `).join("");
}

function fillViewerProfileForm(app) {
  syncOwnProfileScreenCopy(app);
  const displayName = getUserDisplayName(app.currentProfile, app.currentUser);
  const metadata = getViewerProfileMetadata(app.currentUser);
  const avatarUrl = String(app.currentProfile?.avatar_url ?? "").trim() || metadata.avatarUrl || getUserAvatarUrl(app.currentProfile, app.currentUser);
  if ($("viewerProfileName")) $("viewerProfileName").value = app.currentProfile?.full_name || metadata.fullName || displayName;
  if ($("viewerProfilePhone")) $("viewerProfilePhone").value = String(app.currentProfile?.phone ?? "").trim() || metadata.phone;
  if ($("viewerProfileEmail")) $("viewerProfileEmail").value = String(app.currentProfile?.login_email ?? app.currentUser?.email ?? "");
  if ($("viewerProfileCrefito")) $("viewerProfileCrefito").value = String(app.currentProfile?.crefito ?? "");
  if ($("viewerProfileClinic")) $("viewerProfileClinic").value = String(app.currentProfile?.clinic_name ?? "").trim() || metadata.clinic;
  if ($("viewerProfileBio")) $("viewerProfileBio").value = String(app.currentProfile?.bio ?? "").trim() || metadata.bio;
  if ($("viewerProfileAvatarUrl")) $("viewerProfileAvatarUrl").value = avatarUrl;
  if ($("viewerProfileCardName")) $("viewerProfileCardName").textContent = app.currentProfile?.full_name || metadata.fullName || displayName;
  if ($("viewerProfileCardRole")) $("viewerProfileCardRole").textContent = getRoleLabel(app.currentProfile?.role);
  setAvatarElement($("viewerProfileAvatarPreview"), displayName, avatarUrl);
}

function renderViewerProfileScreen(app) {
  syncOwnProfileScreenCopy(app);
  fillViewerProfileForm(app);
  if (isFisioPacienteRole(app.currentProfile?.role)) {
    syncViewerNotificationBadge(app);
  }
  const nav = $("navPerfil");
  if (nav) nav.classList.add("active");
  loadOwnProfileDetails(app)
    .then(() => {
      syncOwnProfileScreenCopy(app);
      fillViewerProfileForm(app);
      applyAuthUi(app);
      if (isFisioPacienteRole(app.currentProfile?.role)) {
        syncViewerNotificationBadge(app);
      }
    })
    .catch((error) => {
      console.error("Erro ao carregar perfil completo do usuario", error);
      setViewerProfileStatus(getReadableRuntimeError(error, "Nao foi possivel carregar seu perfil completo."), "error");
    });
}

function setViewerProfileStatus(message = "", tone = "") {
  const status = $("viewerProfileStatus");
  if (!status) return;
  status.textContent = message;
  status.className = "form-status";
  if (!message) {
    status.classList.add("hidden");
    return;
  }
  status.classList.remove("hidden");
  if (tone === "success") status.classList.add("form-status--success");
  if (tone === "error") status.classList.add("form-status--error");
}

async function saveViewerOwnProfile(app) {
  const name = String($("viewerProfileName")?.value ?? "").trim();
  const phone = String($("viewerProfilePhone")?.value ?? "").trim();
  const clinic = String($("viewerProfileClinic")?.value ?? "").trim();
  const bio = String($("viewerProfileBio")?.value ?? "").trim();
  const avatarUrl = String($("viewerProfileAvatarUrl")?.value ?? "").trim();

  if (!name) {
    throw new Error("Informe seu nome completo para salvar o perfil.");
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: name,
      phone,
      clinic_name: clinic,
      bio,
      avatar_url: avatarUrl
    })
    .eq("id", app.currentUser.id);

  if (profileError) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(profileError);
    if (missingColumnsMessage) {
      throw new Error("Para salvar telefone, clinica, bio e foto na tabela profiles, rode o SQL atualizado do projeto no Supabase primeiro.");
    }
    throw profileError;
  }
  app.currentProfile = {
    ...(app.currentProfile ?? {}),
    full_name: name,
    phone,
    clinic_name: clinic,
    bio,
    avatar_url: avatarUrl
  };
  app.ownProfileDetailsLoadedFor = String(app.currentUser?.id ?? "").trim();
}

async function saveViewerAvatarOnly(app, avatarUrl) {
  const safeAvatarUrl = String(avatarUrl ?? "").trim();
  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: safeAvatarUrl
    })
    .eq("id", app.currentUser.id);

  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) {
      throw new Error("Para salvar a foto na tabela profiles, rode o SQL atualizado do projeto no Supabase primeiro.");
    }
    throw error;
  }

  app.currentProfile = {
    ...(app.currentProfile ?? {}),
    avatar_url: safeAvatarUrl
  };
  app.ownProfileDetailsLoadedFor = String(app.currentUser?.id ?? "").trim();
}

function refreshViewerAvatarPreview(app, avatarUrl) {
  const displayName = getUserDisplayName(app.currentProfile, app.currentUser);
  const safeAvatarUrl = String(avatarUrl ?? "").trim();
  if ($("viewerProfileAvatarUrl")) $("viewerProfileAvatarUrl").value = safeAvatarUrl;
  setAvatarElement($("viewerProfileAvatarPreview"), displayName, safeAvatarUrl);
}

async function showViewerNotifications(app) {
  if (canManageProfiles(app?.currentProfile?.role)) {
    await showAdminSecurityNotifications(app);
    return;
  }
  const moduleCount = getModulesForView(app).length;
  const displayName = getUserDisplayName(app.currentProfile, app.currentUser);
  const popover = $("viewerNotificationPopover");
  const title = $("viewerNotificationTitle");
  const text = $("viewerNotificationText");
  const count = $("viewerNotificationCount");
  const secondaryLabel = $("viewerNotificationSecondaryLabel");
  const secondaryValue = $("viewerNotificationSecondaryValue");
  const footnote = $("viewerNotificationFootnote");
  const list = $("viewerNotificationList");
  if (!popover) return;
  if (title) title.textContent = `Ola, ${displayName.split(" ")[0] || "Fisio"}`;
  if (text) text.textContent = moduleCount === 0
    ? "No momento voce ainda nao possui protocolos liberados. Fale com o fisioterapeuta responsavel para liberar seu atendimento."
    : `Voce tem ${moduleCount} ${moduleCount === 1 ? "protocolo liberado" : "protocolos liberados"} para continuar seu atendimento agora.`;
  if (count) count.textContent = String(moduleCount);
  if (secondaryLabel) secondaryLabel.textContent = "Status";
  if (secondaryValue) secondaryValue.textContent = "Autorizado";
  if (footnote) footnote.textContent = moduleCount === 0
    ? "Assim que um protocolo for liberado, ele aparece aqui."
    : "Tudo liberado para uso no seu perfil.";
  if (list) {
    list.innerHTML = "";
    list.classList.add("hidden");
  }
  markViewerNotificationsSeen(app);
  syncViewerNotificationBadge(app);
  popover.classList.remove("hidden");
  requestAnimationFrame(() => popover.classList.add("viewer-notification-popover--open"));
}

function hideViewerNotifications() {
  const popover = $("viewerNotificationPopover");
  if (!popover) return;
  popover.classList.remove("viewer-notification-popover--open");
  window.setTimeout(() => {
    if (!popover.classList.contains("viewer-notification-popover--open")) {
      popover.classList.add("hidden");
    }
  }, 180);
}

function getViewerNotificationFingerprint(app) {
  const modules = getModulesForView(app);
  return modules
    .map((module) => `${module.id}|${module.updatedAt ?? module.createdAt ?? ""}|${module.status ?? ""}`)
    .sort()
    .join("||");
}

function markViewerNotificationsSeen(app) {
  const userId = String(app.currentUser?.id ?? "anon");
  const fingerprint = getViewerNotificationFingerprint(app);
  const payload = { [userId]: fingerprint };
  let merged = payload;
  try {
    const previous = safeJsonParse(localStorage.getItem(STORAGE.viewerNotificationsSeen) || "{}");
    if (previous.ok && previous.value && typeof previous.value === "object") {
      merged = { ...previous.value, ...payload };
    }
  } catch {}
  try {
    localStorage.setItem(STORAGE.viewerNotificationsSeen, JSON.stringify(merged));
  } catch {}
}

function hasUnreadViewerNotifications(app) {
  const userId = String(app.currentUser?.id ?? "anon");
  const current = getViewerNotificationFingerprint(app);
  if (!current) return false;
  try {
    const parsed = safeJsonParse(localStorage.getItem(STORAGE.viewerNotificationsSeen) || "{}");
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return true;
    const seen = String(parsed.value[userId] ?? "");
    return seen !== current;
  } catch {
    return true;
  }
}

function syncViewerNotificationBadge(app) {
  const hasUnread = canManageProfiles(app?.currentProfile?.role)
    ? hasUnreadAdminSecurityNotifications(app)
    : hasUnreadViewerNotifications(app);
  document
    .querySelectorAll(".viewer-topbar__badge-dot, .sidebar__alert-dot")
    .forEach((el) => el.classList.toggle("hidden", !hasUnread));
}

function getModulesForView(app) {
  const supabaseModules = getSupabaseBackedModules(app);
  if (app.authSession && app.hasLoadedSupabaseModules && supabaseModules.length > 0) {
    return filterModulesForCurrentProfile(app, supabaseModules);
  }
  if (supabaseModules.length > 0) return filterModulesForCurrentProfile(app, supabaseModules);
  const localModules = getProtocolModules(app.protocol).map((module) => ({
    ...module,
    source: "local",
    status: "local",
    createdAt: null,
    updatedAt: null,
    slug: module.id,
    ownerId: String(app.currentUser?.id ?? "")
  }));
  return filterModulesForCurrentProfile(app, localModules);
}

function formatModuleDate(dateValue) {
  if (!dateValue) return "Sem data";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function renderModulesList(app) {
  const list = $("modulesList");
  if (!list) return;
  list.innerHTML = "";

  const eyebrow = $("modulesScreenEyebrow");
  const title = $("modulesScreenTitle");
  const subtitle = $("modulesScreenSubtitle");
  const header = subtitle?.closest(".dash-header");
  const screen = $("screenAdminModulos");
  const topbar = $("viewerTopbar");
  const heroPanel = $("viewerHeroPanel");
  const toolbar = $("viewerModulesToolbar");
  const statTotal = $("modulesStatTotal");
  const statPublished = $("modulesStatPublished");
  const statSteps = $("modulesStatSteps");
  const statsGrid = $("modulesStatsGrid");
  const btnCreateNew = $("btnCreateNew");
  const createCard = btnCreateNew?.closest(".dash-card--new");
  const createWrap = $("modulesCreateWrap");
  const modules = getModulesForView(app);
  const canEdit = canEditModules(app.currentProfile?.role);
  modules.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const publishedCount = modules.filter((module) => module.status === "published").length;
  const totalSteps = modules.reduce((sum, module) => sum + Number(module.nodeCount ?? 0), 0);

  list.classList.toggle("viewer-modules-grid", !canEdit);
  if (header) header.classList.toggle("viewer-home-header", !canEdit);
  if (screen) screen.classList.toggle("viewer-screen-mode", !canEdit);
  if (topbar) topbar.classList.toggle("hidden", canEdit);
  if (heroPanel) heroPanel.classList.toggle("hidden", canEdit);
  if (toolbar) toolbar.classList.toggle("hidden", canEdit);
  if (eyebrow) eyebrow.textContent = "Biblioteca Clinica";
  if (title) title.textContent = "Gerenciar Modulos";
  if (statsGrid) statsGrid.classList.toggle("hidden", !canEdit);
  if (createWrap) createWrap.classList.toggle("hidden", !canEdit);
  if (createCard) createCard.classList.toggle("hidden", !canEdit);

  if (!canEdit) {
    renderViewerModulesHome(app, modules);
    return;
  }

  if (subtitle) {
    subtitle.textContent = modules.some((module) => module.source === "supabase")
      ? "Sua biblioteca clinica mostra os módulos cadastrados, com status e estrutura atualizados."
      : "Crie ou edite os roteiros clínicos que serão disponibilizados aos fisioterapeutas.";
  }
  if (statTotal) statTotal.textContent = String(modules.length);
  if (statPublished) statPublished.textContent = String(publishedCount);
  if (statSteps) statSteps.textContent = String(totalSteps);

  if (modules.length === 0) {
    list.innerHTML = `<div class="dashboard-empty">Nenhum módulo encontrado ainda. Clique em "Criar Passo a Passo" para começar.</div>`;
    return;
  }

  for (const module of modules) {
    const card = document.createElement("div");
    const statusLabel = module.status === "published" ? "Publicado" : module.status === "draft" ? "Rascunho" : module.status === "archived" ? "Arquivado" : "Disponivel";
    const dateLabel = formatModuleDate(module.updatedAt ?? module.createdAt);
    card.className = "dash-card module-card";
    card.innerHTML = `
      <div class="module-card__top">
        <div class="module-card__icon">${module.icon}</div>
        <span class="module-card__badge module-card__badge--${module.status}">${statusLabel}</span>
      </div>
      <div class="module-card__body">
        <h3 class="dash-card-title">${module.name}</h3>
        <p class="dash-card-desc">${module.description}</p>
      </div>
      <div class="module-card__metrics">
        <div class="module-card__metric">
          <span class="module-card__metric-label">Etapas</span>
          <strong>${module.nodeCount}</strong>
        </div>
      </div>
      <div class="module-card__footer">
        <span class="module-card__date">Atualizado em ${dateLabel}</span>
      </div>
      <div class="dash-card-actions module-card__actions">
        <button class="btn btn--start-sm" type="button" data-module-action="test" data-module-id="${module.id}">Testar Fluxo</button>
        <button class="btn btn--ghost" type="button" data-module-action="edit" data-module-id="${module.id}">Editar Passo a Passo</button>
        <button class="btn btn--danger" type="button" data-module-action="delete" data-module-id="${module.id}">Excluir Módulo</button>
      </div>
    `;
    list.appendChild(card);
  }
}

async function loadManagedProfiles(app) {
  if (!app.authSession || !app.currentUser?.id || !canManageProfiles(app.currentProfile?.role)) {
    app.managedProfiles = [];
    return [];
  }

  const childRole = getManagedChildRole(app.currentProfile?.role);
  if (!childRole) {
    app.managedProfiles = [];
    return [];
  }

  const extendedSelect = "id, full_name, role, parent_admin_id, login_email, crefito, is_active, allowed_modules, avatar_url, cep, street, address_number, address_complement, neighborhood, city, state, created_at";
  const fallbackSelect = "id, full_name, role, parent_admin_id, login_email, crefito, is_active, allowed_modules, cep, street, address_number, address_complement, neighborhood, city, state, created_at";

  let query = supabase
    .from("profiles")
    .select(extendedSelect)
    .eq("role", childRole);

  if (isFisioAdminRole(app.currentProfile?.role)) {
    query = query.eq("parent_admin_id", app.currentUser.id);
  }

  let { data, error } = await query.order("created_at", { ascending: false });
  if (error && getMissingManagedProfileColumnsMessage(error)) {
    let fallbackQuery = supabase
      .from("profiles")
      .select(fallbackSelect)
      .eq("role", childRole);
    if (isFisioAdminRole(app.currentProfile?.role)) {
      fallbackQuery = fallbackQuery.eq("parent_admin_id", app.currentUser.id);
    }
    const fallbackResult = await fallbackQuery.order("created_at", { ascending: false });
    data = fallbackResult.data;
    error = fallbackResult.error;
  }
  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) throw new Error(missingColumnsMessage);
    throw error;
  }
  app.managedProfiles = Array.isArray(data) ? data : [];
  return app.managedProfiles;
}

function formatLoginHistoryDateTime(dateValue) {
  if (!dateValue) return "Sem registro";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getAdminSecurityNotificationFingerprint(app) {
  const items = Array.isArray(app.adminSecurityNotifications) ? app.adminSecurityNotifications : [];
  return items
    .map((item) => `${item.profile_id}|${item.logged_at}|${item.login_status}|${item.blocked_reason ?? ""}`)
    .sort()
    .join("||");
}

function markAdminSecurityNotificationsSeen(app) {
  const userId = String(app.currentUser?.id ?? "anon");
  const fingerprint = getAdminSecurityNotificationFingerprint(app);
  const payload = { [userId]: fingerprint };
  let merged = payload;
  try {
    const previous = safeJsonParse(localStorage.getItem("thompson.admin.security.notifications.seen.v1") || "{}");
    if (previous.ok && previous.value && typeof previous.value === "object") {
      merged = { ...previous.value, ...payload };
    }
  } catch {}
  try {
    localStorage.setItem("thompson.admin.security.notifications.seen.v1", JSON.stringify(merged));
  } catch {}
}

function hasUnreadAdminSecurityNotifications(app) {
  const userId = String(app.currentUser?.id ?? "anon");
  const current = getAdminSecurityNotificationFingerprint(app);
  if (!current) return false;
  try {
    const parsed = safeJsonParse(localStorage.getItem("thompson.admin.security.notifications.seen.v1") || "{}");
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return true;
    const seen = String(parsed.value[userId] ?? "");
    return seen !== current;
  } catch {
    return true;
  }
}

async function loadAdminSecurityNotifications(app) {
  if (!app.authSession || !canManageProfiles(app.currentProfile?.role)) {
    app.adminSecurityNotifications = [];
    return [];
  }
  const { data, error } = await supabase.rpc("list_admin_security_notifications");
  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) throw new Error(missingColumnsMessage);
    throw error;
  }
  app.adminSecurityNotifications = Array.isArray(data) ? data : [];
  return app.adminSecurityNotifications;
}

async function refreshAdminSecurityNotificationsSilently(app) {
  if (!app?.authSession || !canManageProfiles(app?.currentProfile?.role)) return;
  try {
    await loadAdminSecurityNotifications(app);
    applyAuthUi(app);
    const popover = $("viewerNotificationPopover");
    if (popover && !popover.classList.contains("hidden")) {
      renderAdminSecurityNotifications(app);
    } else {
      syncViewerNotificationBadge(app);
    }
  } catch (error) {
    console.error("Erro ao atualizar alertas de seguranca em segundo plano", error);
  }
}

function renderAdminSecurityNotifications(app) {
  const popover = $("viewerNotificationPopover");
  const title = $("viewerNotificationTitle");
  const text = $("viewerNotificationText");
  const count = $("viewerNotificationCount");
  const secondaryLabel = $("viewerNotificationSecondaryLabel");
  const secondaryValue = $("viewerNotificationSecondaryValue");
  const footnote = $("viewerNotificationFootnote");
  const list = $("viewerNotificationList");
  if (!popover || !title || !text || !count || !secondaryLabel || !secondaryValue || !footnote || !list) return;

  const items = Array.isArray(app.adminSecurityNotifications) ? app.adminSecurityNotifications : [];
  const total = items.length;
  title.textContent = "Alertas de seguranca";
  text.textContent = total === 0
    ? "Nenhuma tentativa recente de novo device precisa da sua liberacao."
    : total === 1
      ? "1 paciente tentou entrar em um novo device e aguarda sua liberacao."
      : `${total} pacientes tentaram entrar em novos devices e aguardam sua liberacao.`;
  count.textContent = String(total);
  secondaryLabel.textContent = "Status";
  secondaryValue.textContent = total === 0 ? "Seguro" : "Pendentes";
  footnote.textContent = total === 0
    ? "Tudo sob controle no momento."
    : "Clique no alerta para abrir a lista do paciente e liberar o novo device.";

  if (total === 0) {
    list.innerHTML = "";
    list.classList.add("hidden");
  } else {
    list.innerHTML = items.map((item) => `
      <button
        class="admin-security-alert"
        type="button"
        data-admin-security-profile-id="${escapeHtml(item.profile_id)}"
      >
        <strong>${escapeHtml(String(item.profile_name ?? "Paciente"))}</strong>
        <span>${escapeHtml(String(item.device_label ?? item.device_kind ?? "Novo device"))}</span>
        <small>${escapeHtml(formatLoginHistoryDateTime(item.logged_at))}</small>
      </button>
    `).join("");
    list.classList.remove("hidden");
  }

  markAdminSecurityNotificationsSeen(app);
  syncViewerNotificationBadge(app);
  popover.classList.remove("hidden");
  requestAnimationFrame(() => popover.classList.add("viewer-notification-popover--open"));
}

async function showAdminSecurityNotifications(app) {
  await loadAdminSecurityNotifications(app);
  applyAuthUi(app);
  renderAdminSecurityNotifications(app);
}

function getLoginHistoryStatusMeta(status, blockedReason = "") {
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  const normalizedReason = String(blockedReason ?? "").trim().toLowerCase();
  if (normalizedStatus === "authorized_first_device") {
    return { label: "Primeiro device", tone: "success", description: "Primeiro aparelho vinculado ao paciente." };
  }
  if (normalizedStatus === "authorized_known_device") {
    return { label: "Autorizado", tone: "success", description: "Login feito no device ja vinculado." };
  }
  if (normalizedStatus === "blocked_new_device") {
    return {
      label: "Bloqueado",
      tone: "danger",
      description: normalizedReason === "different_device"
        ? "Tentativa em device diferente do primeiro acesso."
        : "Tentativa bloqueada por seguranca."
    };
  }
  if (normalizedStatus === "device_lock_released") {
    return { label: "Novo device liberado", tone: "info", description: "O fisioterapeuta liberou a troca de aparelho." };
  }
  return { label: "Registro", tone: "neutral", description: "Evento de login registrado no historico." };
}

function closeManagedDeviceHistoryModal(app) {
  app.deviceHistoryModalProfileId = null;
  app.deviceHistoryModalProfileName = "";
  const modal = $("managedDeviceHistoryModal");
  if (modal) modal.classList.add("hidden");
}

function renderManagedDeviceHistoryModal(app) {
  const modal = $("managedDeviceHistoryModal");
  const title = $("managedDeviceHistoryModalTitle");
  const subtitle = $("managedDeviceHistoryModalSubtitle");
  const list = $("managedDeviceHistoryList");
  const releaseButton = $("btnReleaseManagedDeviceLock");
  if (!modal || !title || !subtitle || !list || !releaseButton) return;

  const profile = Array.isArray(app.managedProfiles)
    ? app.managedProfiles.find((item) => String(item?.id ?? "").trim() === String(app.deviceHistoryModalProfileId ?? "").trim())
    : null;
  const profileName = String(profile?.full_name ?? app.deviceHistoryModalProfileName ?? "Paciente").trim() || "Paciente";
  title.textContent = `Historico de login de ${profileName}`;
  subtitle.textContent = "Veja dia, horario e device usado em cada tentativa de acesso deste paciente.";
  releaseButton.disabled = !profile;

  if (app.isDeviceHistoryLoading) {
    list.innerHTML = `<div class="device-history-empty">Carregando historico...</div>`;
    modal.classList.remove("hidden");
    return;
  }

  const entries = Array.isArray(app.deviceHistoryEntries) ? app.deviceHistoryEntries : [];
  if (entries.length === 0) {
    list.innerHTML = `<div class="device-history-empty">Nenhum login registrado ainda para este paciente.</div>`;
    modal.classList.remove("hidden");
    return;
  }

  list.innerHTML = entries.map((entry) => {
    const meta = getLoginHistoryStatusMeta(entry?.login_status, entry?.blocked_reason);
    const whenLabel = formatLoginHistoryDateTime(entry?.logged_at);
    const deviceLabel = String(entry?.device_label ?? "").trim() || "Device nao identificado";
    const kindLabel = String(entry?.device_kind ?? "").trim() || "Nao informado";
    return `
      <div class="device-history-item">
        <div class="device-history-item__top">
          <strong>${escapeHtml(whenLabel)}</strong>
          <span class="device-history-badge device-history-badge--${escapeHtml(meta.tone)}">${escapeHtml(meta.label)}</span>
        </div>
        <div class="device-history-item__meta">
          <span>${escapeHtml(deviceLabel)}</span>
          <span>${escapeHtml(kindLabel)}</span>
        </div>
        <p class="device-history-item__desc">${escapeHtml(meta.description)}</p>
      </div>
    `;
  }).join("");

  modal.classList.remove("hidden");
}

async function loadManagedProfileLoginHistory(app, profileId) {
  const safeProfileId = String(profileId ?? "").trim();
  if (!safeProfileId) return [];
  const { data, error } = await supabase.rpc("list_managed_patient_login_history", {
    p_profile_id: safeProfileId
  });
  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) throw new Error(missingColumnsMessage);
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

async function openManagedProfileDeviceHistoryModal(app, profile) {
  if (!profile || !isFisioPacienteRole(profile?.role)) return;
  app.deviceHistoryModalProfileId = String(profile.id ?? "").trim();
  app.deviceHistoryModalProfileName = String(profile.full_name ?? "").trim();
  app.isDeviceHistoryLoading = true;
  app.deviceHistoryEntries = [];
  renderManagedDeviceHistoryModal(app);
  try {
    app.deviceHistoryEntries = await loadManagedProfileLoginHistory(app, profile.id);
  } finally {
    app.isDeviceHistoryLoading = false;
    renderManagedDeviceHistoryModal(app);
  }
}

async function releaseManagedPatientDeviceLock(app, profile) {
  const safeProfileId = String(profile?.id ?? "").trim();
  if (!safeProfileId) throw new Error("Paciente invalido para liberar device.");
  const { error } = await supabase.rpc("release_managed_patient_device_lock", {
    p_profile_id: safeProfileId
  });
  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) throw new Error(missingColumnsMessage);
    throw error;
  }
  app.deviceHistoryEntries = await loadManagedProfileLoginHistory(app, safeProfileId);
  try {
    await loadAdminSecurityNotifications(app);
  } catch (error) {
    console.error("Erro ao atualizar notificacoes de seguranca apos liberacao", error);
  }
  applyAuthUi(app);
  renderManagedDeviceHistoryModal(app);
}

async function openAdminSecurityNotification(app, profileId) {
  const safeProfileId = String(profileId ?? "").trim();
  if (!safeProfileId) return;
  try {
    await loadManagedProfiles(app);
  } catch (error) {
    console.error("Erro ao atualizar perfis antes de abrir alerta de seguranca", error);
  }
  const profile = Array.isArray(app.managedProfiles)
    ? app.managedProfiles.find((item) => String(item?.id ?? "").trim() === safeProfileId)
    : null;
  if (!profile) {
    throw new Error("Nao foi possivel localizar o paciente desse alerta.");
  }
  app.view = "fisios";
  renderState(app);
  hideViewerNotifications();
  await openManagedProfileDeviceHistoryModal(app, profile);
}

function formatDashboardDate(dateValue) {
  if (!dateValue) return "Cadastro recente";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Cadastro recente";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function normalizeDashboardModuleName(moduleName) {
  const normalized = String(moduleName ?? "").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower === "roteiro de thompsom" || lower === "roteiro thompsom") {
    return "Roteiro de Thompson";
  }
  return normalized;
}

function renderDashboard(app) {
  const subtitle = $("dashboardSubtitle");
  const statLabel1 = $("dashboardStatLabel1");
  const statLabel2 = $("dashboardStatLabel2");
  const statLabel3 = $("dashboardStatLabel3");
  const statValue1 = $("dashboardStatValue1");
  const statValue2 = $("dashboardStatValue2");
  const statValue3 = $("dashboardStatValue3");
  const statMeta1 = $("dashboardStatMeta1");
  const statMeta2 = $("dashboardStatMeta2");
  const statMeta3 = $("dashboardStatMeta3");
  const donut = $("dashboardDonut");
  const donutValue = $("dashboardDonutValue");
  const ratioTag = $("dashboardRatioTag");
  const breakdown = $("dashboardBreakdown");
  const moduleChart = $("dashboardModuleChart");
  const highlights = $("dashboardHighlights");
  const recentProfiles = $("dashboardRecentProfiles");
  if (!subtitle || !statLabel1 || !statLabel2 || !statLabel3 || !statValue1 || !statValue2 || !statValue3 || !breakdown || !moduleChart || !highlights || !recentProfiles || !donut || !donutValue || !ratioTag) return;

  const role = String(app.currentProfile?.role ?? "");
  const profiles = Array.isArray(app.managedProfiles) ? app.managedProfiles : [];
  const activeProfiles = profiles.filter((profile) => isManagedProfileActive(profile));
  const inactiveProfiles = profiles.filter((profile) => !isManagedProfileActive(profile));
  const moduleRows = Array.isArray(app.supabaseModules) ? app.supabaseModules : [];
  const totalAssignments = profiles.reduce((total, profile) => total + getManagedProfileModules(profile).length, 0);
  const moduleUsage = new Map();

  for (const row of moduleRows) {
    const moduleName = normalizeDashboardModuleName(row?.name ?? row?.slug ?? "");
    if (moduleName && !moduleUsage.has(moduleName)) {
      moduleUsage.set(moduleName, 0);
    }
  }

  for (const profile of profiles) {
    for (const moduleName of getManagedProfileModules(profile)) {
      const key = normalizeDashboardModuleName(moduleName);
      if (!key) continue;
      moduleUsage.set(key, (moduleUsage.get(key) ?? 0) + 1);
    }
  }

  const moduleEntries = Array.from(moduleUsage.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
  const totalProfiles = profiles.length;
  const activePercentage = totalProfiles > 0 ? Math.round((activeProfiles.length / totalProfiles) * 100) : 0;
  const uniqueModules = moduleUsage.size;

  if (isOwnerRole(role)) {
    subtitle.textContent = "Acompanhe a base de clientes administradores, a distribuição de módulos e o ritmo operacional da plataforma.";
    statLabel1.textContent = "Clientes Ativos";
    statValue1.textContent = String(activeProfiles.length);
    statMeta1.textContent = "Fisios admin ativos e aptos para operar na plataforma.";
    statLabel2.textContent = "Clientes Inativos";
    statValue2.textContent = String(inactiveProfiles.length);
    statMeta2.textContent = "Contas pausadas ou ainda não liberadas para produção.";
    statLabel3.textContent = "Módulos em Uso";
    statValue3.textContent = String(totalAssignments);
    statMeta3.textContent = "Soma de liberações distribuídas entre todos os clientes.";
  } else {
    subtitle.textContent = "Acompanhe seus fisio pacientes, os módulos que você liberou e o panorama operacional do seu app.";
    statLabel1.textContent = "Fisio Pacientes Ativos";
    statValue1.textContent = String(activeProfiles.length);
    statMeta1.textContent = "Fisio pacientes com login ativo e acesso liberado.";
    statLabel2.textContent = "Módulos Criados";
    statValue2.textContent = String(moduleRows.length);
    statMeta2.textContent = "Módulos publicados no seu ambiente e disponíveis para gestão.";
    statLabel3.textContent = "Liberações Ativas";
    statValue3.textContent = String(totalAssignments);
    statMeta3.textContent = "Total de liberações de módulos vinculadas aos seus fisio pacientes.";
  }

  donut.style.setProperty("--dashboard-active", `${activePercentage}%`);
  donutValue.textContent = `${activePercentage}%`;
  ratioTag.textContent = `${activeProfiles.length} ativos de ${totalProfiles}`;

  breakdown.innerHTML = `
    <div class="dashboard-breakdown__item">
      <span class="dashboard-breakdown__dot dashboard-breakdown__dot--active"></span>
      <div>
        <strong>${activeProfiles.length}</strong>
        <span>Perfis ativos</span>
      </div>
    </div>
    <div class="dashboard-breakdown__item">
      <span class="dashboard-breakdown__dot dashboard-breakdown__dot--inactive"></span>
      <div>
        <strong>${inactiveProfiles.length}</strong>
        <span>Perfis inativos</span>
      </div>
    </div>
    <div class="dashboard-breakdown__item">
      <span class="dashboard-breakdown__dot dashboard-breakdown__dot--modules"></span>
      <div>
        <strong>${uniqueModules}</strong>
        <span>Módulos diferentes liberados no painel</span>
      </div>
    </div>
  `;

  if (moduleEntries.length === 0) {
    moduleChart.innerHTML = `<div class="dashboard-empty">Nenhum módulo liberado ainda para montar o gráfico.</div>`;
  } else {
    const maxValue = Math.max(...moduleEntries.map(([, value]) => value), 1);
    moduleChart.innerHTML = moduleEntries.map(([label, value]) => `
      <div class="dashboard-bar">
        <div class="dashboard-bar__top">
          <strong>${label}</strong>
          <span>${value} ${value === 1 ? "perfil" : "perfis"}</span>
        </div>
        <div class="dashboard-bar__track">
          <div class="dashboard-bar__fill" style="width:${Math.max(14, Math.round((value / maxValue) * 100))}%"></div>
        </div>
      </div>
    `).join("");
  }

  highlights.innerHTML = `
    <div class="dashboard-highlight dashboard-highlight--blue">
      <span class="dashboard-highlight__label">Base total</span>
      <strong>${totalProfiles}</strong>
      <small>Perfis monitorados neste painel</small>
    </div>
    <div class="dashboard-highlight dashboard-highlight--green">
      <span class="dashboard-highlight__label">Média por perfil</span>
      <strong>${totalProfiles > 0 ? (totalAssignments / totalProfiles).toFixed(1) : "0.0"}</strong>
      <small>Liberações médias por perfil cadastrado</small>
    </div>
    <div class="dashboard-highlight dashboard-highlight--dark">
      <span class="dashboard-highlight__label">Módulos Diferentes</span>
      <strong>${uniqueModules}</strong>
      <small>Quantidade de módulos diferentes que aparecem nas liberações atuais</small>
    </div>
  `;

  const recent = [...profiles].slice(0, 4);
  if (recent.length === 0) {
    recentProfiles.innerHTML = `<div class="dashboard-empty">Nenhum perfil encontrado ainda.</div>`;
    return;
  }

  recentProfiles.innerHTML = recent.map((profile) => {
    const profileName = String(profile.full_name ?? "Sem nome");
    const profileEmail = getManagedProfileEmail(profile);
    const statusClass = isManagedProfileActive(profile) ? "status-active" : "status-inactive";
    const statusLabel = isManagedProfileActive(profile) ? "Ativo" : "Inativo";
    const avatarUrl = String(profile.avatar_url ?? "").trim();
    const avatarMarkup = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(profileName)}">`
      : escapeHtml(getUserInitial(profileName));
    return `
      <div class="dashboard-recent-item">
        <div class="dashboard-recent-item__avatar ${avatarUrl ? "dashboard-recent-item__avatar--image" : ""}">${avatarMarkup}</div>
        <div class="dashboard-recent-item__content">
          <strong>${escapeHtml(profileName)}</strong>
          <span>${escapeHtml(profileEmail)}</span>
          <small>${formatDashboardDate(profile.created_at)}</small>
        </div>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
    `;
  }).join("");
}

function renderManagedProfiles(app) {
  const tableBody = $("adminFisiosTableBody");
  const tabActive = $("tabActiveFisios");
  const tabInactive = $("tabInactiveFisios");
  const statActive = $("fisiosStatActive");
  const statInactive = $("fisiosStatInactive");
  const statModules = $("fisiosStatModules");
  const screenTitle = $("fisiosScreenTitle");
  const screenSubtitle = $("fisiosScreenSubtitle");
  const formTitle = $("fisioFormTitle");
  const formSubtitle = $("fisioFormSubtitle");
  const newButton = $("btnNewFisio");
  if (!tableBody) return;

  const context = getManagedProfileContext(app.currentProfile?.role);
  if (screenTitle) screenTitle.textContent = context.listTitle;
  if (screenSubtitle) screenSubtitle.textContent = context.listSubtitle;
  if (formTitle) formTitle.textContent = context.formTitle;
  if (formSubtitle) formSubtitle.textContent = context.formSubtitle;
  if (newButton) newButton.textContent = context.buttonLabel;
  applyManagedProfileFormMode(app);

  const profiles = Array.isArray(app.managedProfiles) ? app.managedProfiles : [];
  const activeProfiles = profiles.filter((profile) => isManagedProfileActive(profile));
  const inactiveProfiles = profiles.filter((profile) => !isManagedProfileActive(profile));
  const modulesCount = profiles.reduce((total, profile) => total + getManagedProfileModules(profile).length, 0);

  if (tabActive) tabActive.textContent = `Ativos (${activeProfiles.length})`;
  if (tabInactive) tabInactive.textContent = `Inativos (${inactiveProfiles.length})`;
  if (statActive) statActive.textContent = String(activeProfiles.length);
  if (statInactive) statInactive.textContent = String(inactiveProfiles.length);
  if (statModules) statModules.textContent = String(modulesCount);

  tableBody.innerHTML = "";
  if (profiles.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5" class="table-empty">${context.emptyState}</td>`;
    tableBody.appendChild(row);
    return;
  }

  for (const profile of profiles) {
    const modules = getManagedProfileModules(profile);
    const moduleHtml = modules.length > 0
      ? modules.map((moduleName) => `<span class="pill-sm">${String(moduleName)}</span>`).join(" ")
      : '<span class="muted">Sem modulos liberados</span>';
    const crefito = getManagedProfileCrefito(profile);
    const isActive = isManagedProfileActive(profile);
    const displayName = String(profile.full_name ?? "Sem nome");
    const email = getManagedProfileEmail(profile);
    const profileInitial = getUserInitial(displayName);
    const avatarUrl = String(profile.avatar_url ?? "").trim();
    const avatarMarkup = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}" />`
      : profileInitial;
    const accessActionLabel = isActive ? "Inativar" : "Reativar";
    const accessActionClass = isActive ? "btn btn--danger btn--sm" : "btn btn--ghost btn--sm";
    const historyButtonMarkup = isFisioPacienteRole(profile?.role)
      ? `<button class="btn btn--ghost btn--sm admin-table__history-btn" type="button" data-managed-profile-action="device-history" data-profile-id="${escapeHtml(profile.id)}" aria-label="Ver historico de login">Lista</button>`
      : "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="admin-person">
          <div class="admin-person__avatar ${avatarUrl ? "admin-person__avatar--image" : ""}">${avatarMarkup}</div>
          <div class="admin-person__content">
            <strong>${displayName}</strong>
            <small class="muted">${crefito ? `CREFITO: ${crefito}` : "Sem CREFITO informado"}</small>
          </div>
        </div>
      </td>
      <td>
        <div class="admin-contact">
          <div class="admin-contact__email">${email}</div>
          <small class="muted">${isActive ? "Acesso habilitado" : "Acesso pausado"}</small>
        </div>
      </td>
      <td>${moduleHtml}</td>
      <td><span class="status-badge ${isActive ? "status-active" : "status-inactive"}">${isActive ? "Ativo" : "Inativo"}</span></td>
      <td>
        <div class="admin-table__actions">
          ${historyButtonMarkup}
          <button class="btn btn--ghost btn--sm" type="button" data-managed-profile-action="edit" data-profile-id="${escapeHtml(profile.id)}">Editar</button>
          <button class="${accessActionClass}" type="button" data-managed-profile-action="toggle-access" data-next-active="${isActive ? "false" : "true"}" data-profile-id="${escapeHtml(profile.id)}">${accessActionLabel}</button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  }
}

async function createManagedProfileFromForm(app) {
  if (!app.currentUser?.id) {
    throw new Error("Sessao do administrador nao encontrada.");
  }

  const name = String($("nomeFisioInput")?.value ?? "").trim();
  const email = String($("emailFisioInput")?.value ?? "").trim().toLowerCase();
  const password = String($("senhaFisioInput")?.value ?? "");
  const crefito = String($("crefitoInput")?.value ?? "").trim().toUpperCase();
  const cep = String($("cepInput")?.value ?? "").trim();
  const street = String($("ruaInput")?.value ?? "").trim();
  const addressNumber = String($("numeroInput")?.value ?? "").trim();
  const addressComplement = String($("complementoInput")?.value ?? "").trim();
  const neighborhood = String($("bairroInput")?.value ?? "").trim();
  const city = String($("cidadeInput")?.value ?? "").trim();
  const state = String($("ufInput")?.value ?? "").trim().toUpperCase();
  const childRole = getManagedChildRole(app.currentProfile?.role);
  const selectedModules = getSelectedManagedModuleValues();

  if (!name) throw new Error("Preencha o nome completo.");
  if (!email) throw new Error("Preencha o e-mail de acesso.");
  if (!password || password.length < 6) throw new Error("A senha inicial precisa ter pelo menos 6 caracteres.");
  if (!childRole) throw new Error("Seu perfil atual nao pode cadastrar usuarios por esta tela.");

  const adminClient = createIsolatedSupabaseClient();
  let managedUserId = "";
  const { data: authData, error: authError } = await adminClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        role: childRole,
        login_email: email
      }
    }
  });

  if (authError) {
    const isAlreadyRegistered = /user already registered/i.test(String(authError.message ?? ""));
    if (!isAlreadyRegistered) throw authError;

    const { data: existingAuthData, error: existingAuthError } = await adminClient.auth.signInWithPassword({
      email,
      password
    });
    if (existingAuthError) {
      throw new Error("Este e-mail ja esta cadastrado no Auth. Se quiser reaproveitar este login, informe a senha correta desse usuario ou exclua-o no Supabase Auth antes de tentar novamente.");
    }
    managedUserId = String(existingAuthData?.user?.id ?? "").trim();
  } else {
    managedUserId = String(authData?.user?.id ?? "").trim();
  }

  if (!managedUserId) {
    throw new Error("Nao foi possivel obter o ID do usuario criado no Supabase.");
  }

  const profilePayload = {
    id: managedUserId,
    full_name: name,
    role: childRole,
    parent_admin_id: isFisioAdminRole(app.currentProfile?.role) ? app.currentUser.id : null,
    login_email: email,
    crefito,
    is_active: true,
    allowed_modules: selectedModules,
    cep,
    street,
    address_number: addressNumber,
    address_complement: addressComplement,
    neighborhood,
    city,
    state
  };

  const { error: profileError } = await supabase.rpc("save_managed_profile", {
    p_profile_id: profilePayload.id,
    p_full_name: profilePayload.full_name,
    p_role: profilePayload.role,
    p_parent_admin_id: profilePayload.parent_admin_id,
    p_login_email: profilePayload.login_email,
    p_crefito: profilePayload.crefito,
    p_is_active: profilePayload.is_active,
    p_allowed_modules: profilePayload.allowed_modules,
    p_cep: profilePayload.cep,
    p_street: profilePayload.street,
    p_address_number: profilePayload.address_number,
    p_address_complement: profilePayload.address_complement,
    p_neighborhood: profilePayload.neighborhood,
    p_city: profilePayload.city,
    p_state: profilePayload.state
  });
  if (profileError) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(profileError);
    if (missingColumnsMessage) throw new Error(missingColumnsMessage);
    throw profileError;
  }

  await adminClient.auth.signOut();

  return {
    id: managedUserId,
    email,
    modules: selectedModules
  };
}

async function updateManagedProfileFromForm(app) {
  const editingProfile = getEditingManagedProfile(app);
  if (!editingProfile) {
    throw new Error("Selecione um cadastro valido para editar.");
  }

  const name = String($("nomeFisioInput")?.value ?? "").trim();
  const crefito = String($("crefitoInput")?.value ?? "").trim().toUpperCase();
  const cep = String($("cepInput")?.value ?? "").trim();
  const street = String($("ruaInput")?.value ?? "").trim();
  const addressNumber = String($("numeroInput")?.value ?? "").trim();
  const addressComplement = String($("complementoInput")?.value ?? "").trim();
  const neighborhood = String($("bairroInput")?.value ?? "").trim();
  const city = String($("cidadeInput")?.value ?? "").trim();
  const state = String($("ufInput")?.value ?? "").trim().toUpperCase();
  const selectedModules = getSelectedManagedModuleValues();

  if (!name) throw new Error("Preencha o nome completo.");

  const profilePayload = {
    id: String(editingProfile.id ?? "").trim(),
    full_name: name,
    role: String(editingProfile.role ?? getManagedChildRole(app.currentProfile?.role) ?? "").trim(),
    parent_admin_id: editingProfile.parent_admin_id ?? (isFisioAdminRole(app.currentProfile?.role) ? app.currentUser.id : null),
    login_email: getManagedProfileEmail(editingProfile),
    crefito,
    is_active: isManagedProfileActive(editingProfile),
    allowed_modules: selectedModules,
    cep,
    street,
    address_number: addressNumber,
    address_complement: addressComplement,
    neighborhood,
    city,
    state
  };

  const { error } = await supabase.rpc("save_managed_profile", {
    p_profile_id: profilePayload.id,
    p_full_name: profilePayload.full_name,
    p_role: profilePayload.role,
    p_parent_admin_id: profilePayload.parent_admin_id,
    p_login_email: profilePayload.login_email,
    p_crefito: profilePayload.crefito,
    p_is_active: profilePayload.is_active,
    p_allowed_modules: profilePayload.allowed_modules,
    p_cep: profilePayload.cep,
    p_street: profilePayload.street,
    p_address_number: profilePayload.address_number,
    p_address_complement: profilePayload.address_complement,
    p_neighborhood: profilePayload.neighborhood,
    p_city: profilePayload.city,
    p_state: profilePayload.state
  });
  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) throw new Error(missingColumnsMessage);
    throw error;
  }

  return {
    id: profilePayload.id,
    email: profilePayload.login_email
  };
}

async function updateManagedProfileAccess(app, profile, nextActive) {
  if (!profile?.id) {
    throw new Error("Selecione um cadastro valido para alterar o acesso.");
  }

  const profilePayload = {
    id: String(profile.id ?? "").trim(),
    full_name: String(profile.full_name ?? "").trim(),
    role: String(profile.role ?? getManagedChildRole(app.currentProfile?.role) ?? "").trim(),
    parent_admin_id: profile.parent_admin_id ?? (isFisioAdminRole(app.currentProfile?.role) ? app.currentUser.id : null),
    login_email: getManagedProfileEmail(profile),
    crefito: String(profile.crefito ?? "").trim().toUpperCase(),
    is_active: Boolean(nextActive),
    allowed_modules: getManagedProfileModules(profile),
    cep: String(profile.cep ?? "").trim(),
    street: String(profile.street ?? "").trim(),
    address_number: String(profile.address_number ?? "").trim(),
    address_complement: String(profile.address_complement ?? "").trim(),
    neighborhood: String(profile.neighborhood ?? "").trim(),
    city: String(profile.city ?? "").trim(),
    state: String(profile.state ?? "").trim().toUpperCase()
  };

  const { error } = await supabase.rpc("save_managed_profile", {
    p_profile_id: profilePayload.id,
    p_full_name: profilePayload.full_name,
    p_role: profilePayload.role,
    p_parent_admin_id: profilePayload.parent_admin_id,
    p_login_email: profilePayload.login_email,
    p_crefito: profilePayload.crefito,
    p_is_active: profilePayload.is_active,
    p_allowed_modules: profilePayload.allowed_modules,
    p_cep: profilePayload.cep,
    p_street: profilePayload.street,
    p_address_number: profilePayload.address_number,
    p_address_complement: profilePayload.address_complement,
    p_neighborhood: profilePayload.neighborhood,
    p_city: profilePayload.city,
    p_state: profilePayload.state
  });
  if (error) {
    const missingColumnsMessage = getMissingManagedProfileColumnsMessage(error);
    if (missingColumnsMessage) throw new Error(missingColumnsMessage);
    throw error;
  }

  app.managedProfiles = Array.isArray(app.managedProfiles)
    ? app.managedProfiles.map((item) => String(item?.id ?? "").trim() === profilePayload.id
      ? { ...item, is_active: profilePayload.is_active }
      : item)
    : [];
}

function renderState(app) {
  try {
    console.log("--> renderState disparado! app.view =", app.view);

    const { protocol, session, view } = app;
  
  // Elementos de tela
  const screenLogin = $("screenLogin");
  const screenAdminDashboard = $("screenAdminDashboard");
  const screenAdminFisios = $("screenAdminFisios");
  const screenAdminFisiosForm = $("screenAdminFisiosForm");
  const screenAdminModulos = $("screenAdminModulos");
  const screenViewerProfile = $("screenViewerProfile");
  const screenProtocolIntro = $("screenProtocolIntro");
  const screenNode = $("screenNode");
  const screenEditor = $("screenEditor");
  const appContainer = $("appContainer");
  const mainAdmin = $("mainAdmin");
  
  // Esconder todas
  if (screenLogin) screenLogin.classList.add("hidden");
  if (screenAdminDashboard) screenAdminDashboard.classList.add("hidden");
  if (screenAdminFisios) screenAdminFisios.classList.add("hidden");
  if (screenAdminFisiosForm) screenAdminFisiosForm.classList.add("hidden");
  if (screenAdminModulos) screenAdminModulos.classList.add("hidden");
  if (screenViewerProfile) screenViewerProfile.classList.add("hidden");
  if (screenProtocolIntro) screenProtocolIntro.classList.add("hidden");
  if (screenNode) screenNode.classList.add("hidden");
  if (screenEditor) screenEditor.classList.add("hidden");
  if (appContainer) appContainer.classList.add("hidden");

  // Ajustar Sidebar Ativa
  document.querySelectorAll(".sidebar__link").forEach(btn => btn.classList.remove("active"));
  if (mainAdmin) mainAdmin.classList.toggle("main--editor", view === "editor");

  if (view === "login") {
    setVisualEditorFullscreen(false);
    if (screenLogin) screenLogin.classList.remove("hidden");
    return;
  }

  if (!app.authSession) {
    app.view = "login";
    renderState(app);
    return;
  }

  applyAuthUi(app);
  syncViewerRuntimeShell(app);
  syncRuntimeIntroIdentity(app);
  syncRuntimeIntroModule(app);
  if (appContainer) appContainer.classList.remove("hidden");

  if (view === "dashboard") {
    setVisualEditorFullscreen(false);
    if (screenAdminDashboard) screenAdminDashboard.classList.remove("hidden");
    renderDashboard(app);
    const nav = $("navDashboard");
    if (nav) nav.classList.add("active");
    return;
  }

  if (view === "fisios") {
    setVisualEditorFullscreen(false);
    if (screenAdminFisios) screenAdminFisios.classList.remove("hidden");
    renderManagedProfiles(app);
    const nav = $("navFisios");
    if (nav) nav.classList.add("active");
    return;
  }

  if (view === "fisios_form") {
    setVisualEditorFullscreen(false);
    if (screenAdminFisiosForm) screenAdminFisiosForm.classList.remove("hidden");
    renderManagedModuleOptions(
      app,
      getEditingManagedProfile(app)
        ? getManagedProfileModules(getEditingManagedProfile(app))
        : null
    );
    renderManagedProfiles(app);
    const nav = $("navFisios");
    if (nav) nav.classList.add("active");
    return;
  }

  if (view === "modulos") {
    if (isOwnerRole(app.currentProfile?.role)) {
      app.view = "dashboard";
      renderState(app);
      return;
    }
    setVisualEditorFullscreen(false);
    if (screenAdminModulos) screenAdminModulos.classList.remove("hidden");
    renderModulesList(app);
    const nav = $("navModulos");
    if (nav) nav.classList.add("active");
    return;
  }

  if (view === "viewer_profile") {
    if (!canAccessOwnProfile(app.currentProfile?.role)) {
      app.view = getDefaultViewForRole(app.currentProfile?.role);
      renderState(app);
      return;
    }
    setVisualEditorFullscreen(false);
    if (screenViewerProfile) screenViewerProfile.classList.remove("hidden");
    renderViewerProfileScreen(app);
    return;
  }
  
  if (view === "editor") {
    if (!canEditModules(app.currentProfile?.role)) {
      app.view = "modulos";
      renderState(app);
      return;
    }
    if (screenEditor) screenEditor.classList.remove("hidden");
    setEditorMode(app, app.editorMode ?? "simple");
    const nav = $("navModulos");
    if (nav) nav.classList.add("active");
    return;
  }

  // Visualização de Intro ou Node exige protocolo
  if (!protocol) {
    app.view = "modulos";
    renderState(app);
    return;
  }

  if (view === "intro") {
    setVisualEditorFullscreen(false);
    if (screenProtocolIntro) screenProtocolIntro.classList.remove("hidden");
    updateFlowSelect(app);
    return;
  }

  if (view === "node") {
    setVisualEditorFullscreen(false);
    if (!session) {
      app.view = "intro";
      renderState(app);
      return;
    }

    if (screenNode) screenNode.classList.remove("hidden");

    const flow = protocol.flowsById[session.flowId];
    const node = flow.nodesById[session.currentNodeId];
    const runtimeBlueprint = applyRuntimeModuleBlueprint(protocol, flow.id);

    renderBreadcrumb(app, flow, node);
    const nodeType = String(node.type ?? "");
    const typeLower = nodeType.toLowerCase();
    const isFinalizerNode = session.currentNodeId === "alta_fim_sessao"
      || /alta/i.test(String(node.title ?? ""));
    const isTriggerQuestionNode = session.currentNodeId === "pontos_gatilhos_perna_curta_curta";
    const isDiagnosisNode = ["interpretacao", "interpretation"].includes(typeLower) && !isFinalizerNode;
    const breadcrumbWrap = document.querySelector(".breadcrumbWrap");
    if (breadcrumbWrap) breadcrumbWrap.classList.toggle("hidden", isFinalizerNode || isDiagnosisNode);

  // Limpar classes de cor anteriores
  const nodeCard = $("nodeCard");
  if (nodeCard) nodeCard.classList.remove("card--pergunta", "card--orientacao", "card--interpretacao", "card--area", "card--finalizer");
  if (nodeCard) nodeCard.classList.toggle("hidden", isFinalizerNode || isDiagnosisNode);

  // Aplicar nova classe de cor e traduzir o label
  let typeLabel = "Orientação";
  if (["pergunta", "question"].includes(typeLower)) {
    if (nodeCard) nodeCard.classList.add("card--pergunta");
    if (nodeCard) {
      nodeCard.style.background = runtimeBlueprint.blocks.questionBg;
      nodeCard.style.color = runtimeBlueprint.blocks.questionText;
    }
    typeLabel = "PERGUNTA:";
  } else if (["interpretacao", "interpretation"].includes(typeLower)) {
    if (nodeCard) nodeCard.classList.add(isFinalizerNode ? "card--finalizer" : "card--interpretacao");
    if (nodeCard) {
      nodeCard.style.background = runtimeBlueprint.blocks.diagnosisBg;
      nodeCard.style.color = runtimeBlueprint.blocks.diagnosisText;
    }
    typeLabel = "INTERPRETAÇÃO:";
  } else if (["area", "areas"].includes(typeLower)) {
    if (nodeCard) nodeCard.classList.add("card--area");
    typeLabel = "ÁREA:";
  } else {
    if (nodeCard) nodeCard.classList.add("card--orientacao");
    typeLabel = "ORIENTAÇÃO:";
  }

  // Formatador especial para títulos como no PDF (ex: "1. PERGUNTA:" numa linha e "LEG CHECKING INICIAL" na outra)
  // O breadcrumb diz o número do passo, podemos usar o tamanho do path para emular o "1." se for o startNode
  const stepNumber = session.path.length + 1;
  const nodeTypeEl = $("nodeType");
  if (nodeTypeEl) nodeTypeEl.textContent = `${stepNumber}. ${typeLabel}`;
  
  const rawTitle = String(node.title ?? "").trim();
  const rawBody = String(node.body ?? "").trim();
    const contentType = ["image", "mixed"].includes(String(node.contentType ?? "")) ? String(node.contentType) : "text";
    const imageUrl = String(node.imageUrl ?? "").trim();
    const showNodeImage = Boolean(imageUrl) && (contentType === "image" || contentType === "mixed");
  let cleanTitle = rawTitle.replace(/^(Pergunta\s*\d*:|Orientação:|Interpretação:|Leg checking inicial - )/i, "").trim();
  let cleanBody = rawBody;

  const normalizedRawBody = rawBody.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedRawTitle = rawTitle.toLowerCase().replace(/\s+/g, " ").trim();
  const isQuestionNode = ["pergunta", "question"].includes(typeLower);
  const isInitialQuestion = isQuestionNode
    && session.currentNodeId === flow.startNodeId
    && (
      cleanTitle.toLowerCase().includes("leg checking")
      || normalizedRawTitle.includes("leg checking inicial")
      || normalizedRawBody.includes("leg checking inicial")
    );

  const isNoiseLine = (line) => /^(resposta|[0-9]+\.\s*pergunta:?|pergunta:?|leg checking|inicial|área|area|movimento|limpeza|perna neutra|perna curta|início|inicio)$/i.test(String(line ?? "").trim());
  if (isQuestionNode) {
    const isGenericQuestionTitle = /^(?:[0-9]+\.\s*)?pergunta:?$|^leg checking$/i.test(cleanTitle);
    const bodyLines = rawBody
      .split(/\r?\n/)
      .map((line) => String(line ?? "").trim())
      .filter(Boolean);
    const optionLabels = new Set((Array.isArray(node.options) ? node.options : []).map((opt) => String(opt?.label ?? "").trim().toLowerCase()).filter(Boolean));
    const flexionRotationIndex = bodyLines.findIndex((line) => /rota[cç][aã]o cervical/i.test(line) && /flex[aã]o/i.test(rawBody));

    const titleLines = [];
    if (cleanTitle && !isGenericQuestionTitle) {
      titleLines.push(cleanTitle);
    }

    if (isGenericQuestionTitle && flexionRotationIndex >= 0) {
      for (let idx = flexionRotationIndex; idx < bodyLines.length; idx += 1) {
        const line = bodyLines[idx];
        const normalizedLine = line.toLowerCase();
        if (isNoiseLine(line) || optionLabels.has(normalizedLine)) break;
        if (!titleLines.some((item) => item.toLowerCase() === normalizedLine)) {
          titleLines.push(line);
        }
        if (titleLines.length >= 2) break;
      }
    }

    if (isGenericQuestionTitle) {
      const targetMarker = Math.max(1, stepNumber - 1);
      let collecting = false;

      for (const line of bodyLines) {
        const match = line.match(/^(\d+)\.\s*pergunta:?\s*(.*)$/i);
        if (match) {
          const markerNumber = Number(match[1]);
          if (collecting && markerNumber !== targetMarker) break;
          collecting = markerNumber === targetMarker;
          if (!collecting) continue;
          const remainder = String(match[2] ?? "").trim();
          if (remainder) titleLines.push(remainder);
          continue;
        }

        if (!collecting) continue;
        const normalizedLine = line.toLowerCase();
        if (isNoiseLine(line) || optionLabels.has(normalizedLine)) break;
        if (!titleLines.some((item) => item.toLowerCase() === normalizedLine)) {
          titleLines.push(line);
        }
        if (titleLines.length >= 2) break;
      }
    }

    let foundRelevantStart = titleLines.length > 0;
    for (const line of bodyLines) {
      const normalizedLine = line.toLowerCase();
      if (isNoiseLine(line)) {
        if (foundRelevantStart) break;
        continue;
      }

      if (optionLabels.has(normalizedLine)) break;

      if (!foundRelevantStart) {
        foundRelevantStart = true;
      }

      if (!titleLines.some((item) => item.toLowerCase() === normalizedLine)) {
        titleLines.push(line);
      }
      if (titleLines.length >= 2) break;
    }

    if (isInitialQuestion) {
      cleanTitle = "LEG CHECKING INICIAL";
    } else if (titleLines.length > 0) {
      cleanTitle = titleLines.join("\n");
    }

    cleanBody = "";
  }
  const nodeTitleEl = $("nodeTitle");
  if (nodeTitleEl) {
    nodeTitleEl.innerHTML = escapeHtml(cleanTitle).replace(/\n/g, "<br>");
    nodeTitleEl.classList.toggle("hidden", contentType === "image");
  }

  const normalizedTitle = cleanTitle.toLowerCase();
  const normalizedBody = cleanBody.toLowerCase();
  if (
    normalizedTitle === "leg checking inicial" ||
    (isQuestionNode && (
      normalizedBody.includes("resposta") ||
      normalizedBody.includes("leg checking") ||
      normalizedBody.includes("1. pergunta") ||
      normalizedBody.includes("2. pergunta")
    )) ||
    (
      normalizedBody.includes("leg checking inicial") &&
      normalizedBody.includes("perna neutra") &&
      normalizedBody.includes("perna curta") &&
      normalizedBody.includes("movimento")
    )
  ) {
    cleanBody = "";
  }

  const nodeBodyEl = $("nodeBody");
  if (nodeBodyEl) {
    nodeBodyEl.textContent = cleanBody;
    nodeBodyEl.classList.toggle("hidden", isQuestionNode || !cleanBody || contentType === "image");
  }
  const nodeImageEl = $("nodeImage");
  if (nodeImageEl) {
    nodeImageEl.src = imageUrl;
    nodeImageEl.classList.toggle("hidden", !showNodeImage);
  }

  const finalizerView = $("finalizerView");
  const finalizerPath = $("finalizerPath");
  if (finalizerView) finalizerView.classList.toggle("hidden", !isFinalizerNode);
  if (finalizerPath) {
    finalizerPath.innerHTML = "";
    if (isFinalizerNode) {
      session.path.forEach((step, index) => {
        const card = document.createElement("div");
        card.className = "finalizer-step";
        const questionTitle = escapeHtml(String(step.nodeTitle ?? "")).replace(/\n/g, "<br>");
        const answerLabel = String(step.chosenLabel ?? "");
        card.innerHTML = `
          <div class="finalizer-step__question">
            <strong>${index + 1}. Pergunta</strong>
            <span>${questionTitle}</span>
          </div>
          <div class="finalizer-step__answer">
            <strong>Resposta</strong>
            <span>${escapeHtml(answerLabel)}</span>
          </div>
        `;
        finalizerPath.appendChild(card);
      });
    }
  }

  const diagnosisView = $("diagnosisView");
  const diagnosisCard = diagnosisView?.querySelector?.(".diagnosis__card");
  const diagnosisPath = $("diagnosisPath");
  const diagnosisTitle = $("diagnosisTitle");
  const diagnosisImage = $("diagnosisImage");
  const diagnosisActions = $("diagnosisActions");
  const diagnosisIcon = diagnosisView?.querySelector?.(".diagnosis__icon");
  if (diagnosisView) diagnosisView.classList.toggle("hidden", !isDiagnosisNode);
  if (diagnosisView) diagnosisView.style.fontFamily = runtimeBlueprint.page.fontFamily;
  if (diagnosisTitle && isDiagnosisNode) {
    diagnosisTitle.innerHTML = escapeHtml(cleanTitle).replace(/\n/g, "<br>");
    diagnosisTitle.classList.toggle("hidden", !cleanTitle);
  }
  if (diagnosisImage) {
    diagnosisImage.src = imageUrl;
    diagnosisImage.classList.toggle("hidden", !(isDiagnosisNode && showNodeImage));
  }
  if (diagnosisIcon) {
    diagnosisIcon.classList.toggle("hidden", !isDiagnosisNode || !cleanTitle);
  }
  if (diagnosisCard) {
    diagnosisCard.classList.toggle("diagnosis__card--with-media", Boolean(isDiagnosisNode && showNodeImage));
  }
  if (diagnosisPath) {
    diagnosisPath.innerHTML = "";
    if (isDiagnosisNode) {
      session.path.forEach((step, index) => {
        const card = document.createElement("div");
        card.className = "finalizer-step";
        const questionTitle = escapeHtml(String(step.nodeTitle ?? "")).replace(/\n/g, "<br>");
        const answerLabel = String(step.chosenLabel ?? "");
        card.innerHTML = `
          <div class="finalizer-step__question">
            <strong>${index + 1}. Pergunta</strong>
            <span>${questionTitle}</span>
          </div>
          <div class="finalizer-step__answer">
            <strong>Resposta</strong>
            <span>${escapeHtml(answerLabel)}</span>
          </div>
        `;
        diagnosisPath.appendChild(card);
      });
    }
  }
  if (diagnosisActions) diagnosisActions.innerHTML = "";

  const triggerQuestionView = $("triggerQuestionView");
  const triggerQuestionList = $("triggerQuestionList");
  const triggerQuestionActions = $("triggerQuestionActions");
  if (triggerQuestionView) triggerQuestionView.classList.toggle("hidden", !isTriggerQuestionNode);
  if (triggerQuestionView) triggerQuestionView.style.fontFamily = runtimeBlueprint.page.fontFamily;
  if (triggerQuestionList) triggerQuestionList.innerHTML = "";
  if (triggerQuestionActions) triggerQuestionActions.innerHTML = "";

  const optionsWrap = $("options");
  const areaOptionsWrap = $("areaOptions");
  const actionsWrap = $("primaryActions");
  if (optionsWrap) {
    optionsWrap.innerHTML = "";
    optionsWrap.classList.toggle("hidden", isTriggerQuestionNode);
  }
  if (areaOptionsWrap) {
    areaOptionsWrap.innerHTML = "";
    areaOptionsWrap.classList.toggle("hidden", isTriggerQuestionNode);
  }
  if (actionsWrap) {
    actionsWrap.innerHTML = "";
    actionsWrap.classList.toggle("hidden", isTriggerQuestionNode);
  }

  const checkpointList = $("checkpointList");
  if (checkpointList) {
    checkpointList.classList.add("hidden");
    checkpointList.innerHTML = "";
  }

  if (nodeType === "checkpoint") {
    renderCheckpoint(app, node, checkpointList);
  } else if (Array.isArray(node.options) && node.options.length > 0) {
    if (isTriggerQuestionNode) {
      const lines = String(node.body ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => line.toLowerCase() !== "procurar");
      for (const line of lines) {
        const item = document.createElement("div");
        item.className = "trigger-question__item";
        item.textContent = line;
        if (triggerQuestionList) triggerQuestionList.appendChild(item);
      }

      for (const opt of node.options) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn--trigger";
        btn.textContent = String(opt.label ?? "Selecionar");
        btn.style.background = runtimeBlueprint.blocks.answerBg;
        btn.style.color = runtimeBlueprint.blocks.answerText;
        btn.addEventListener("click", () => {
          app.session = chooseOption(app.protocol, app.session, opt);
          saveSessionToStorage(app.session);
          renderState(app);
        });
        if (triggerQuestionActions) triggerQuestionActions.appendChild(btn);
      }
    } else {
    for (const opt of node.options) {
      const btn = document.createElement("button");
      btn.type = "button";
      
      const optLabel = String(opt.label ?? "Selecionar");
      const labelLower = optLabel.toLowerCase();
      const isAreaNav = opt.action === "change_flow" || labelLower.includes("área") || labelLower.includes("area") || labelLower.includes("limpeza");
      
      if (isAreaNav) {
        btn.className = "btn btn--area";
        
        // Adicionar ícone via emoji dependendo do nome
        let iconHtml = "🔲"; // fallback
        if (labelLower.includes("secundária") || labelLower.includes("secundaria")) iconHtml = "🦴"; // spine fallback
        if (labelLower.includes("terciária") || labelLower.includes("terciaria")) iconHtml = "🦴"; 
        if (labelLower.includes("limpeza")) iconHtml = "🧹"; // broom

        btn.innerHTML = `<span class="icon">${iconHtml}</span><span>${optLabel}</span>`;
      } else {
        btn.className = "btn btn--resposta";
        btn.textContent = optLabel;
        btn.style.background = runtimeBlueprint.blocks.answerBg;
        btn.style.color = runtimeBlueprint.blocks.answerText;
      }
      
      btn.addEventListener("click", () => {
        app.session = chooseOption(app.protocol, app.session, opt);
        saveSessionToStorage(app.session);
        renderState(app);
      });
      
      if (isAreaNav) {
        areaOptionsWrap.appendChild(btn);
      } else {
        optionsWrap.appendChild(btn);
      }
    }
    }
  }

  const primaryActions = Array.isArray(node.primaryActions) ? node.primaryActions : [];
  if (!isFinalizerNode) {
    for (const a of primaryActions) {
      const label = String(a.label ?? "");
      if (!label) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = isDiagnosisNode
        ? `btn ${/reavalia/i.test(label) ? "btn--diagnosis-secondary" : "btn--diagnosis-primary"}`
        : "btn btn--ghost";
      if (isDiagnosisNode) {
        btn.style.color = runtimeBlueprint.blocks.answerText;
        btn.style.background = /reavalia/i.test(label) ? runtimeBlueprint.blocks.answerBg : "#ffffff";
      }
      btn.innerHTML = escapeHtml(label).replace(/\n/g, "<br>");
      btn.addEventListener("click", () => {
        app.session = runAction(app, a);
        saveSessionToStorage(app.session);
        renderState(app);
      });
      if (isDiagnosisNode) {
        if (diagnosisActions) diagnosisActions.appendChild(btn);
      } else if (actionsWrap) {
        actionsWrap.appendChild(btn);
      }
    }
  }

  const hasHistory = session.path.length > 0;
  if ($("btnBack")) {
    $("btnBack").disabled = !hasHistory;
    $("btnBack").classList.toggle("hidden", isFinalizerNode || isDiagnosisNode);
  }
  if ($("btnExitFlow")) {
    $("btnExitFlow").classList.remove("hidden");
  }

  if ($("footerHint")) $("footerHint").textContent = "";
  } // <-- AQUI É A CHAVE FECHANDO O if (view === "node")
  
  } catch (err) {
    console.error("ERRO FATAL EM renderState:", err);
  }
}

function runAction(app, actionObj) {
  const action = String(actionObj.action ?? "");
  const flow = app.protocol.flowsById[app.session.flowId];

  if (action === "mark_corrected") {
    return setCheckpointValue(app.session, `corrected:${app.session.currentNodeId}`, true);
  }

  if (action === "restart_flow") {
    const target = String(actionObj.targetNodeId ?? flow.startNodeId);
    return restartAt(app.protocol, app.session, target);
  }

  if (action === "goto") {
    const target = String(actionObj.targetNodeId ?? "");
    if (!target) throw new Error("goto sem targetNodeId");
    return goTo(app.protocol, app.session, target, { label: String(actionObj.label ?? "") });
  }

  if (action === "reset") {
    return reset(app.protocol, app.session);
  }

  return app.session;
}

function renderBreadcrumb(app, flow) {
  const wrap = $("breadcrumb");
  if (!wrap) return;
  wrap.innerHTML = "";

  const allSteps = [
    { nodeId: flow.startNodeId, nodeTitle: flow.nodesById[flow.startNodeId]?.title ?? flow.startNodeId },
    ...app.session.path.map((p) => ({ nodeId: p.nodeId, nodeTitle: p.nodeTitle ?? p.nodeId })),
    { nodeId: app.session.currentNodeId, nodeTitle: flow.nodesById[app.session.currentNodeId]?.title ?? app.session.currentNodeId }
  ];

  const dedup = [];
  for (const s of allSteps) {
    if (dedup.length === 0 || dedup[dedup.length - 1].nodeId !== s.nodeId) dedup.push(s);
  }

  dedup.forEach((s, idx) => {
    const crumb = document.createElement("span");
    crumb.className = "crumb";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "crumb__btn";
    btn.textContent = String(s.nodeTitle ?? s.nodeId);
    btn.addEventListener("click", () => {
      app.session = jumpToIndex(app, idx);
      saveSessionToStorage(app.session);
      renderState(app);
    });

    crumb.appendChild(btn);
    if (idx < dedup.length - 1) {
      const sep = document.createElement("span");
      sep.className = "crumb__sep";
      sep.textContent = "›";
      crumb.appendChild(sep);
    }
    wrap.appendChild(crumb);
  });
}

function jumpToIndex(app, idx) {
  const flow = app.protocol.flowsById[app.session.flowId];
  const steps = [
    { nodeId: flow.startNodeId },
    ...app.session.path.map((p) => ({ nodeId: p.nodeId })),
    { nodeId: app.session.currentNodeId }
  ];

  const target = steps[Math.max(0, Math.min(idx, steps.length - 1))].nodeId;

  if (target === flow.startNodeId) return restartAt(app.protocol, app.session, flow.startNodeId);

  const newPath = [];
  for (const p of app.session.path) {
    newPath.push(p);
    if (p.nodeId === target) break;
  }

  return {
    ...app.session,
    currentNodeId: target,
    path: newPath.slice(0, -1)
  };
}

function renderCheckpoint(app, node, checkpointListEl) {
  if (!checkpointListEl) return;
  const items = Array.isArray(node.items) ? node.items : [];
  checkpointListEl.classList.remove("hidden");
  checkpointListEl.className = "checklist";

  const keyPrefix = String(node.checkpointKeyPrefix ?? node.id ?? "checkpoint");

  for (const rawItem of items) {
    const name = typeof rawItem === "string" ? rawItem : String(rawItem.name ?? "");
    const key = typeof rawItem === "string" ? name : String(rawItem.key ?? name);
    if (!name || !key) continue;

    const row = document.createElement("div");
    row.className = "checkrow";

    const label = document.createElement("div");
    label.className = "checkrow__name";
    label.textContent = name;

    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "toggle";
    yes.textContent = "Sim";

    const no = document.createElement("button");
    no.type = "button";
    no.className = "toggle";
    no.textContent = "Não";

    const storageKey = `${keyPrefix}:${key}`;

    const applyActive = () => {
      const v = app.session.answers[storageKey];
      yes.classList.toggle("toggle--on", v === true);
      no.classList.toggle("toggle--on", v === false);
    };

    yes.addEventListener("click", () => {
      app.session = setCheckpointValue(app.session, storageKey, true);
      saveSessionToStorage(app.session);
      applyActive();
    });

    no.addEventListener("click", () => {
      app.session = setCheckpointValue(app.session, storageKey, false);
      saveSessionToStorage(app.session);
      applyActive();
    });

    applyActive();

    row.appendChild(label);
    row.appendChild(yes);
    row.appendChild(no);
    checkpointListEl.appendChild(row);
  }

  if (Array.isArray(node.options) && node.options.length > 0) {
    const continueBtn = document.createElement("button");
    continueBtn.type = "button";
    continueBtn.className = "btn";
    continueBtn.textContent = String(node.options[0]?.label ?? "Continuar");
    continueBtn.addEventListener("click", () => {
      app.session = chooseOption(app.protocol, app.session, node.options[0]);
      saveSessionToStorage(app.session);
      renderState(app);
    });
    $("options").appendChild(continueBtn);
  }
}

function updateFlowSelect(app) {
  const select = document.getElementById("flowSelect");
  if (!select) return; // Segurança contra elemento faltante
  select.innerHTML = "";

  const protocol = app.protocol ?? loadProtocolFromStorage();
  if (!protocol) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Carregando protocolo…";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  const flows = Object.values(protocol.flowsById);
  flows.sort((a, b) => a.name.localeCompare(b.name));

  for (const flow of flows) {
    const opt = document.createElement("option");
    opt.value = flow.id;
    opt.textContent = flow.name;
    select.appendChild(opt);
  }

  select.disabled = false;
  const saved = app.selectedFlowId ?? protocol.defaultFlowId;
  select.value = protocol.flowsById[saved] ? saved : flows[0].id;
  app.selectedFlowId = select.value;
}

function updateJsonStatus(app, message) {
  const el = document.getElementById("jsonStatus");
  if (!el) return; // Segurança contra elemento faltante
  if (message) {
    el.textContent = message;
    return;
  }
  if (!app.protocol) {
    el.textContent = "Carregando protocolo…";
    return;
  }

  const flowCount = Object.keys(app.protocol.flowsById).length;
  el.textContent = `JSON OK • ${flowCount} área(s) carregada(s).`;
}

async function mount() {
  try {
    const app = {
      protocol: null,
      session: null,
      authSession: null,
      currentUser: null,
      currentProfile: null,
      supabaseModules: [],
      hasLoadedSupabaseModules: false,
      selectedFlowId: null,
      builderDraft: createEmptyBuilderDraft(),
      selectedBuilderNodeId: "pergunta_1",
      builderViewMode: "simple",
      isBuilderSidebarOpen: false,
      answerRoutingDraft: null,
      visualDraft: createDefaultModuleBlueprint(),
      editorMode: "simple",
      currentModuleId: null,
      editorOriginalFlowId: null,
      managedProfiles: [],
      deviceHistoryEntries: [],
      deviceHistoryModalProfileId: null,
      deviceHistoryModalProfileName: "",
      isDeviceHistoryLoading: false,
      adminSecurityNotifications: [],
      editingManagedProfileId: null,
      editingManagedProfileAvatarUrl: "",
      crefitoValidation: null,
      viewerModuleSearch: "",
      view: "login"
    };

  updateFlowSelect(app);
  updateJsonStatus(app);
  renderState(app);

  window.setInterval(() => {
    refreshAdminSecurityNotificationsSilently(app);
  }, 20000);

  const storedProtocol = loadProtocolFromStorage();
  if (storedProtocol) {
    app.protocol = ensureStarterModules(storedProtocol);
  } else {
    app.protocol = ensureStarterModules(await loadProtocolFromUrl(DEFAULT_PROTOCOL_URL));
  }

  if (app.protocol) saveProtocolToStorage(app.protocol);

  if (app.protocol) {
    app.selectedFlowId = app.protocol.defaultFlowId;
    const storedSession = loadSessionFromStorage();
    if (storedSession && app.protocol.flowsById[storedSession.flowId]) {
      app.session = storedSession;
    } else {
      const flow = app.protocol.flowsById[app.selectedFlowId];
      app.session = initSession(flow.id, flow.startNodeId);
      saveSessionToStorage(app.session);
    }
  }

  updateFlowSelect(app);
  updateJsonStatus(app);
  try {
    const authContext = await ensurePatientDeviceAccess(await ensureActiveAuthContext(await loadAuthContext()));
    app.authSession = authContext.session;
    app.currentUser = authContext.user;
    app.currentProfile = authContext.profile;
    if (authContext.session) {
      await hydrateAuthenticatedApp(app);
    }
    app.view = authContext.session ? getDefaultViewForRole(authContext.profile?.role) : "login";
  } catch (authError) {
    console.error("Erro ao carregar sessão do Supabase", authError);
    app.view = "login";
    setLoginError(getReadableAuthError(authError));
  }
  renderState(app);

  const formLogin = $("formLogin");
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = String($("loginEmail")?.value ?? "").trim();
      const password = String($("loginPassword")?.value ?? "");
      const submitButton = formLogin.querySelector('button[type="submit"]');
      if (!email || !password) {
        setLoginError("Preencha e-mail e senha.");
        return;
      }

      try {
        setLoginError("");
        if (submitButton) submitButton.disabled = true;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const authContext = await ensurePatientDeviceAccess(await ensureActiveAuthContext(await loadAuthContext()));
        app.authSession = authContext.session;
        app.currentUser = authContext.user;
        app.currentProfile = authContext.profile;
        await hydrateAuthenticatedApp(app);
        app.view = getDefaultViewForRole(authContext.profile?.role);
        renderState(app);
      } catch (loginError) {
        console.error("Erro ao fazer login", loginError);
        setLoginError(getReadableAuthError(loginError));
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  const btnLogout = $("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await supabase.auth.signOut();
      app.authSession = null;
      app.currentUser = null;
      app.currentProfile = null;
      app.supabaseModules = [];
      app.hasLoadedSupabaseModules = false;
      app.managedProfiles = [];
      app.view = "login";
      setLoginError("");
      renderState(app);
    });
  }

  // Navegação Global Sidebar
  const navDashboard = $("navDashboard");
  if (navDashboard) {
    navDashboard.addEventListener("click", async () => {
      console.log("Clicou em Dashboard");
      try {
        await refreshSupabaseModules(app);
        await loadManagedProfiles(app);
      } catch (error) {
        console.error("Erro ao atualizar dados do dashboard", error);
      }
      app.view = "dashboard";
      renderState(app);
    });
  }

  const navFisios = $("navFisios");
  if (navFisios) {
    navFisios.addEventListener("click", async () => {
      console.log("Clicou em Fisioterapeutas");
      try {
        await loadManagedProfiles(app);
      } catch (error) {
        console.error("Erro ao carregar perfis gerenciados", error);
        alert("Nao foi possivel carregar a lista de perfis: " + (error instanceof Error ? error.message : String(error)));
      }
      app.view = "fisios";
      renderState(app);
    });
  }

  const navModulos = $("navModulos");
  if (navModulos) {
    navModulos.addEventListener("click", async () => {
      console.log("Clicou em Módulos");
      try {
        await refreshSupabaseModules(app);
      } catch (error) {
        console.error("Erro ao atualizar módulos do Supabase", error);
      }
      app.view = "modulos";
      renderState(app);
    });
  }

  const navPerfil = $("navPerfil");
  if (navPerfil) {
    navPerfil.addEventListener("click", () => {
      app.view = "viewer_profile";
      renderState(app);
    });
  }

  const viewerProfileShortcut = $("viewerProfileShortcut");
  if (viewerProfileShortcut) {
    viewerProfileShortcut.addEventListener("click", () => {
      app.view = "viewer_profile";
      renderState(app);
    });
  }

  const adminSecurityNotificationsBtn = $("adminSecurityNotificationsBtn");
  if (adminSecurityNotificationsBtn) {
    adminSecurityNotificationsBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const popover = $("viewerNotificationPopover");
      if (popover && !popover.classList.contains("hidden")) {
        hideViewerNotifications();
        return;
      }
      try {
        await showViewerNotifications(app);
      } catch (error) {
        showAppToast(
          getReadableRuntimeError(error, "Nao foi possivel carregar os alertas de seguranca."),
          "error",
          { title: "Seguranca", eyebrow: "Notificacoes", durationMs: 4200 }
        );
      }
    });
  }

  const viewerNotificationsBtn = $("viewerNotificationsBtn");
  if (viewerNotificationsBtn) {
    viewerNotificationsBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const popover = $("viewerNotificationPopover");
      if (popover && !popover.classList.contains("hidden")) {
        hideViewerNotifications();
        return;
      }
      try {
        await showViewerNotifications(app);
      } catch (error) {
        showAppToast(
          getReadableRuntimeError(error, "Nao foi possivel abrir as notificacoes."),
          "error",
          { title: "Notificacoes", eyebrow: "Acesso", durationMs: 4200 }
        );
      }
    });
  }

  const viewerProfileNotificationsBtn = $("viewerProfileNotificationsBtn");
  if (viewerProfileNotificationsBtn) {
    viewerProfileNotificationsBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const popover = $("viewerNotificationPopover");
      if (popover && !popover.classList.contains("hidden")) {
        hideViewerNotifications();
        return;
      }
      try {
        await showViewerNotifications(app);
      } catch (error) {
        showAppToast(
          getReadableRuntimeError(error, "Nao foi possivel abrir as notificacoes."),
          "error",
          { title: "Notificacoes", eyebrow: "Acesso", durationMs: 4200 }
        );
      }
    });
  }

  const viewerNotificationClose = $("viewerNotificationClose");
  if (viewerNotificationClose) {
    viewerNotificationClose.addEventListener("click", () => hideViewerNotifications());
  }

  const viewerNotificationPopover = $("viewerNotificationPopover");
  if (viewerNotificationPopover) {
    viewerNotificationPopover.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const alertButton = target.closest("[data-admin-security-profile-id]");
      if (!alertButton) return;
      const profileId = String(alertButton.getAttribute("data-admin-security-profile-id") ?? "").trim();
      if (!profileId) return;
      try {
        await openAdminSecurityNotification(app, profileId);
      } catch (error) {
        showAppToast(
          getReadableRuntimeError(error, "Nao foi possivel abrir o historico desse paciente."),
          "error",
          { title: "Seguranca", eyebrow: "Alertas", durationMs: 4200 }
        );
      }
    });
  }

  const appToastClose = $("appToastClose");
  if (appToastClose) {
    appToastClose.addEventListener("click", () => hideAppToast());
  }

  const btnCloseDeleteModuleModal = $("btnCloseDeleteModuleModal");
  if (btnCloseDeleteModuleModal) {
    btnCloseDeleteModuleModal.addEventListener("click", () => closeDeleteModuleModal(app));
  }

  const btnCancelDeleteModule = $("btnCancelDeleteModule");
  if (btnCancelDeleteModule) {
    btnCancelDeleteModule.addEventListener("click", () => closeDeleteModuleModal(app));
  }

  const btnConfirmDeleteModule = $("btnConfirmDeleteModule");
  if (btnConfirmDeleteModule) {
    btnConfirmDeleteModule.addEventListener("click", async () => {
      const pendingId = String(app.pendingDeleteModuleId ?? "").trim();
      if (!pendingId) {
        closeDeleteModuleModal(app);
        return;
      }
      const module = getModulesForView(app).find((item) => String(item?.id ?? "").trim() === pendingId);
      if (!module) {
        closeDeleteModuleModal(app);
        return;
      }
      try {
        await deleteModule(app, module);
        closeDeleteModuleModal(app);
      } catch (e) {
        closeDeleteModuleModal(app);
        showAppToast(
          e instanceof Error ? e.message : String(e),
          "error",
          { title: "Erro ao excluir módulo", eyebrow: "Biblioteca clínica", durationMs: 4200 }
        );
      }
    });
  }

  const viewerModuleSearch = $("viewerModuleSearch");
  if (viewerModuleSearch) {
    viewerModuleSearch.addEventListener("input", (e) => {
      app.viewerModuleSearch = String(e.currentTarget?.value ?? "");
      if (app.view === "modulos" && isFisioPacienteRole(app.currentProfile?.role)) {
        renderModulesList(app);
      }
    });
    viewerModuleSearch.addEventListener("search", (e) => {
      app.viewerModuleSearch = String(e.currentTarget?.value ?? "");
      if (app.view === "modulos" && isFisioPacienteRole(app.currentProfile?.role)) {
        renderModulesList(app);
      }
    });
  }

  const btnSaveBuilderSidebar = $("btnSaveBuilderSidebar");
  if (btnSaveBuilderSidebar) {
    btnSaveBuilderSidebar.addEventListener("click", async () => {
      try {
        await saveEditorModule(app);
      } catch (e) {
        showAppToast(
          e instanceof Error ? e.message : String(e),
          "error",
          { title: "Erro ao salvar modulo", eyebrow: "Editor de modulos", durationMs: 4200 }
        );
      }
    });
  }

  const viewerModuleSearchClear = $("viewerModuleSearchClear");
  if (viewerModuleSearchClear) {
    viewerModuleSearchClear.addEventListener("click", () => {
      app.viewerModuleSearch = "";
      if ($("viewerModuleSearch")) $("viewerModuleSearch").value = "";
      if (app.view === "modulos" && isFisioPacienteRole(app.currentProfile?.role)) {
        renderModulesList(app);
      }
      $("viewerModuleSearch")?.focus();
    });
  }

  document.addEventListener("click", (e) => {
    const popover = $("viewerNotificationPopover");
    if (!popover || popover.classList.contains("hidden")) return;
    const target = e.target;
    const clickedInsidePopover = target instanceof Node && popover.contains(target);
    const clickedToggle = target instanceof Element && (
      target.closest("#viewerNotificationsBtn") ||
      target.closest("#viewerProfileNotificationsBtn")
    );
    if (!clickedInsidePopover && !clickedToggle) {
      hideViewerNotifications();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideViewerNotifications();
  });

  const btnUploadViewerAvatar = $("btnUploadViewerAvatar");
  const viewerAvatarFile = $("viewerAvatarFile");
  if (btnUploadViewerAvatar && viewerAvatarFile) {
    btnUploadViewerAvatar.addEventListener("click", () => viewerAvatarFile.click());
    viewerAvatarFile.addEventListener("change", async () => {
      const file = viewerAvatarFile.files?.[0];
      if (!file) return;
      const previousAvatarUrl = String($("viewerProfileAvatarUrl")?.value ?? "").trim();
      try {
        btnUploadViewerAvatar.disabled = true;
        const btnClearViewerAvatar = $("btnClearViewerAvatar");
        if (btnClearViewerAvatar) btnClearViewerAvatar.disabled = true;
        setViewerProfileStatus("Preparando e salvando a foto...", "success");
        const dataUrl = await readAvatarFileAsOptimizedDataUrl(file);
        app.currentProfile = {
          ...(app.currentProfile ?? {}),
          avatar_url: dataUrl
        };
        refreshViewerAvatarPreview(app, dataUrl);
        await saveViewerAvatarOnly(app, dataUrl);
        applyAuthUi(app);
        refreshViewerAvatarPreview(app, dataUrl);
        setViewerProfileStatus("Foto salva com sucesso.", "success");
      } catch (error) {
        app.currentProfile = {
          ...(app.currentProfile ?? {}),
          avatar_url: previousAvatarUrl
        };
        refreshViewerAvatarPreview(app, previousAvatarUrl);
        setViewerProfileStatus(getReadableRuntimeError(error, "Nao foi possivel carregar a foto."), "error");
      } finally {
        btnUploadViewerAvatar.disabled = false;
        const btnClearViewerAvatar = $("btnClearViewerAvatar");
        if (btnClearViewerAvatar) btnClearViewerAvatar.disabled = false;
        viewerAvatarFile.value = "";
      }
    });
  }

  const btnClearViewerAvatar = $("btnClearViewerAvatar");
  if (btnClearViewerAvatar) {
    btnClearViewerAvatar.addEventListener("click", async () => {
      const previousAvatarUrl = String($("viewerProfileAvatarUrl")?.value ?? "").trim();
      if (!previousAvatarUrl) {
        setViewerProfileStatus("Nenhuma foto cadastrada para remover.", "success");
        return;
      }
      try {
        btnClearViewerAvatar.disabled = true;
        if (btnUploadViewerAvatar) btnUploadViewerAvatar.disabled = true;
        app.currentProfile = {
          ...(app.currentProfile ?? {}),
          avatar_url: ""
        };
        refreshViewerAvatarPreview(app, "");
        await saveViewerAvatarOnly(app, "");
        applyAuthUi(app);
        refreshViewerAvatarPreview(app, "");
        setViewerProfileStatus("Foto removida com sucesso.", "success");
      } catch (error) {
        app.currentProfile = {
          ...(app.currentProfile ?? {}),
          avatar_url: previousAvatarUrl
        };
        refreshViewerAvatarPreview(app, previousAvatarUrl);
        setViewerProfileStatus(getReadableRuntimeError(error, "Nao foi possivel remover a foto."), "error");
      } finally {
        btnClearViewerAvatar.disabled = false;
        if (btnUploadViewerAvatar) btnUploadViewerAvatar.disabled = false;
      }
    });
  }

  const viewerProfileForm = $("viewerProfileForm");
  if (viewerProfileForm) {
    viewerProfileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitButton = $("btnSaveViewerProfile");
      try {
        setViewerProfileStatus("");
        if (submitButton) submitButton.disabled = true;
        await saveViewerOwnProfile(app);
        applyAuthUi(app);
        fillViewerProfileForm(app);
        syncViewerNotificationBadge(app);
        setViewerProfileStatus("Perfil atualizado com sucesso.", "success");
      } catch (error) {
        setViewerProfileStatus(getReadableRuntimeError(error, "Nao foi possivel salvar o perfil."), "error");
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  // Ações de Fisioterapeutas
  const btnNewFisio = $("btnNewFisio");
  if (btnNewFisio) {
    btnNewFisio.addEventListener("click", () => {
      resetFisioForm(app);
      applyManagedProfileFormMode(app);
      app.view = "fisios_form";
      renderState(app);
    });
  }

  const btnBackFisios = $("btnBackFisios");
  if (btnBackFisios) {
    btnBackFisios.addEventListener("click", (e) => {
      e.preventDefault(); // Prevenir comportamento de submit de formulário, caso esteja dentro de um
      resetFisioForm(app);
      app.view = "fisios";
      renderState(app);
    });
  }

  const formFisio = $("formFisio");
  if (formFisio) {
    formFisio.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitButton = $("btnSubmitFisioForm");
      const editingProfile = getEditingManagedProfile(app);
      try {
        setFisioFormStatus("");
        if (submitButton) submitButton.disabled = true;
        if (!editingProfile) {
          await ensureManagedProfileCrefitoBeforeSave(app);
        }
        const savedProfile = editingProfile
          ? await updateManagedProfileFromForm(app)
          : await createManagedProfileFromForm(app);
        await loadManagedProfiles(app);
        setFisioFormStatus(
          editingProfile
            ? `Cadastro atualizado com sucesso para ${savedProfile.email}.`
            : `Cadastro criado com sucesso para ${savedProfile.email}.`,
          "success"
        );
        resetFisioForm(app);
        app.view = "fisios";
        renderState(app);
      } catch (error) {
        console.error("Erro ao salvar perfil pelo app", error);
        setFisioFormStatus(
          getReadableRuntimeError(
            error,
            editingProfile ? "Nao foi possivel atualizar o perfil." : "Nao foi possivel cadastrar o perfil."
          ),
          "error"
        );
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  const managedProfilesTableBody = $("adminFisiosTableBody");
  if (managedProfilesTableBody) {
    managedProfilesTableBody.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const editButton = target.closest('[data-managed-profile-action="edit"]');
      const historyButton = target.closest('[data-managed-profile-action="device-history"]');
      const toggleAccessButton = target.closest('[data-managed-profile-action="toggle-access"]');
      const actionButton = historyButton ?? editButton ?? toggleAccessButton;
      if (!actionButton) return;

      const profileId = String(actionButton.getAttribute("data-profile-id") ?? "").trim();
      const profile = Array.isArray(app.managedProfiles)
        ? app.managedProfiles.find((item) => String(item?.id ?? "").trim() === profileId)
        : null;
      if (!profile) {
        alert("Nao foi possivel localizar o cadastro para edicao.");
        return;
      }

      if (historyButton) {
        try {
          if (historyButton instanceof HTMLButtonElement) historyButton.disabled = true;
          await openManagedProfileDeviceHistoryModal(app, profile);
        } catch (error) {
          showAppToast(
            getReadableRuntimeError(error, "Nao foi possivel carregar o historico de login."),
            "error",
            {
              title: "Erro ao carregar historico",
              eyebrow: "Seguranca",
              durationMs: 4200
            }
          );
        } finally {
          if (historyButton instanceof HTMLButtonElement) historyButton.disabled = false;
        }
        return;
      }

      if (editButton) {
        fillManagedProfileFormForEdit(app, profile);
        app.view = "fisios_form";
        renderState(app);
        return;
      }

      const nextActive = String(toggleAccessButton?.getAttribute("data-next-active") ?? "").trim() === "true";
      try {
        if (toggleAccessButton instanceof HTMLButtonElement) toggleAccessButton.disabled = true;
        await updateManagedProfileAccess(app, profile, nextActive);
        await loadManagedProfiles(app);
        if (app.view === "dashboard") {
          renderDashboard(app);
        } else {
          renderManagedProfiles(app);
        }
        showAppToast(
          nextActive
            ? "O acesso do fisioterapeuta foi reativado com sucesso."
            : "O acesso do fisioterapeuta foi inativado com sucesso.",
          "success",
          {
            title: nextActive ? "Acesso reativado" : "Acesso inativado",
            eyebrow: "Gestao clinica"
          }
        );
      } catch (error) {
        showAppToast(
          getReadableRuntimeError(error, "Nao foi possivel atualizar o acesso."),
          "error",
          {
            title: "Erro ao alterar acesso",
            eyebrow: "Gestao clinica",
            durationMs: 4200
          }
        );
      } finally {
        if (toggleAccessButton instanceof HTMLButtonElement) toggleAccessButton.disabled = false;
      }
    });
  }

  const btnCloseManagedDeviceHistoryModal = $("btnCloseManagedDeviceHistoryModal");
  if (btnCloseManagedDeviceHistoryModal) {
    btnCloseManagedDeviceHistoryModal.addEventListener("click", () => closeManagedDeviceHistoryModal(app));
  }

  const btnDismissManagedDeviceHistory = $("btnDismissManagedDeviceHistory");
  if (btnDismissManagedDeviceHistory) {
    btnDismissManagedDeviceHistory.addEventListener("click", () => closeManagedDeviceHistoryModal(app));
  }

  const managedDeviceHistoryModal = $("managedDeviceHistoryModal");
  if (managedDeviceHistoryModal) {
    managedDeviceHistoryModal.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-action="close-managed-device-history-modal"]')) {
        closeManagedDeviceHistoryModal(app);
      }
    });
  }

  const btnReleaseManagedDeviceLock = $("btnReleaseManagedDeviceLock");
  if (btnReleaseManagedDeviceLock) {
    btnReleaseManagedDeviceLock.addEventListener("click", async () => {
      const profileId = String(app.deviceHistoryModalProfileId ?? "").trim();
      const profile = Array.isArray(app.managedProfiles)
        ? app.managedProfiles.find((item) => String(item?.id ?? "").trim() === profileId)
        : null;
      if (!profile) {
        showAppToast("Selecione um paciente valido para liberar o novo device.", "error", {
          title: "Paciente nao encontrado",
          eyebrow: "Seguranca"
        });
        return;
      }

      try {
        btnReleaseManagedDeviceLock.disabled = true;
        await releaseManagedPatientDeviceLock(app, profile);
        showAppToast("O proximo login desse paciente podera vincular um novo device.", "success", {
          title: "Novo device liberado",
          eyebrow: "Seguranca"
        });
      } catch (error) {
        showAppToast(
          getReadableRuntimeError(error, "Nao foi possivel liberar o novo device."),
          "error",
          {
            title: "Erro ao liberar device",
            eyebrow: "Seguranca",
            durationMs: 4200
          }
        );
      } finally {
        btnReleaseManagedDeviceLock.disabled = false;
      }
    });
  }

  const btnValidateCrefito = $("btnValidateCrefito");
  if (btnValidateCrefito) {
    btnValidateCrefito.addEventListener("click", async (e) => {
      e.preventDefault();
      const crefitoInput = $("crefitoInput");
      if (!String(crefitoInput?.value ?? "").trim()) {
        setCrefitoStatus("Digite um CREFITO antes de validar.", "warning");
        return;
      }
      await validateManagedProfileCrefito(app, { allowNameAutofill: true });
    });
  }

  const crefitoInput = $("crefitoInput");
  if (crefitoInput) {
    crefitoInput.addEventListener("input", () => {
      resetManagedProfileCrefitoState(app, { clearStatus: true });
    });
    crefitoInput.addEventListener("blur", () => {
      const parsed = parseCrefitoInput(crefitoInput.value);
      if (parsed) crefitoInput.value = parsed.raw;
    });
  }

  // Lógica de CEP Inteligente (ViaCEP) via Delegation
  document.body.addEventListener("blur", async (e) => {
    if (e.target && e.target.id === "cepInput") {
      let cep = e.target.value.replace(/\D/g, "");
      if (cep.length === 8) {
        try {
          const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
          const data = await res.json();
          if (!data.erro) {
            const rua = $("ruaInput");
            const bairro = $("bairroInput");
            const cidade = $("cidadeInput");
            const uf = $("ufInput");
            
            if (rua) rua.value = data.logradouro;
            if (bairro) bairro.value = data.bairro;
            if (cidade) cidade.value = data.localidade;
            if (uf) uf.value = data.uf;
          }
        } catch (err) {
          console.error("Erro ao buscar CEP", err);
        }
      }
    }
  }, true); // Use capture phase para blur event delegation

  // Ações do Dashboard
  const btnCreateNew = $("btnCreateNew");
  if (btnCreateNew) {
    btnCreateNew.addEventListener("click", () => {
      if (!canEditModules(app.currentProfile?.role)) return;
      app.editorMode = "simple";
      app.currentModuleId = null;
      app.editorOriginalFlowId = null;
      app.builderDraft = createEmptyBuilderDraft();
      app.selectedBuilderNodeId = app.builderDraft.startNodeId;
      app.builderViewMode = "simple";
      app.isBuilderSidebarOpen = false;
      app.answerRoutingDraft = null;
      app.visualDraft = createDefaultModuleBlueprint();
      app.view = "editor";
      renderState(app);
    });
  }

  const btnSaveEditor = $("btnSaveEditor");
  if (btnSaveEditor) {
    btnSaveEditor.addEventListener("click", async () => {
      try {
        await saveEditorModule(app);
      } catch (e) {
        showAppToast(
          e instanceof Error ? e.message : String(e),
          "error",
          { title: "Erro ao salvar modulo", eyebrow: "Editor de modulos", durationMs: 4200 }
        );
      }
    });
  }

  const btnAddBuilderQuestion = $("btnAddBuilderQuestion");
  if (btnAddBuilderQuestion) {
    btnAddBuilderQuestion.addEventListener("click", () => {
      app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
      const newNode = createBuilderNode("pergunta", {
        answers: []
      });
      app.builderDraft.nodes.push(newNode);
      app.selectedBuilderNodeId = newNode.id;
      app.isBuilderSidebarOpen = true;
      app.answerRoutingDraft = null;
      renderBuilderWorkspace(app);
    });
  }

  const btnAddBuilderDiagnosis = $("btnAddBuilderDiagnosis");
  if (btnAddBuilderDiagnosis) {
    btnAddBuilderDiagnosis.addEventListener("click", () => {
      app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
      const newNode = createBuilderNode("interpretacao", {
        title: `Resultado ${app.builderDraft.nodes.filter((node) => node.type === "interpretacao").length + 1}`
      });
      app.builderDraft.nodes.push(newNode);
      app.selectedBuilderNodeId = newNode.id;
      app.isBuilderSidebarOpen = true;
      app.answerRoutingDraft = null;
      renderBuilderWorkspace(app);
    });
  }

  const btnTestBuilderFlow = $("btnTestBuilderFlow");
  if (btnTestBuilderFlow) {
    btnTestBuilderFlow.addEventListener("click", () => {
      try {
        app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
        const issues = getBuilderValidationIssues(app.builderDraft);
        renderBuilderValidation(app);
        if (issues.length > 0) {
          alert(`Corrija o fluxo antes de testar:\n\n- ${issues.join("\n- ")}`);
          return;
        }
        const flow = buildFlowFromBuilderDraft(app.builderDraft);
        const flowsById = { ...(app.protocol?.flowsById ?? {}), [flow.id]: flow };
        const moduleBlueprints = { ...(app.protocol?.moduleBlueprints ?? {}), [flow.id]: normalizeModuleBlueprint(app.visualDraft) };
        app.protocol = normalizeProtocol({
          flowsById,
          defaultFlowId: app.protocol?.defaultFlowId ?? flow.id,
          moduleBlueprints
        });
        app.selectedFlowId = flow.id;
        app.session = initSession(flow.id, flow.startNodeId);
        saveSessionToStorage(app.session);
        app.view = "intro";
        renderState(app);
      } catch (e) {
        alert("Não foi possível testar o módulo: " + (e instanceof Error ? e.message : String(e)));
      }
    });
  }

  const btnImportBuilderFlow = $("btnImportBuilderFlow");
  if (btnImportBuilderFlow) {
    btnImportBuilderFlow.addEventListener("click", () => {
      alert("Importação automática por texto/PDF é a próxima etapa. Estruturei o editor para receber isso sem mudar o backend.");
    });
  }

  const btnOpenModuleConfig = $("btnOpenModuleConfig");
  if (btnOpenModuleConfig) {
    btnOpenModuleConfig.addEventListener("click", () => {
      app.isBuilderSidebarOpen = true;
      renderBuilderWorkspace(app);
    });
  }

  const btnCloseBuilderSidebar = $("btnCloseBuilderSidebar");
  if (btnCloseBuilderSidebar) {
    btnCloseBuilderSidebar.addEventListener("click", () => {
      app.isBuilderSidebarOpen = false;
      renderBuilderWorkspace(app);
    });
  }

  const btnSidebarAddAnswer = $("btnSidebarAddAnswer");
  if (btnSidebarAddAnswer) {
    btnSidebarAddAnswer.addEventListener("click", () => {
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node || node.type !== "pergunta") return;
      node.answers.push(createBuilderAnswer(""));
      renderBuilderWorkspace(app);
    });
  }

  const btnDeleteSelectedNode = $("btnDeleteSelectedNode");
  if (btnDeleteSelectedNode) {
    btnDeleteSelectedNode.addEventListener("click", () => {
      const nodeId = String(app.selectedBuilderNodeId ?? "");
      if (!nodeId) return;
      const remainingQuestionCount = app.builderDraft.nodes.filter((node) => node.type === "pergunta" && node.id !== nodeId).length;
      if (remainingQuestionCount === 0) {
        alert("O módulo precisa ter pelo menos uma pergunta.");
        return;
      }
      app.builderDraft.nodes = app.builderDraft.nodes.filter((node) => node.id !== nodeId);
      app.builderDraft.nodes.forEach((node) => {
        if (node.type === "pergunta") {
          node.answers = node.answers.map((answer) => ({
            ...answer,
            nextNodeId: answer.nextNodeId === nodeId ? "" : answer.nextNodeId
          }));
        }
      });
      if (app.builderDraft.startNodeId === nodeId) {
        const firstQuestion = app.builderDraft.nodes.find((node) => node.type === "pergunta");
        app.builderDraft.startNodeId = firstQuestion?.id ?? "";
      }
      app.selectedBuilderNodeId = app.builderDraft.startNodeId;
      app.isBuilderSidebarOpen = true;
      app.answerRoutingDraft = null;
      renderBuilderWorkspace(app);
    });
  }

  const btnSetSelectedAsStart = $("btnSetSelectedAsStart");
  if (btnSetSelectedAsStart) {
    btnSetSelectedAsStart.addEventListener("click", () => {
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node || node.type !== "pergunta") return;
      app.builderDraft.startNodeId = node.id;
      app.isBuilderSidebarOpen = true;
      renderBuilderWorkspace(app);
    });
  }

  const btnToggleLegacyBuilder = $("btnToggleLegacyBuilder");
  if (btnToggleLegacyBuilder) {
    btnToggleLegacyBuilder.addEventListener("click", () => {
      setBuilderViewMode(app, app.builderViewMode === "advanced" ? "simple" : "advanced");
      if (app.builderViewMode === "advanced") renderBuilderNodes(app);
    });
  }

  const btnToggleAdvanced = $("btnToggleAdvanced");
  if (btnToggleAdvanced) {
    btnToggleAdvanced.addEventListener("click", () => {
      syncBuilderJsonPreview(app);
      const textarea = $("editorTextarea");
      if (!textarea) return;
      textarea.classList.toggle("hidden");
      btnToggleAdvanced.textContent = textarea.classList.contains("hidden") ? "Mostrar JSON" : "Ocultar JSON";
    });
  }

  const btnCloseBuilderRouteModal = $("btnCloseBuilderRouteModal");
  if (btnCloseBuilderRouteModal) {
    btnCloseBuilderRouteModal.addEventListener("click", () => closeBuilderRouteModal(app));
  }

  const builderRouteCreateType = $("builderRouteCreateType");
  if (builderRouteCreateType) {
    builderRouteCreateType.addEventListener("change", () => refreshBuilderRouteModal(app));
  }

  const builderRouteCreateTitle = $("builderRouteCreateTitle");
  if (builderRouteCreateTitle) {
    builderRouteCreateTitle.addEventListener("input", () => {
      builderRouteCreateTitle.dataset.userEdited = "true";
    });
  }

  document.querySelectorAll('input[name="builderRouteMode"]').forEach((radio) => {
    radio.addEventListener("change", () => refreshBuilderRouteModal(app));
  });

  const btnConfirmBuilderRoute = $("btnConfirmBuilderRoute");
  if (btnConfirmBuilderRoute) {
    btnConfirmBuilderRoute.addEventListener("click", () => {
      if (!app.answerRoutingDraft) return;
      const sourceNode = getBuilderDraftNode(app.builderDraft, app.answerRoutingDraft.nodeId);
      const answer = sourceNode?.answers?.find((item) => item.id === app.answerRoutingDraft.answerId);
      if (!sourceNode || !answer) return;

      const routeMode = document.querySelector('input[name="builderRouteMode"]:checked')?.value ?? "create";
      if (routeMode === "connect") {
        const targetId = String($("builderRouteExistingTarget")?.value ?? "");
        if (!targetId) {
          alert("Selecione uma etapa existente.");
          return;
        }
        answer.nextNodeId = targetId;
      } else {
        const newType = String($("builderRouteCreateType")?.value ?? "pergunta") === "interpretacao" ? "interpretacao" : "pergunta";
        const suggestedTitle = String($("builderRouteCreateTitle")?.value ?? "").trim();
        const newNode = createBuilderNode(newType, {
          title: suggestedTitle || (newType === "interpretacao" ? "Novo resultado" : "Nova pergunta"),
          answers: []
        });
        app.builderDraft.nodes.push(newNode);
        answer.nextNodeId = newNode.id;
        app.selectedBuilderNodeId = newNode.id;
      }

      app.isBuilderSidebarOpen = true;
      closeBuilderRouteModal(app);
      renderBuilderWorkspace(app);
    });
  }

  const btnUploadVisualBackground = $("btnUploadVisualBackground");
  const visualBackgroundFile = $("visualBackgroundFile");
  if (btnUploadVisualBackground && visualBackgroundFile) {
    btnUploadVisualBackground.addEventListener("click", () => visualBackgroundFile.click());
    visualBackgroundFile.addEventListener("change", async () => {
      const file = visualBackgroundFile.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        if ($("visualBackgroundImage")) $("visualBackgroundImage").value = dataUrl;
        syncVisualDraftFromDom(app);
        renderVisualPreview(app);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Falha ao carregar a imagem de fundo.");
      } finally {
        visualBackgroundFile.value = "";
      }
    });
  }

  const btnUploadVisualIcon = $("btnUploadVisualIcon");
  const visualIconFile = $("visualIconFile");
  if (btnUploadVisualIcon && visualIconFile) {
    btnUploadVisualIcon.addEventListener("click", () => visualIconFile.click());
    visualIconFile.addEventListener("change", async () => {
      const file = visualIconFile.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        if ($("visualIconUrl")) $("visualIconUrl").value = dataUrl;
        syncVisualDraftFromDom(app);
        renderVisualPreview(app);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Falha ao carregar o icone.");
      } finally {
        visualIconFile.value = "";
      }
    });
  }

  const btnUploadVisualCover = $("btnUploadVisualCover");
  const visualCoverFile = $("visualCoverFile");
  if (btnUploadVisualCover && visualCoverFile) {
    btnUploadVisualCover.addEventListener("click", () => visualCoverFile.click());
    visualCoverFile.addEventListener("change", async () => {
      const file = visualCoverFile.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        if ($("visualCoverImageUrl")) $("visualCoverImageUrl").value = dataUrl;
        syncVisualDraftFromDom(app);
        renderVisualPreview(app);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Falha ao carregar a capa do modulo.");
      } finally {
        visualCoverFile.value = "";
      }
    });
  }

  const btnUploadNodeImage = $("btnUploadNodeImage");
  const nodeImageFile = $("builderSelectedNodeImageFile");
  if (btnUploadNodeImage && nodeImageFile) {
    btnUploadNodeImage.addEventListener("click", () => nodeImageFile.click());
    nodeImageFile.addEventListener("change", async () => {
      const file = nodeImageFile.files?.[0];
      if (!file) return;
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        node.imageUrl = dataUrl;
        if (!["image", "mixed"].includes(String(node.contentType ?? ""))) node.contentType = "mixed";
        fillBuilderInspector(app);
        syncBuilderJsonPreview(app);
        renderBuilderFlowEditor(app);
        renderVisualPreview(app);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Falha ao carregar a imagem da etapa.");
      } finally {
        nodeImageFile.value = "";
      }
    });
  }

  const btnRemoveNodeImage = $("btnRemoveNodeImage");
  if (btnRemoveNodeImage) {
    btnRemoveNodeImage.addEventListener("click", () => {
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node) return;
      node.imageUrl = "";
      if (node.contentType === "image") node.contentType = "text";
      if ($("builderSelectedNodeImageUrl")) $("builderSelectedNodeImageUrl").value = "";
      fillBuilderInspector(app);
      syncBuilderJsonPreview(app);
      renderBuilderFlowEditor(app);
      renderVisualPreview(app);
    });
  }

  const btnGenerateNodeImage = $("btnGenerateNodeImage");
  if (btnGenerateNodeImage) {
    btnGenerateNodeImage.addEventListener("click", () => {
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node) return;
      const prompt = window.prompt("Descreva a imagem clínica que deseja gerar:", `${node.title || "Diagnóstico"} estilo clínico`);
      if (!prompt) return;
      const encoded = encodeURIComponent(prompt.trim());
      node.imageUrl = `https://placehold.co/1200x800/e2e8f0/0f172a?text=${encoded}`;
      if (!["image", "mixed"].includes(String(node.contentType ?? ""))) node.contentType = "mixed";
      fillBuilderInspector(app);
      syncBuilderJsonPreview(app);
      renderBuilderFlowEditor(app);
      renderVisualPreview(app);
    });
  }

  const btnClearVisualBackground = $("btnClearVisualBackground");
  if (btnClearVisualBackground) {
    btnClearVisualBackground.addEventListener("click", () => {
      if ($("visualBackgroundImage")) $("visualBackgroundImage").value = "";
      syncVisualDraftFromDom(app);
      renderVisualPreview(app);
    });
  }

  const btnClearVisualIcon = $("btnClearVisualIcon");
  if (btnClearVisualIcon) {
    btnClearVisualIcon.addEventListener("click", () => {
      if ($("visualIconUrl")) $("visualIconUrl").value = "";
      syncVisualDraftFromDom(app);
      renderVisualPreview(app);
    });
  }

  const btnClearVisualCover = $("btnClearVisualCover");
  if (btnClearVisualCover) {
    btnClearVisualCover.addEventListener("click", () => {
      if ($("visualCoverImageUrl")) $("visualCoverImageUrl").value = "";
      syncVisualDraftFromDom(app);
      renderVisualPreview(app);
    });
  }

  const btnOpenVisualFullscreen = $("btnOpenVisualFullscreen");
  if (btnOpenVisualFullscreen) {
    btnOpenVisualFullscreen.addEventListener("click", () => setVisualEditorFullscreen(true));
  }

  const btnCloseVisualFullscreen = $("btnCloseVisualFullscreen");
  if (btnCloseVisualFullscreen) {
    btnCloseVisualFullscreen.addEventListener("click", () => setVisualEditorFullscreen(false));
  }

  const visualPreviewCanvas = $("visualPreviewCanvas");
  if (visualPreviewCanvas) {
    visualPreviewCanvas.addEventListener("click", () => setVisualEditorFullscreen(true));
    visualPreviewCanvas.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setVisualEditorFullscreen(true);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setVisualEditorFullscreen(false);
  });

  document.body.addEventListener("input", (e) => {
    const editableEl = e.target?.closest?.("[data-edit]");
    if (editableEl) {
      const nodeId = String(editableEl.getAttribute("data-node-id") ?? "");
      const answerId = String(editableEl.getAttribute("data-answer-id") ?? "");
      const editType = String(editableEl.getAttribute("data-edit") ?? "");
      const value = String(editableEl.innerText ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
      const node = getBuilderDraftNode(app.builderDraft, nodeId);
      if (!node) return;
      if (editType === "node-title") node.title = value.trimStart() || (node.type === "pergunta" ? "Nova pergunta" : "Novo diagnóstico");
      if (editType === "node-body") node.body = value.trim();
      if (editType === "answer-label") {
        const answer = node.answers.find((item) => item.id === answerId);
        if (answer) answer.label = value.trimStart();
      }
      syncBuilderJsonPreview(app);
      renderVisualPreview(app);
      if (nodeId === app.selectedBuilderNodeId) fillBuilderInspector(app);
      return;
    }

    if (["builderModuleName", "builderModuleNameMain", "builderModuleId"].includes(e.target?.id)) {
      if (e.target.id === "builderModuleName" || e.target.id === "builderModuleNameMain") {
        app.builderDraft.name = String(e.target.value ?? "");
        const sidebarName = $("builderModuleName");
        const mainName = $("builderModuleNameMain");
        if (sidebarName && document.activeElement?.id !== "builderModuleName") {
          sidebarName.value = app.builderDraft.name;
        }
        if (mainName && document.activeElement?.id !== "builderModuleNameMain") {
          mainName.value = app.builderDraft.name;
        }
        const moduleId = $("builderModuleId");
        if (moduleId && document.activeElement?.id !== "builderModuleId") {
          const suggestedId = slugifyText(e.target.value);
          if (suggestedId) {
            moduleId.value = suggestedId;
            app.builderDraft.id = suggestedId;
          }
        }
      } else {
        app.builderDraft.id = String(e.target.value ?? "");
      }
      syncBuilderJsonPreview(app);
      renderVisualPreview(app);
      return;
    }

    if (e.target?.id === "builderRouteCreateTitle") {
      return;
    }

    if (e.target && (e.target.closest(".builder-node") || e.target.closest(".builder-answer"))) {
      syncBuilderDraftFromDom(app);
      app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
      syncBuilderJsonPreview(app);
      fillBuilderInspector(app);
      renderBuilderFlowEditor(app);
      renderVisualPreview(app);
      return;
    }

    if (e.target && e.target.matches?.('.builder-node [data-field="nodeType"]')) {
      syncBuilderDraftFromDom(app);
      app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
      renderBuilderWorkspace(app);
      return;
    }

    if (e.target && ["builderSelectedNodeTitle", "builderSelectedNodeBody"].includes(e.target.id)) {
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node) return;
      if (e.target.id === "builderSelectedNodeTitle") node.title = String(e.target.value ?? "");
      if (e.target.id === "builderSelectedNodeBody") node.body = String(e.target.value ?? "");
      syncBuilderJsonPreview(app);
      renderBuilderFlowEditor(app);
      renderVisualPreview(app);
      return;
    }

    if (e.target && ["builderSelectedNodeImageUrl"].includes(e.target.id)) {
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node) return;
      node.imageUrl = String(e.target.value ?? "").trim();
      fillBuilderInspector(app);
      syncBuilderJsonPreview(app);
      renderBuilderFlowEditor(app);
      renderVisualPreview(app);
      return;
    }

    if (e.target && e.target.matches?.("[data-inspector-field='answerLabel']")) {
      const node = getBuilderDraftNode(app.builderDraft, String(e.target.getAttribute("data-node-id") ?? ""));
      const answer = node?.answers?.find((item) => item.id === String(e.target.getAttribute("data-answer-id") ?? ""));
      if (!answer) return;
      answer.label = String(e.target.value ?? "");
      syncBuilderJsonPreview(app);
      renderBuilderFlowEditor(app);
      renderVisualPreview(app);
      return;
    }

    if (e.target && [
      "visualBackgroundColor",
      "visualBackgroundImage",
      "visualBackgroundSize",
      "visualFontFamily",
      "visualTextColor",
      "visualQuestionBg",
      "visualQuestionText",
      "visualAnswerBg",
      "visualAnswerText",
      "visualDiagnosisBg",
      "visualDiagnosisText",
      "visualIconUrl",
      "visualCoverImageUrl"
    ].includes(e.target.id)) {
      syncVisualDraftFromDom(app);
      renderVisualPreview(app);
    }

  });

  document.body.addEventListener("change", (e) => {
    if (e.target?.id === "builderStartNodeId") {
      app.builderDraft.startNodeId = String(e.target.value ?? "");
      app.selectedBuilderNodeId = app.builderDraft.startNodeId;
      renderBuilderWorkspace(app);
      return;
    }

    if (e.target?.id === "builderSelectedNodeType") {
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node) return;
      node.type = String(e.target.value ?? "pergunta") === "interpretacao" ? "interpretacao" : "pergunta";
      if (node.type === "interpretacao") node.answers = [];
      if (node.type === "pergunta" && !Array.isArray(node.answers)) node.answers = [];
      app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
      renderBuilderWorkspace(app);
      return;
    }

    if (e.target?.id === "builderSelectedContentType") {
      const node = getBuilderDraftNode(app.builderDraft, app.selectedBuilderNodeId);
      if (!node) return;
      node.contentType = ["image", "mixed"].includes(String(e.target.value ?? "")) ? String(e.target.value) : "text";
      fillBuilderInspector(app);
      syncBuilderJsonPreview(app);
      renderBuilderFlowEditor(app);
      renderVisualPreview(app);
      return;
    }

    if (e.target?.matches?.("[data-inspector-field='answerNextNodeId']")) {
      const node = getBuilderDraftNode(app.builderDraft, String(e.target.getAttribute("data-node-id") ?? ""));
      const answer = node?.answers?.find((item) => item.id === String(e.target.getAttribute("data-answer-id") ?? ""));
      if (!answer) return;
      answer.nextNodeId = String(e.target.value ?? "");
      syncBuilderJsonPreview(app);
      renderBuilderFlowEditor(app);
      renderVisualPreview(app);
    }
  });

  document.body.addEventListener("click", (e) => {
    const actionEl = e.target?.closest?.("[data-module-action]");
    if (actionEl) {
      const moduleId = actionEl.getAttribute("data-module-id");
      const action = actionEl.getAttribute("data-module-action");
      const module = getModulesForView(app).find((item) => item.id === moduleId);
      if (!module) return;

      if (action === "test") {
        app.currentModuleId = module.id;
        app.selectedFlowId = module.startFlowId;
        const flow = app.protocol.flowsById[module.startFlowId];
        app.session = initSession(flow.id, flow.startNodeId);
        saveSessionToStorage(app.session);
        app.view = "intro";
        renderState(app);
      }

      if (action === "edit") {
        if (!canEditModules(app.currentProfile?.role)) return;
        app.currentModuleId = module.id;
        app.editorMode = "simple";
        const flow = app.protocol.flowsById[module.startFlowId];
        app.editorOriginalFlowId = flow.id;
        app.builderDraft = createBuilderDraftFromFlow(flow);
        app.selectedBuilderNodeId = app.builderDraft.startNodeId;
        app.builderViewMode = "simple";
        app.isBuilderSidebarOpen = false;
        app.answerRoutingDraft = null;
        app.visualDraft = getModuleBlueprint(app.protocol, flow.id);
        app.view = "editor";
        renderState(app);
      }

      if (action === "delete") {
        if (!canEditModules(app.currentProfile?.role)) return;
        openDeleteModuleModal(app, module);
      }
      return;
    }

    const closeDeleteModuleEl = e.target?.closest?.("[data-action='close-delete-module-modal']");
    if (closeDeleteModuleEl) {
      closeDeleteModuleModal(app);
      return;
    }

    const beginConnectionEl = e.target?.closest?.("[data-action='begin-builder-connection']");
    if (beginConnectionEl) {
      openBuilderRouteModal(
        app,
        String(beginConnectionEl.getAttribute("data-node-id") ?? ""),
        String(beginConnectionEl.getAttribute("data-answer-id") ?? "")
      );
      return;
    }

    const routeAnswerEl = e.target?.closest?.("[data-action='open-answer-routing']");
    if (routeAnswerEl) {
      openBuilderRouteModal(
        app,
        String(routeAnswerEl.getAttribute("data-node-id") ?? ""),
        String(routeAnswerEl.getAttribute("data-answer-id") ?? "")
      );
      return;
    }

    const addAnswerEl = e.target?.closest?.("[data-action='add-builder-answer']");
    if (addAnswerEl) {
      const nodeId = String(addAnswerEl.getAttribute("data-node-id") ?? "");
      const node = app.builderDraft.nodes.find((item) => item.id === nodeId);
      if (node && node.type === "pergunta") {
        node.answers.push(createBuilderAnswer(""));
        app.selectedBuilderNodeId = nodeId;
        app.isBuilderSidebarOpen = true;
        renderBuilderWorkspace(app);
      }
      return;
    }

    const removeAnswerEl = e.target?.closest?.("[data-action='remove-builder-answer']");
    if (removeAnswerEl) {
      const nodeId = String(removeAnswerEl.getAttribute("data-node-id") ?? "");
      const answerId = String(removeAnswerEl.getAttribute("data-answer-id") ?? "");
      const node = app.builderDraft.nodes.find((item) => item.id === nodeId);
      if (node && node.type === "pergunta") {
        node.answers = node.answers.filter((answer) => answer.id !== answerId);
        if (app.answerRoutingDraft?.nodeId === nodeId && app.answerRoutingDraft?.answerId === answerId) {
          closeBuilderRouteModal(app);
        }
        app.selectedBuilderNodeId = nodeId;
        app.isBuilderSidebarOpen = true;
        renderBuilderWorkspace(app);
      }
      return;
    }

    const removeNodeEl = e.target?.closest?.("[data-action='remove-builder-node']");
    if (removeNodeEl) {
      const nodeId = String(removeNodeEl.getAttribute("data-node-id") ?? "");
      const remainingQuestionCount = app.builderDraft.nodes.filter((node) => node.type === "pergunta" && node.id !== nodeId).length;
      if (remainingQuestionCount === 0) {
        alert("O módulo precisa ter pelo menos uma pergunta.");
        return;
      }
      app.builderDraft.nodes = app.builderDraft.nodes.filter((node) => node.id !== nodeId);
      app.builderDraft.nodes.forEach((node) => {
        if (node.type === "pergunta") {
          node.answers = node.answers.map((answer) => ({
            ...answer,
            nextNodeId: answer.nextNodeId === nodeId ? "" : answer.nextNodeId
          }));
        }
      });
      if (app.builderDraft.startNodeId === nodeId) {
        const firstQuestion = app.builderDraft.nodes.find((node) => node.type === "pergunta");
        app.builderDraft.startNodeId = firstQuestion?.id ?? "";
      }
      app.selectedBuilderNodeId = app.builderDraft.startNodeId;
      app.isBuilderSidebarOpen = true;
      app.answerRoutingDraft = null;
      renderBuilderWorkspace(app);
      return;
    }

    if (e.target?.closest?.("[data-action='close-builder-route-modal']")) {
      closeBuilderRouteModal(app);
      renderBuilderWorkspace(app);
      return;
    }

    const flowNodeEl = e.target?.closest?.(".timeline-step[data-node-id]");
    if (flowNodeEl && $("builderFlowCanvas")?.contains(flowNodeEl)) {
      const nodeId = String(flowNodeEl.getAttribute("data-node-id") ?? "");
      if (!nodeId) return;

      app.selectedBuilderNodeId = nodeId;
      app.isBuilderSidebarOpen = true;
      renderBuilderWorkspace(app);
      return;
    }

    const sidebar = $("builderSidebar");
    if (
      app.isBuilderSidebarOpen &&
      sidebar &&
      !sidebar.contains(e.target) &&
      !e.target.closest?.("#btnOpenModuleConfig") &&
      !e.target.closest?.(".timeline-step[data-node-id]") &&
      !e.target.closest?.(".timeline-step__answer") &&
      !e.target.closest?.(".builder-modal__dialog")
    ) {
      app.isBuilderSidebarOpen = false;
      renderBuilderWorkspace(app);
    }
  });

  const flowSelect = $("flowSelect");
  if (flowSelect) {
    flowSelect.addEventListener("change", (e) => {
      app.selectedFlowId = e.target.value;
    });
  }

  const btnHome = $("btnHome");
  if (btnHome) {
    btnHome.addEventListener("click", () => {
      if (!app.protocol || !app.session) return;
      app.session = reset(app.protocol, app.session);
      saveSessionToStorage(app.session);
      app.view = "node";
      renderState(app);
    });
  }

  const btnDiagnosisHome = $("btnDiagnosisHome");
  if (btnDiagnosisHome) {
    btnDiagnosisHome.addEventListener("click", () => {
      if (!app.protocol || !app.session) return;
      app.session = reset(app.protocol, app.session);
      saveSessionToStorage(app.session);
      app.view = "node";
      renderState(app);
    });
  }

  const btnStart = $("btnStart");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      if (!app.protocol) return;
      const flow = app.protocol.flowsById[app.selectedFlowId];
      if (!flow) return;
      app.session = initSession(flow.id, flow.startNodeId);
      saveSessionToStorage(app.session);
      app.view = "node";
      renderState(app);
    });
  }

  const btnContinue = $("btnContinue");
  if (btnContinue) {
    btnContinue.addEventListener("click", () => {
      app.view = "node";
      renderState(app);
    });
  }

  const btnReset = $("btnReset");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (!app.protocol) return;
      if (!app.session) return;
      app.session = reset(app.protocol, app.session);
      saveSessionToStorage(app.session);
      renderState(app);
    });
  }

  const btnBack = $("btnBack");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      if (!app.protocol) return;
      if (!app.session) return;
      app.session = back(app.protocol, app.session);
      saveSessionToStorage(app.session);
      renderState(app);
    });
  }

  const btnExitFlow = $("btnExitFlow");
  if (btnExitFlow) {
    btnExitFlow.addEventListener("click", () => {
      exitFlow(app);
      renderState(app);
    });
  }

  // Removendo listeners duplicados problemáticos
  } catch (err) {
    console.error("ERRO FATAL EM mount:", err);
  }
}

mount();
