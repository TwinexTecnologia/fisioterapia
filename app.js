const STORAGE = {
  protocol: "thompson.protocol.v1",
  session: "thompson.session.v1"
};

const DEFAULT_PROTOCOL_URL = "./protocol.generated.json";

function $(id) {
  return document.getElementById(id);
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
      iconUrl: ""
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
      iconUrl: String($("visualIconUrl")?.value ?? "").trim()
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
  if (icon) {
    const iconUrl = String(blueprint.branding.iconUrl ?? "").trim();
    icon.src = iconUrl;
    icon.classList.toggle("hidden", !iconUrl);
  }

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
    name: "Roteiro de Thompsom",
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

  const module = getProtocolModules(app.protocol).find((item) => item.id === (app.currentModuleId ?? "thompson"));
  if (!module) {
    tabs.innerHTML = "";
    diagram.innerHTML = `<div class="flow-empty">Nenhum módulo encontrado para visualizar.</div>`;
    return;
  }

  const availableFlows = module.flowIds
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
    modules.push({
      id: flow.id,
      name: flow.name,
      icon: "🧩",
      description: "Fluxo individual disponível para os fisioterapeutas.",
      flowIds: [flow.id],
      startFlowId: flow.id,
      nodeCount: Object.keys(flow.nodesById ?? {}).length,
      mode: "single_flow"
    });
  }

  return modules;
}

function renderModulesList(app) {
  const list = $("modulesList");
  if (!list) return;
  list.innerHTML = "";

  const modules = getProtocolModules(app.protocol);
  modules.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  for (const module of modules) {
    const card = document.createElement("div");
    card.className = "dash-card";
    card.innerHTML = `
      <div class="dash-card-icon">${module.icon}</div>
      <h3 class="dash-card-title">${module.name}</h3>
      <p class="dash-card-desc">${module.description}</p>
      <p class="muted">${module.flowIds.length} fluxo(s) integrado(s) • ${module.nodeCount} etapa(s) cadastrada(s).</p>
      <div class="dash-card-actions">
        <button class="btn btn--start-sm" type="button" data-module-action="test" data-module-id="${module.id}">Testar Fluxo</button>
        <button class="btn btn--ghost" type="button" data-module-action="edit" data-module-id="${module.id}">${module.mode === "multi_flow" ? "Editar Estrutura" : "Editar Passo a Passo"}</button>
      </div>
    `;
    list.appendChild(card);
  }
}

