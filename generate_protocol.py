import json
from collections import defaultdict

from pypdf import PdfReader


def clean_text(text: str) -> list[str]:
    lines = [ln.strip() for ln in (text or "").replace("\r", "\n").split("\n")]
    out: list[str] = []
    for ln in lines:
        if not ln:
            continue
        low = ln.lower()
        if low.startswith("@"):
            continue
        if "denistosta" in low:
            continue
        if "denis kauê" in low:
            continue
        out.append(ln)
    return out


TITLE_OVERRIDES = {
    1: "Introdução / Como utilizar",
    2: "Leg checking inicial",
    6: "Síndrome Cervical Bilateral",
    7: "Síndrome Cervical Unilateral",
    8: "Occipital Posterior",
    18: "Derifield X (Direita)",
    19: "Derifield X (Esquerda)",
    20: "Bloqueio Cervical Duplo",
    27: "Espondilolistese",
    28: "Beijo espinhoso",
    30: "Rotação sacral",
    31: "Ápice sacral posterior",
    32: "Ísquio posterior",
    33: "Ilíaco IN",
    34: "Ilíaco EX",
    35: "Caixa torácica elevada",
    36: "Costela rodada",
}

ID_OVERRIDES = {
    1: "intro",
    2: "leg_checking_inicial",
    6: "dx_sindrome_cervical_bilateral",
    7: "dx_sindrome_cervical_unilateral",
    8: "dx_occipital_posterior",
    17: "pontos_gatilho_perna_neutra",
    18: "dx_derifield_x_direita",
    19: "dx_derifield_x_esquerda",
    20: "dx_bloqueio_cervical_duplo",
    21: "pontos_gatilho_perna_curta",
    27: "dx_espondilolistese",
    28: "dx_beijo_espinhoso",
    29: "movimento_limpeza_menu",
    30: "mov_rotacao_sacral",
    31: "mov_apice_sacral_posterior",
    32: "mov_isquio_posterior",
    33: "mov_iliaco_in",
    34: "mov_iliaco_ex",
    35: "mov_caixa_toracica_elevada",
    36: "mov_costela_rodada",
}

TRIGGER_ITEMS = [
    "Tendão de Aquiles",
    "Tíbia medial",
    "Tuberosidade isquiática",
    "EIPS",
    "Osso púbico",
    "Eretores da espinha",
]


def group_links(page, ref_to_idx: dict[int, int]) -> list[dict]:
    ann = page.get("/Annots") or []
    groups: dict[int, list[list[float]]] = defaultdict(list)
    for ref in ann:
        obj = ref.get_object()
        action = obj.get("/A") or {}
        dest = action.get("/D")
        if not (isinstance(dest, list) and dest and hasattr(dest[0], "idnum")):
            continue
        dst = ref_to_idx.get(dest[0].idnum)
        rect = obj.get("/Rect")
        if dst is None or rect is None:
            continue
        groups[dst].append(rect)

    merged: list[dict] = []
    for dst, rects in groups.items():
        xs = [r[0] for r in rects] + [r[2] for r in rects]
        ys = [r[1] for r in rects] + [r[3] for r in rects]
        rect = [min(xs), min(ys), max(xs), max(ys)]
        cx = (rect[0] + rect[2]) / 2
        cy = (rect[1] + rect[3]) / 2
        merged.append({"dst": dst, "rect": rect, "cx": cx, "cy": cy, "count": len(rects)})

    merged.sort(key=lambda it: (-it["cy"], it["cx"]))
    return merged


def extract_labels(lines: list[str]) -> list[str]:
    labels: list[str] = []

    for i, ln in enumerate(lines):
        if ln.lower().startswith("resposta"):
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                candidate = lines[j].strip()
                if candidate and candidate.lower() not in {"resposta", "pergunta"}:
                    labels.append(candidate)

    for ln in lines:
        low = ln.lower()
        if "reavalia" in low and len(ln) <= 40:
            labels.append(ln)
        if "corrigir" in low and len(ln) <= 40:
            labels.append(ln)

    for ln in lines:
        if ln in {"Sim", "Não", "Procurar", "INÍCIO", "Início"}:
            labels.append(ln)
        if ln.upper() == ln and len(ln) <= 28:
            labels.append(ln.title() if ln.isupper() else ln)

    for ln in lines:
        if ln.startswith(("Perna Neutra", "Perna Curta", "PERNA CURTA")) and len(ln) <= 60:
            labels.append(ln)

    seen: set[str] = set()
    out: list[str] = []
    for label in labels:
        k = label.strip()
        if not k:
            continue
        low = k.lower()
        if low.startswith("leg checking"):
            continue
        if low.startswith(("1. pergunta", "2. pergunta", "3. pergunta", "4. pergunta", "5. pergunta")):
            continue
        if low.startswith(("pergunta", "resposta")):
            continue
        if low == "área":
            continue
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


