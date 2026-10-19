"""
Detecta e corrige erros de ANO nas datas de ida/volta do legado de diárias (MySQL "diarias?seres").

Padrão encontrado: lançamentos feitos na virada do ano gravam a viagem com o ano errado (ex.: viagem de
18/12/2025 digitada em 23/12/2025 gravada como 18/12/2026), além de retornos com ano 2004/2006 e lotes
inteiros com 2027. Só o ANO é corrigido, e só quando pelo menos DUAS evidências independentes concordam:

  - digitação ........ a data corrigida fica entre 400 dias antes e 30 dias depois da digitação (a original não);
  - SEI .............. o ano do processo SEI coincide com o ano corrigido (e não com o original);
  - vizinhos ......... os lançamentos digitados em sequência (código vizinho) estão perto da data corrigida;
  - ida/volta ........ corrigir o ano torna ida e volta coerentes (volta 0 a 60 dias após a ida);
  - data futura ...... a data original está mais de 6 meses no futuro.

Período incoerente (volta antes da ida ou mais de 60 dias entre elas) que nenhuma troca de ano resolve — erro de
dia/mês na digitação (ex.: ida 08/06/2026, volta 08/05/2006, 1 diária): a ponta próxima da digitação é mantida e a
outra é recalculada pela QUANTIDADE de diárias (1 diária = mesmo dia). Evidências: digitação + quantidade.

Uso:  python3 analisar_datas.py <pasta com diaria.jsonl> <saída .tsv>
A saída lista TODOS os casos suspeitos com a decisão (CORRIGIR/MANTER) e as evidências; o migrador aplica
as linhas CORRIGIR (src/DiariasSeap.Migracao/correcoes_datas.tsv).
"""
import csv, json, re, statistics, sys, datetime as dt

pasta, saida = sys.argv[1], sys.argv[2]
hoje = dt.date.today()
d = [json.loads(l) for l in open(f"{pasta}/diaria.jsonl", encoding="utf-8")]


def data(s):
    try:
        return dt.date.fromisoformat(s) if s and s[:4] != "0000" else None
    except ValueError:
        return None


def troca_ano(x, ano):
    try:
        return x.replace(year=ano)
    except ValueError:  # 29/02
        return x.replace(year=ano, day=28)


por_codigo = sorted(d, key=lambda r: int(r["codigo"]))
posicao = {r["codigo"]: i for i, r in enumerate(por_codigo)}


def vizinhos(codigo, k=8):
    i = posicao[codigo]
    ords = [data(por_codigo[j]["datadadiaria_ida"]) for j in list(range(max(0, i - k), i)) + list(range(i + 1, min(len(por_codigo), i + k + 1)))]
    ords = [x.toordinal() for x in ords if x]
    return dt.date.fromordinal(int(statistics.median(ords))) if ords else None


def coerente(i, v):
    return i and v and 0 <= (v - i).days <= 60


def na_janela(x, dig):
    return dig and dt.timedelta(days=-400) <= x - dig <= dt.timedelta(days=30)


linhas = []
for r in d:
    ida, volta, dig = data(r["datadadiaria_ida"]), data(r["datadadiaria_volta"]), data(r["data_digitacao"])
    if not ida or not volta:
        continue
    m = re.search(r"/(20\d\d)", r["numeroSei"] or "")
    sei = int(m.group(1)) if m else None
    futura = ida > hoje + dt.timedelta(days=180)
    suspeito = (not coerente(ida, volta) or ida.year < 2013 or futura
                or (dig and not na_janela(ida, dig)) or (sei and sei < ida.year))
    if not suspeito:
        continue

    viz = vizinhos(r["codigo"])
    anos = {a for a in [ida.year, volta.year, dig and dig.year, dig and dig.year - 1, viz and viz.year,
                        viz and viz.year - 1, viz and viz.year + 1, sei] if a}
    melhor = None
    for ai in anos:
        for av in anos:
            ni, nv = troca_ano(ida, ai), troca_ano(volta, av)
            if not coerente(ni, nv) or (ni == ida and nv == volta) or ni > hoje + dt.timedelta(days=180):
                continue
            ev = []
            if na_janela(ni, dig) and not (na_janela(ida, dig) and coerente(ida, volta)):
                ev.append("digitação")
            if sei and ni.year == sei and ida.year != sei:
                ev.append("SEI")
            if viz and abs((ni - viz).days) <= 120 and abs((ida - viz).days) >= 300:
                ev.append("lançamentos vizinhos")
            if not coerente(ida, volta) and (ni == ida or nv == volta):
                ev.append("ida/volta coerentes")
            if futura:
                ev.append("data futura")
            chave = (len(ev), -abs((ni - (viz or ni)).days))
            if melhor is None or chave > melhor[0]:
                melhor = (chave, ni, nv, ev)

    base = {"codigo_legado": r["codigo"], "servidor": (r["nomedoservidor"] or "").strip(), "ida_legado": str(ida),
            "volta_legado": str(volta), "data_digitacao": r["data_digitacao"] or "", "processo_sei": r["numeroSei"] or "",
            "status": r["status"], "valor": r["valor_total_de_diarias"], "vizinhos": str(viz or "")}
    # Erro de dia/mês: ancora na ponta próxima da digitação e recalcula a outra pela quantidade de diárias.
    qtd = float(r["integrais_quantidade"] or 0) + float(r["parciais_quantidade"] or 0)
    if (not melhor or len(melhor[3]) < 2) and not coerente(ida, volta) and dig and qtd > 0:
        dias = max(int(-(-qtd // 1)) - 1, 0)  # 1 diária = mesmo dia; 2,5 diárias = 2 dias depois
        if na_janela(ida, dig) and not na_janela(volta, dig):
            melhor = ((2, 0), ida, ida + dt.timedelta(days=dias), ["digitação", "quantidade de diárias"])
        elif na_janela(volta, dig) and not na_janela(ida, dig):
            melhor = ((2, 0), volta - dt.timedelta(days=dias), volta, ["digitação", "quantidade de diárias"])
        elif na_janela(ida, dig) and na_janela(volta, dig):
            # Ambas plausíveis: vale a ponta mais próxima da digitação (lançamentos costumam ser feitos logo após a viagem).
            if abs((dig - ida).days) <= abs((dig - volta).days):
                melhor = ((2, 0), ida, ida + dt.timedelta(days=dias), ["digitação", "quantidade de diárias"])
            else:
                melhor = ((2, 0), volta - dt.timedelta(days=dias), volta, ["digitação", "quantidade de diárias"])

    if melhor and len(melhor[3]) >= 2:
        linhas.append({**base, "decisao": "CORRIGIR", "ida_corrigida": str(melhor[1]), "volta_corrigida": str(melhor[2]),
                       "evidencias": " + ".join(melhor[3])})
    else:
        motivo = ("SEI do ano anterior para viagem de jan/fev (processo aberto antes da viagem)"
                  if sei and ida.month <= 2 and sei == ida.year - 1 and coerente(ida, volta)
                  else "sem duas evidências independentes")
        linhas.append({**base, "decisao": "MANTER", "ida_corrigida": "", "volta_corrigida": "", "evidencias": motivo})

with open(saida, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()), delimiter="\t")
    w.writeheader()
    w.writerows(sorted(linhas, key=lambda x: (x["decisao"], x["ida_legado"])))

corr = [x for x in linhas if x["decisao"] == "CORRIGIR"]
print(f"suspeitos: {len(linhas)} | CORRIGIR: {len(corr)} | MANTER: {len(linhas) - len(corr)}")