function renderState(app) {
  try {
    console.log("--> renderState disparado! app.view =", app.view);

    const { protocol, session, view } = app;
  
  // Elementos de tela
  const screenAdminDashboard = $("screenAdminDashboard");
  const screenAdminFisios = $("screenAdminFisios");
  const screenAdminFisiosForm = $("screenAdminFisiosForm");
  const screenAdminModulos = $("screenAdminModulos");
  const screenProtocolIntro = $("screenProtocolIntro");
  const screenNode = $("screenNode");
  const screenEditor = $("screenEditor");
  const appContainer = $("appContainer");
  const mainAdmin = $("mainAdmin");
  
  // Esconder todas
  if (screenAdminDashboard) screenAdminDashboard.classList.add("hidden");
  if (screenAdminFisios) screenAdminFisios.classList.add("hidden");
  if (screenAdminFisiosForm) screenAdminFisiosForm.classList.add("hidden");
  if (screenAdminModulos) screenAdminModulos.classList.add("hidden");
  if (screenProtocolIntro) screenProtocolIntro.classList.add("hidden");
  if (screenNode) screenNode.classList.add("hidden");
  if (screenEditor) screenEditor.classList.add("hidden");
  if (appContainer) appContainer.classList.add("hidden");

  // Ajustar Sidebar Ativa
  document.querySelectorAll(".sidebar__link").forEach(btn => btn.classList.remove("active"));
  if (mainAdmin) mainAdmin.classList.toggle("main--editor", view === "editor");

  if (appContainer) appContainer.classList.remove("hidden");

  if (view === "dashboard") {
    setVisualEditorFullscreen(false);
    if (screenAdminDashboard) screenAdminDashboard.classList.remove("hidden");
    const nav = $("navDashboard");
    if (nav) nav.classList.add("active");
    return;
  }

  if (view === "fisios") {
    setVisualEditorFullscreen(false);
    if (screenAdminFisios) screenAdminFisios.classList.remove("hidden");
    const nav = $("navFisios");
    if (nav) nav.classList.add("active");
    return;
  }

  if (view === "fisios_form") {
    setVisualEditorFullscreen(false);
    if (screenAdminFisiosForm) screenAdminFisiosForm.classList.remove("hidden");
    const nav = $("navFisios");
    if (nav) nav.classList.add("active");
    return;
  }

  if (view === "modulos") {
    setVisualEditorFullscreen(false);
    if (screenAdminModulos) screenAdminModulos.classList.remove("hidden");
    renderModulesList(app);
    const nav = $("navModulos");
    if (nav) nav.classList.add("active");
    return;
  }
  
  if (view === "editor") {
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
    const isDiagnosisNode = [
      "dx_perna_curta_dois_lados",
      "dx_perna_curta_ipsilateral",
      "dx_perna_curta_contralateral",
      "dx_perna_curta_neutra_direita",
      "dx_perna_curta_neutra_esquerda",
      "dx_perna_curta_neutra_dois_lados",
      "dx_perna_curta_curta",
      "dx_perna_curta_longa"
    ].includes(session.currentNodeId)
      || /síndrome/i.test(String(node.title ?? ""));
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
  if (diagnosisView) diagnosisView.classList.toggle("hidden", !isDiagnosisNode);
  if (diagnosisView) diagnosisView.style.fontFamily = runtimeBlueprint.page.fontFamily;
  if (diagnosisTitle && isDiagnosisNode) {
    diagnosisTitle.innerHTML = escapeHtml(cleanTitle).replace(/\n/g, "<br>");
    diagnosisTitle.classList.toggle("hidden", contentType === "image");
  }
  if (diagnosisImage) {
    diagnosisImage.src = imageUrl;
    diagnosisImage.classList.toggle("hidden", !(isDiagnosisNode && showNodeImage));
  }
  if (diagnosisCard) {
    diagnosisCard.classList.toggle("diagnosis__card--image", Boolean(isDiagnosisNode && showNodeImage && contentType === "image"));
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
  if ($("btnReavaliar")) {
    $("btnReavaliar").disabled = !hasHistory && session.currentNodeId === flow.startNodeId;
    $("btnReavaliar").classList.toggle("hidden", isFinalizerNode || isDiagnosisNode);
  }

  if ($("footerHint")) $("footerHint").textContent = `${flow.name} • ${session.currentNodeId}`;
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
      view: "modulos"
    };

  updateFlowSelect(app);
  updateJsonStatus(app);
  renderState(app);

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
  renderState(app);

  // Navegação Global Sidebar
  const navDashboard = $("navDashboard");
  if (navDashboard) {
    navDashboard.addEventListener("click", () => {
      console.log("Clicou em Dashboard");
      app.view = "dashboard";
      renderState(app);
    });
  }

  const navFisios = $("navFisios");
  if (navFisios) {
    navFisios.addEventListener("click", () => {
      console.log("Clicou em Fisioterapeutas");
      app.view = "fisios";
      renderState(app);
    });
  }

  const navModulos = $("navModulos");
  if (navModulos) {
    navModulos.addEventListener("click", () => {
      console.log("Clicou em Módulos");
      app.view = "modulos";
      renderState(app);
    });
  }

  // Ações de Fisioterapeutas
  const btnNewFisio = $("btnNewFisio");
  if (btnNewFisio) {
    btnNewFisio.addEventListener("click", () => {
      app.view = "fisios_form";
      renderState(app);
    });
  }

  const btnBackFisios = $("btnBackFisios");
  if (btnBackFisios) {
    btnBackFisios.addEventListener("click", (e) => {
      e.preventDefault(); // Prevenir comportamento de submit de formulário, caso esteja dentro de um
      app.view = "fisios";
      renderState(app);
    });
  }

  // Validação Simulada de CREFITO via Delegation (para funcionar mesmo se escondido no load)
  document.body.addEventListener("click", (e) => {
    if (e.target && e.target.id === "btnValidateCrefito") {
      const crefitoInput = $("crefitoInput");
      const crefitoStatus = $("crefitoStatus");
      
      if (!crefitoInput || !crefitoStatus) return;

      const val = crefitoInput.value.trim();
      if (!val) {
        crefitoStatus.textContent = "Digite um CREFITO antes de validar.";
        crefitoStatus.style.color = "var(--laranja-hover)";
        return;
      }

      // Simulação de carregamento
      crefitoStatus.textContent = "Consultando base do COFFITO...";
      crefitoStatus.style.color = "var(--muted)";
      e.target.disabled = true;

      // Simulação de delay de rede
      setTimeout(() => {
        e.target.disabled = false;
        
        // Expressão Regular Rigorosa: Aceita de 4 a 6 dígitos seguidos exatamente por -F ou -TO
        // Ex: 12345-F, 123456-TO. Não aceita letras no meio dos números.
        const regexCrefito = /^\d{4,6}-(F|TO)$/i;
        
        if (regexCrefito.test(val.toUpperCase())) {
          crefitoStatus.textContent = "✓ CREFITO Válido e Ativo";
          crefitoStatus.style.color = "var(--verde-border)";
          
          // Banco de Dados Simulado (MOCK) para retornar nome baseado no CREFITO
          const mockDB = {
            "12345-F": "Denis Tosta",
            "98765-F": "Maria Souza",
            "11111-TO": "João Silva",
            "212658-F": "Novo Fisioterapeuta"
          };
          
          const nomeFisioInput = $("nomeFisioInput");
          if (nomeFisioInput) {
            // Se encontrar no mockDB, preenche o nome. Se não, preenche um nome genérico
            nomeFisioInput.value = mockDB[val.toUpperCase()] || "Dr(a). Fisioterapeuta " + val;
            
            // Efeito visual para mostrar que foi auto-preenchido
            nomeFisioInput.style.backgroundColor = "#e8f5e9";
            setTimeout(() => { nomeFisioInput.style.backgroundColor = ""; }, 1500);
          }
          
        } else {
          crefitoStatus.textContent = "✕ Formato inválido. Use apenas números e a letra (ex: 12345-F)";
          crefitoStatus.style.color = "red";
          
          const nomeFisioInput = $("nomeFisioInput");
          if (nomeFisioInput) nomeFisioInput.value = "";
        }
      }, 1500);
    }
  });

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
    btnSaveEditor.addEventListener("click", () => {
      try {
        app.builderDraft = ensureBuilderDraftConsistency(app.builderDraft);
        const issues = getBuilderValidationIssues(app.builderDraft);
        renderBuilderValidation(app);
        if (issues.length > 0) {
          alert(`Ajuste o módulo antes de salvar:\n\n- ${issues.join("\n- ")}`);
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
        app.selectedFlowId = flow.id;
        app.session = initSession(flow.id, flow.startNodeId);
        app.editorOriginalFlowId = flow.id;
        saveProtocolToStorage(app.protocol);
        alert("Roteiro salvo com sucesso!");
        app.view = "modulos";
        renderState(app);
      } catch (e) {
        alert("Erro ao salvar módulo: " + (e instanceof Error ? e.message : String(e)));
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
      "visualIconUrl"
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
      const module = getProtocolModules(app.protocol).find((item) => item.id === moduleId);
      if (!module) return;

      if (action === "test") {
        app.selectedFlowId = module.startFlowId;
        const flow = app.protocol.flowsById[module.startFlowId];
        app.session = initSession(flow.id, flow.startNodeId);
        saveSessionToStorage(app.session);
        app.view = "intro";
        renderState(app);
      }

      if (action === "edit") {
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

  const btnReavaliar = $("btnReavaliar");
  if (btnReavaliar) {
    btnReavaliar.addEventListener("click", () => {
      if (!app.protocol) return;
      if (!app.session) return;
      const flow = app.protocol.flowsById[app.session.flowId];
      if (!flow) return;
      app.session = restartAt(app.protocol, app.session, flow.startNodeId);
      saveSessionToStorage(app.session);
      renderState(app);
    });
  }

  // Removendo listeners duplicados problemáticos
  } catch (err) {
    console.error("ERRO FATAL EM mount:", err);
  }
}

mount();