def node_type(page_number: int, lines: list[str], unique_dsts: int) -> str:
    text_flat = " ".join(lines).lower()
    has_triggers = any(
        term in text_flat
        for term in [
            "tendão de aquiles",
            "tíbia medial",
            "tuberosidade isquiática",
            "eips",
            "osso púbico",
            "eretores da espinha",
        ]
    )
    has_actions = ("reavalia" in text_flat) or ("corrigir" in text_flat)
    has_many_steps = ("pergunta" in text_flat and "resposta" in text_flat and text_flat.count("pergunta") >= 2)

    if page_number in {17, 21}:
        return "checkpoint"
    if "como utilizar" in text_flat or "seja bem vindo" in text_flat:
        return "orientation"
    if has_actions and unique_dsts <= 2:
        return "interpretation"
    if has_triggers and "pontos gatilhos" in text_flat:
        return "checkpoint"
    return "question"


def main() -> None:
    r = PdfReader("RoteirodeThompson.pdf")
    ref_to_idx = {pg.indirect_reference.idnum: i for i, pg in enumerate(r.pages)}

    all_nodes: dict[str, dict] = {}
    adj: dict[str, set[str]] = defaultdict(set)

    for idx, page in enumerate(r.pages):
        page_number = idx + 1
        node_id = ID_OVERRIDES.get(page_number, f"page_{page_number:02d}")
        lines = clean_text(page.extract_text() or "")
        title = TITLE_OVERRIDES.get(page_number, lines[0] if lines else f"Página {page_number}")
        links = group_links(page, ref_to_idx)
        labels = extract_labels(lines)

        options: list[dict] = []
        unique_dsts = [g["dst"] for g in links]
        unique_dsts = list(dict.fromkeys(unique_dsts))

        if page_number == 2:
            mapping = {
                3: "Perna neutra",
                8: "Perna curta",
                26: "Área secundária",
                27: "Área terciária",
                28: "Movimento de limpeza",
            }
            for dst in unique_dsts:
                dst_page_number = dst + 1
                next_id = ID_OVERRIDES.get(dst_page_number, f"page_{dst_page_number:02d}")
                label = mapping.get(dst, TITLE_OVERRIDES.get(dst_page_number, f"Ir para página {dst_page_number}"))
                options.append({"label": label, "nextNodeId": next_id})
                adj[node_id].add(next_id)
        else:
            for i, dst in enumerate(unique_dsts):
                dst_page_number = dst + 1
                next_id = ID_OVERRIDES.get(dst_page_number, f"page_{dst_page_number:02d}")
                label = labels[i] if i < len(labels) else TITLE_OVERRIDES.get(dst_page_number, f"Ir para página {dst_page_number}")
                options.append({"label": label, "nextNodeId": next_id})
                adj[node_id].add(next_id)

        t = node_type(page_number, lines, len(unique_dsts))

        node: dict = {"id": node_id, "type": t, "title": title, "body": "\n".join(lines)}
        if t == "checkpoint":
            node["items"] = TRIGGER_ITEMS
            node["options"] = options[:3] if options else []
        elif t == "interpretation":
            node["options"] = []
        else:
            node["options"] = options

        all_nodes[node_id] = node

    def reachable(start_id: str) -> set[str]:
        seen: set[str] = set()
        stack = [start_id]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            for nxt in adj.get(cur, set()):
                if nxt not in seen:
                    stack.append(nxt)
        return seen

    flows = {
        "principal": {"name": "Principal", "startNodeId": "leg_checking_inicial"},
        "area_secundaria": {"name": "Área Secundária", "startNodeId": "dx_espondilolistese"},
        "area_terciaria": {"name": "Área Terciária", "startNodeId": "dx_beijo_espinhoso"},
        "movimento_limpeza": {"name": "Movimento de Limpeza", "startNodeId": "movimento_limpeza_menu"},
    }

    protocol: dict = {"defaultFlowId": "principal", "flowsById": {}}

    for fid, meta in flows.items():
        start = meta["startNodeId"]
        reach = reachable(start)
        protocol["flowsById"][fid] = {
            "name": meta["name"],
            "startNodeId": start,
            "nodesById": {nid: all_nodes[nid] for nid in reach if nid in all_nodes},
        }

    with open("protocol.generated.json", "w", encoding="utf-8") as f:
        json.dump(protocol, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
