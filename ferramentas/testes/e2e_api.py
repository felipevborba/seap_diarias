"""Teste ponta a ponta da API (banco de desenvolvimento com database/dev/01_dados_ficticios.sql e schemas recém-criados).
Uso: python3 ferramentas/testes/e2e_api.py [http://localhost:5244]"""
import json, sys, time, urllib.request, urllib.error
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5244"
def call(m, p, body=None, tok=None, raw=False):
    r=urllib.request.Request(B+p, method=m, data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type":"application/json", **({"Authorization":"Bearer "+tok} if tok else {})})
    try:
        with urllib.request.urlopen(r) as resp:
            d=resp.read(); return resp.status, (d if raw else json.loads(d or b'null'))
    except urllib.error.HTTPError as e:
        d=e.read()
        try: return e.code, json.loads(d)
        except: return e.code, d.decode()[:200]
falhas=0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas+=1
    print(("PASS " if cond else "FAIL ")+nome, extra)
def login(cpf): return call("POST","/api/auth/login",{"cpf":cpf,"senha":"123456"})
A1="10433218100"; A2="96001338914"   # usuários fictícios de database/dev/01_dados_ficticios.sql

s,r=login(A2); ok("sem perfil bloqueado", s==401)
s,r=login(A1); T=r["data"]["token"]; ok("login admin geral", r["data"]["perfil"]=="ADMIN")
s,r=call("POST","/api/servidores/sincronizar-policiais",tok=T); ok("sincroniza policiais", r["success"], r["message"])
s,r=call("GET","/api/servidores?ativo=true",tok=T); serv=r["data"]["items"][0]
s,r=call("POST","/api/servidores",{"nome":"Maria Contratada","cpf":"529.982.247-25","matricula":"C-77","vinculo":"Contratado","cargoId":None,"unidadeId":None,"email":None,"celular":None,"banco":"BB","agencia":"1","conta":"2","ativo":True},tok=T)
contratado=r["data"]; ok("servidor contratado", r["success"])
s,t=call("GET","/api/cadastros/tipos",tok=T); tid={x["nome"]:x["id"] for x in t["data"]}
I,P=tid["Integral"],tid["Parcial"]
s,r=call("POST","/api/cadastros/valores",{"tipoDiariaId":I,"vinculo":None,"cargoId":None,"valor":177,"vigenciaInicio":"2026-01-01","vigenciaFim":None},tok=T); vInt=r["data"]
call("POST","/api/cadastros/valores",{"tipoDiariaId":P,"vinculo":None,"cargoId":None,"valor":88.5,"vigenciaInicio":"2026-01-01","vigenciaFim":None},tok=T)
call("POST","/api/cadastros/valores",{"tipoDiariaId":I,"vinculo":"Contratado","cargoId":None,"valor":150,"vigenciaInicio":"2026-01-01","vigenciaFim":None},tok=T)
s,m=call("GET","/api/localidades/municipios?busca=caruaru",tok=T); car=m["data"][0]["id"]
s,m=call("GET","/api/localidades/municipios?busca=petrol",tok=T); pet=m["data"][0]["id"]
s,m=call("GET","/api/localidades/municipios?busca=recife",tok=T); rec=m["data"][0]["id"]

per=lambda ini,fim,dest,itens,id=None,orig=None,pas=None: {"id":id,"dataInicio":ini,"dataFim":fim,"destinoMunicipioId":dest,"itens":itens,
    "origemMunicipioId":orig if orig is not None else rec,"passagem":pas}
it=lambda tipo,q=None,id=None: {"id":id,"tipoDiariaId":tipo,"quantidade":q}
pasg=lambda ida,volta,ag="GOL",**k: {"agencia":ag,"categoria":"ECONÔMICA","dataIda":None,"dataVolta":None,"valorIda":ida,"valorVolta":volta,**k}
s,r=call("POST","/api/diarias",{"servidorId":serv["id"],"objetivo":"Sem origem","processoSei":None,"observacao":None,"periodos":[per("2026-03-01","2026-03-01",car,[it(I)],orig=0)]},tok=T)
ok("cidade de origem obrigatoria (por periodo)", not r["success"] and "origem" in r["message"], r["message"])
req={"servidorId":serv["id"],"objetivo":"Escolta","processoSei":"1/2026","observacao":"CI 98","periodos":[
    per("2026-10-05","2026-10-07",car,[it(I,2),it(P,1)]), per("2026-10-10","2026-10-15",pet,[it(I)],orig=car)]}
s,r=call("POST","/api/diarias/simular",req,tok=T)
ok("simulacao pela tabela nacional (classe 2, Grupo III): 2x170,12 + 1x57 + 6x170,12 = 1417,96", r["data"]["valorTotal"]==1417.96 and r["data"]["valorDiarias"]==1417.96 and r["data"]["valorPassagens"]==0 and r["data"]["classeBeneficiario"]==2, str(r["data"]["valorTotal"]))
ok("simulacao mostra a faixa do destino", "Grupo III" in (r["data"]["periodos"][0]["faixaDestino"] or ""), r["data"]["periodos"][0]["faixaDestino"])
s,r=call("POST","/api/diarias",req,tok=T); d1=r["data"]; ok("lanca diaria com itens", r["success"], r["message"])
s,r=call("GET",f"/api/diarias/{d1}",tok=T); det=r["data"]
ok("nova diaria ja entra APROVADA (sem etapa de aprovacao)", det["situacao"]=="APROVADA", det["situacao"])
ok("periodo 1 com 2 itens", len(det["periodos"][0]["itens"])==2)
ok("origem por periodo", det["periodos"][0]["origemMunicipioId"]==rec and det["periodos"][1]["origemMunicipioId"]==car and "Recife" in det["periodos"][0]["origem"], det["periodos"][1]["origem"])
s,r=call("POST","/api/diarias",{**req,"periodos":[per("2026-10-14","2026-10-16",car,[it(P,1)])]},tok=T)
ok("conflito de datas bloqueado", not r["success"], r["message"][:80])
s,r=call("POST","/api/diarias/simular",{**req,"servidorId":contratado,"periodos":[per("2026-11-01","2026-11-03",car,[it(I,3),it(P,1)])]},tok=T)
ok("soma de quantidades > dias bloqueada", any("excede" in e for e in r["data"]["erros"]))
s,r=call("POST","/api/diarias/simular",{**req,"servidorId":contratado,"periodos":[per("2026-11-01","2026-11-03",car,[it(I,1),it(I,1)])]},tok=T)
ok("tipo repetido bloqueado", any("repetido" in e for e in r["data"]["erros"]))
s,r=call("POST",f"/api/diarias/{d1}/aprovar",tok=T); ok("rota de aprovacao nao existe mais", s in (404,405), str(s))
s,r=call("POST",f"/api/diarias/{d1}/cancelar",{"motivo":"x"},tok=T); ok("rota de cancelamento nao existe mais", s in (404,405), str(s))
s,u=call("GET","/api/usuarios?somenteComAcesso=false",tok=T); outro=[x for x in u["data"]["items"] if not x["administradorGeral"]][0]
of=next(v for v in call("GET","/api/cadastros/valores",tok=T)[1]["data"] if v["tipoDiariaId"]==I and v["classeBeneficiario"]==2 and v["faixaDestino"]=="ESTADO")
s,r=call("PUT",f"/api/cadastros/valores/{of['id']}",{"tipoDiariaId":I,"vinculo":None,"cargoId":None,"classeBeneficiario":2,"faixaDestino":"ESTADO","valor":170.12,"vigenciaInicio":of["vigenciaInicio"],"vigenciaFim":"2026-09-30"},tok=T); ok("encerra vigencia da linha oficial", r["success"], r.get("message"))
s,r=call("POST","/api/cadastros/valores",{"tipoDiariaId":I,"vinculo":None,"cargoId":None,"classeBeneficiario":2,"faixaDestino":"ESTADO","valor":200,"vigenciaInicio":"2026-10-01","vigenciaFim":None},tok=T); ok("reajuste da linha oficial", r["success"], r.get("message"))
ed={**req,"objetivo":"Escolta (ajustada)","periodos":[per(p["dataInicio"],p["dataFim"],p["destinoMunicipioId"],
    [it(i["tipoDiariaId"],i["quantidade"],i["id"]) for i in p["itens"]],p["id"],orig=p["origemMunicipioId"]) for p in det["periodos"]]}
s,r=call("PUT",f"/api/diarias/{d1}",ed,tok=T); ok("edicao", r["success"], r["message"])
s,r=call("GET",f"/api/diarias/{d1}",tok=T)
ok("edicao mantem valores gravados apesar do reajuste", r["data"]["valorTotal"]==1417.96, str(r["data"]["valorTotal"]))
ok("edicao continua APROVADA", r["data"]["situacao"]=="APROVADA")
s,r=call("PUT",f"/api/diarias/{d1}",{**ed,"periodos":ed["periodos"]+[per("2026-10-20","2026-10-20",car,[it(I)])]},tok=T)
s,r=call("GET",f"/api/diarias/{d1}",tok=T); ok("periodo novo usa valor reajustado", r["data"]["valorTotal"]==1617.96, str(r["data"]["valorTotal"]))
# passagens aereas (campos proprios, ANEXO 2 do legado)
reqPa={**req,"servidorId":contratado,"objetivo":"Curso em Brasília","periodos":[per("2026-12-01","2026-12-03",car,[it(I)],pas=pasg(968.78,968.77))]}
s,r=call("POST","/api/diarias/simular",reqPa,tok=T)
ok("passagem: diarias 3x120 (contratado = classe 3) + passagem 968,78+968,77", r["data"]["valorDiarias"]==360 and r["data"]["valorPassagens"]==1937.55 and r["data"]["valorTotal"]==2297.55 and not r["data"]["erros"],
   f'{r["data"]["valorDiarias"]} {r["data"]["valorPassagens"]} {r["data"]["erros"]}')
s,r=call("POST","/api/diarias/simular",{**reqPa,"periodos":[per("2026-12-01","2026-12-03",car,[it(I)],pas=pasg(100,0,ag=""))]},tok=T)
ok("passagem sem agencia bloqueada", any("agência" in e for e in r["data"]["erros"]), str(r["data"]["erros"]))
s,r=call("POST","/api/diarias/simular",{**reqPa,"periodos":[per("2026-12-01","2026-12-03",car,[it(I)],pas=pasg(0,0))]},tok=T)
ok("passagem sem valor bloqueada", any("valor da passagem" in e for e in r["data"]["erros"]), str(r["data"]["erros"]))
s,r=call("POST","/api/diarias/simular",{**reqPa,"periodos":[per("2026-12-01","2026-12-03",car,[])]},tok=T)
ok("periodo sem diaria e sem passagem bloqueado", any("passagem" in e for e in r["data"]["erros"]), str(r["data"]["erros"]))
s,r=call("POST","/api/diarias",reqPa,tok=T); dpa=r["data"]; ok("lanca diaria com passagem", r["success"], r["message"])
s,r=call("GET",f"/api/diarias/{dpa}",tok=T); pz=r["data"]["periodos"][0]["passagem"]
ok("passagem gravada (data de ida = inicio do periodo)", pz and pz["agencia"]=="GOL" and pz["valorTotal"]==1937.55 and pz["dataIda"]=="2026-12-01" and r["data"]["valorPassagens"]==1937.55 and r["data"]["valorTotal"]==2297.55, str(pz))
s,r=call("POST","/api/diarias",{**reqPa,"objetivo":"So passagem","periodos":[per("2026-12-10","2026-12-10",car,[],pas=pasg(500,0))]},tok=T)
dso=r["data"]; ok("periodo so com passagem", r["success"], r["message"])
ed2={**reqPa,"periodos":[per("2026-12-01","2026-12-03",car,[it(I,None,r2["id"]) for r2 in call("GET",f"/api/diarias/{dpa}",tok=T)[1]["data"]["periodos"][0]["itens"]],
     call("GET",f"/api/diarias/{dpa}",tok=T)[1]["data"]["periodos"][0]["id"])]}
s,r=call("PUT",f"/api/diarias/{dpa}",ed2,tok=T); s,r=call("GET",f"/api/diarias/{dpa}",tok=T)
ok("remover passagem na edicao", r["data"]["periodos"][0]["passagem"] is None and r["data"]["valorPassagens"]==0 and r["data"]["valorTotal"]==360, str(r["data"]["valorTotal"]))
s,r=call("PUT",f"/api/diarias/{dpa}",reqPa|{"periodos":[{**ed2["periodos"][0],"passagem":pasg(968.78,968.77)}]},tok=T)
s,r=call("GET",f"/api/relatorios/dashboard?situacao=VIGENTES&dataInicio=2026-12-01&dataFim=2026-12-31",tok=T)
ok("painel soma passagens a parte", r["data"]["valorPassagens"]==2437.55 and r["data"]["passagens"]==2 and r["data"]["totais"]["valorTotal"]==360, f'{r["data"]["valorPassagens"]} {r["data"]["totais"]}')
# exclusao (substitui o cancelamento)
s,r=call("POST","/api/diarias",{**req,"periodos":[per("2026-10-25","2026-10-26",car,[it(P,1)])]},tok=T); d2=r["data"]; ok("lanca para excluir", r["success"], r["message"])
s,r=call("DELETE",f"/api/diarias/{d2}",tok=T); ok("exclui diaria", r["success"], r["message"])
s,r=call("GET",f"/api/diarias/{d2}",tok=T); ok("diaria excluida some", s==404)
s,r=call("GET",f"/api/relatorios/auditoria?entidade=diaria",tok=T); ok("auditoria guarda a exclusao", any(a["acao"]=="EXCLUSAO" and a["entidadeId"]==str(d2) for a in r["data"]["items"]))
s,r=call("POST","/api/diarias",{**req,"periodos":[per("2026-10-25","2026-10-26",car,[it(P,1)])]},tok=T); ok("exclusao libera as datas", r["success"], r["message"]); d3=r["data"]
s,r=call("GET","/api/relatorios?dataInicio=2026-10-01&dataFim=2026-10-31&situacao=TODAS",tok=T); ok("relatorio do mes", r["data"]["linhas"]["totalItems"]==5, str(r["data"]["linhas"]["totalItems"]))
s,x=call("GET","/api/relatorios/exportar?situacao=TODAS",tok=T,raw=True); ok("planilha detalhada", s==200 and x[:2]==b"PK")
s,r=call("GET","/api/relatorios/dashboard",tok=T); ok("dashboard", r["success"])
call("PUT",f"/api/usuarios/{outro['id']}/perfil",{"perfil":"CONSULTA"},tok=T)
s,r=login(A2); s,r=call("DELETE",f"/api/diarias/{d3}",tok=r["data"]["token"]); ok("consulta nao exclui (403)", s==403)

# ---- mapa da controladoria (ANEXO VII) ----
import io, openpyxl
hoje=__import__("datetime").date.today()
ini=hoje.replace(day=1).isoformat(); fim=(hoje.replace(day=28)+__import__("datetime").timedelta(days=4)).replace(day=1)-__import__("datetime").timedelta(days=1)
s,x=call("GET",f"/api/relatorios/mapa-controladoria?cadastroInicio={ini}&cadastroFim={fim.isoformat()}",tok=T,raw=True)
ok("mapa xlsx", s==200 and x[:2]==b"PK", str(s))
wb=openpyxl.load_workbook(io.BytesIO(x)); ws=wb.worksheets[0]
meses=["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"]
ok("mapa: aba com o mes", ws.title==f"{hoje.year} - {meses[hoje.month-1]}", ws.title)
ok("mapa: cabecalho do ANEXO VII", "ANEXO VII - MAPA DE DIÁRIAS E PASSAGENS" in (ws["B3"].value or "") and ws["C6"].value.startswith("NOME DO FAVORECIDO") and wb.sheetnames[1].startswith("Decreto"))
ok("mapa: logo preservado", len(ws._images)==1)
linhas=[[c.value for c in row] for row in ws.iter_rows(min_row=8) if row[2].value]
# d1: 3 periodos (2 itens no primeiro), dpa: 1 com passagem, dso: so passagem, d3: 1 parcial = 6 linhas
ok("mapa: uma linha por periodo", len(linhas)==6, str(len(linhas)))
l1=next(l for l in linhas if l[12].date().isoformat()=="2026-10-05")
ok("mapa: integrais e parciais na mesma linha", l1[0]=="SEAP" and l1[19]==2 and l1[20]==170.12 and l1[21]==1 and l1[22]==57 and l1[23]==3, str(l1[19:24]))
ok("mapa: origem/destino no formato do legado", l1[8]=="Pernambuco" and l1[9]=="RECIFE - PE" and l1[11].startswith("CARUARU - PE"), f"{l1[8]} {l1[9]} {l1[11]}")
ok("mapa: formulas nas celulas cinzas", str(l1[18]).startswith("=Q") and str(l1[24]).startswith("=(T") and str(l1[25]).startswith("=S"), f"{l1[18]} {l1[24]} {l1[25]}")
ok("mapa: SEI, CPF e observacao", l1[26]=="1/2026" and len(l1[27])==14 and l1[28]=="CI 98", f"{l1[26]} {l1[27]} {l1[28]}")
lp=next(l for l in linhas if l[12].date().isoformat()=="2026-12-01")
ok("mapa: passagem nas colunas O-R", lp[14]=="GOL" and lp[15]=="ECONÔMICA" and lp[16]==968.78 and lp[17]==968.77, str(lp[14:18]))
s,x=call("GET","/api/relatorios/mapa-controladoria?cadastroInicio=2020-01-01&cadastroFim=2020-01-31",tok=T,raw=True)
ws0=openpyxl.load_workbook(io.BytesIO(x)).worksheets[0]; ok("mapa vazio informa expressamente", "NÃO HOUVE" in (ws0["C8"].value or ""))

# ---- cargos: exclusao com substituto ----
s,r=call("POST","/api/cadastros/cargos",{"nome":"AGENTE SEG PENITENCIARIA","ativo":True},tok=T); ca=r["data"]
s,r=call("POST","/api/cadastros/cargos",{"nome":"AGENTE DE SEGURANCA PENITENCIARIA","ativo":True},tok=T); cb=r["data"]
s,sv=call("GET",f"/api/servidores/{contratado}",tok=T); sv=sv["data"]
call("PUT",f"/api/servidores/{contratado}",{**sv,"cargoId":ca},tok=T)
s,r=call("DELETE",f"/api/cadastros/cargos/{ca}",tok=T); ok("cargo em uso pede substituto", not r["success"] and "substitu" in r["message"], r["message"][:90])
s,r=call("DELETE",f"/api/cadastros/cargos/{ca}?substitutoId={cb}",tok=T); ok("exclui cargo passando para o substituto", r["success"], r["message"])
s,sv=call("GET",f"/api/servidores/{contratado}",tok=T); ok("servidor passou para o cargo substituto", sv["data"]["cargoId"]==cb)
s,r=call("DELETE",f"/api/cadastros/cargos/{cb}?substitutoId={cb}",tok=T); ok("substituto igual ao excluido bloqueado", not r["success"])
# ---- servidor policial: matricula e lotacao editaveis, sincronizacao nao desfaz ----
pol=next(x for x in call("GET","/api/servidores?ativo=true&pageSize=50",tok=T)[1]["data"]["items"] if x["policialPenal"])
s,sp=call("GET",f"/api/servidores/{pol['id']}",tok=T); sp=sp["data"]
outra=next(u for u in call("GET","/api/cadastros/lotacoes",tok=T)[1]["data"] if u["id"]!=sp["unidadeId"])
s,r=call("PUT",f"/api/servidores/{pol['id']}",{**sp,"matricula":"1234567/01","unidadeId":outra["id"]},tok=T); ok("edita matricula e lotacao de policial", r["success"], r.get("message"))
call("POST","/api/servidores/sincronizar-policiais",tok=T)
s,sp2=call("GET",f"/api/servidores/{pol['id']}",tok=T); sp2=sp2["data"]
ok("sincronizacao nao desfaz matricula nova nem lotacao manual", sp2["matricula"]=="1234567/01" and sp2["unidadeId"]==outra["id"] and sp2["lotacaoManual"] and sp2["matriculaAntiga"], str(sp2))
s,r=call("GET",f"/api/servidores?busca={sp2['matriculaAntiga']}",tok=T); ok("busca pela matricula antiga", r["data"]["totalItems"]>=1)
s,r=call("GET","/api/relatorios?situacao=TODAS&servidor=1/2026",tok=T); ok("busca por processo SEI no relatorio", r["data"]["linhas"]["totalItems"]>=5, str(r["data"]["linhas"]["totalItems"]))
u1=call("GET","/api/cadastros/lotacoes",tok=T)[1]["data"][:2]
s,r=call("GET",f"/api/relatorios?situacao=TODAS&unidadeIds={u1[0]['id']}&unidadeIds={u1[1]['id']}",tok=T); ok("filtro por varias lotacoes", r["success"], r.get("message"))

# ---- feedback da apresentação ----
hoje=hoje.isoformat()
s,r=call("GET",f"/api/relatorios?situacao=TODAS&cadastroInicio={hoje}&cadastroFim={hoje}",tok=T); ok("filtro data do cadastro (hoje)", r["data"]["linhas"]["totalItems"]==6, str(r["data"]["linhas"]["totalItems"]))
s,r=call("GET","/api/relatorios?situacao=TODAS&cadastroInicio=2020-01-01&cadastroFim=2020-12-31",tok=T); ok("filtro data do cadastro (fora)", r["data"]["linhas"]["totalItems"]==0)
s,r=call("GET",f"/api/relatorios?situacao=TODAS&cidadeOrigemId={car}",tok=T); ok("filtro cidade de origem (por periodo)", r["data"]["linhas"]["totalItems"]==1 and r["data"]["linhas"]["items"][0]["cidadeOrigem"].startswith("Caruaru"), str(r["data"]["linhas"]["totalItems"]))
s,x=call("GET",f"/api/relatorios/exportar?situacao=TODAS&cadastroInicio={hoje}&cidadeOrigemId={rec}",tok=T,raw=True); ok("exportacao com filtros novos", s==200 and x[:2]==b"PK")
s,r=call("GET",f"/api/analises/serie?situacao=TODAS&cadastroInicio={hoje[:8]}01&cadastroFim={hoje}&baseData=cadastro",tok=T); ok("serie por data do cadastro", r["success"] and sum(p["valor"] for p in r["data"]["pontos"])>0)
s,r=call("GET","/api/analises/ranking/cidadeOrigem?situacao=TODAS",tok=T); ok("analise por cidade de origem", r["success"] and {i["rotulo"].split("/")[0] for i in r["data"]["itens"][:2]} == {"Recife","Caruaru"}, str([i["rotulo"] for i in r["data"]["itens"][:3]]))
# tipos
s,r=call("POST","/api/cadastros/tipos",{"nome":"teste","descricao":"testes","ativo":True,"colunaMapa":"PARCIAL"},tok=T); tteste=r["data"]
s,t=call("GET","/api/cadastros/tipos",tok=T); ok("tipo com coluna do mapa", next(x for x in t["data"] if x["id"]==tteste)["colunaMapa"]=="PARCIAL" and next(x for x in t["data"] if x["id"]==P)["colunaMapa"]=="PARCIAL")
s,r=call("DELETE",f"/api/cadastros/tipos/{tteste}",tok=T); ok("exclui tipo sem uso", r["success"], r["message"])
s,r=call("DELETE",f"/api/cadastros/tipos/{I}",tok=T); ok("nao exclui tipo em uso", not r["success"] and "usado" in r["message"], r["message"][:70])
# lotacoes
s,r=call("POST","/api/cadastros/lotacoes",{"sigla":"tst","nome":"Unidade de Teste"},tok=T); lid=r["data"]; ok("cria lotacao", r["success"])
s,r=call("PUT",f"/api/cadastros/lotacoes/{lid}",{"sigla":"TST2","nome":"Unidade de Teste 2"},tok=T); ok("edita lotacao", r["success"])
s,r=call("GET","/api/cadastros/lotacoes",tok=T); ok("lista lotacoes com contagens", any(l["sigla"]=="TST2" and l["nome"]=="UNIDADE DE TESTE 2" for l in r["data"]))
s,r=call("DELETE",f"/api/cadastros/lotacoes/{lid}",tok=T); ok("exclui lotacao sem uso", r["success"])
uso=next(l for l in call("GET","/api/cadastros/lotacoes",tok=T)[1]["data"] if l["policiais"]>0)
s,r=call("DELETE",f"/api/cadastros/lotacoes/{uso['id']}",tok=T); ok("nao exclui lotacao em uso", not r["success"] and "em uso" in r["message"], r["message"][:80])
# usuarios
s,r=call("POST","/api/usuarios",{"nome":"Usuario Novo","cpf":"111.444.777-35","matricula":"999","senha":"abc123","perfil":"OPERADOR"},tok=T); nid=r["data"]; ok("cria usuario", r["success"], r.get("message"))
s,r=call("PUT",f"/api/usuarios/{nid}",{"nome":"Usuario Editado","cpf":"111.444.777-35","matricula":"998","novaSenha":"nova123","perfil":"CONSULTA"},tok=T); ok("edita usuario", r["success"], r.get("message"))
s,r=call("POST","/api/auth/login",{"cpf":"11144477735","senha":"nova123"}); ok("login com senha redefinida e perfil novo", s==200 and r["data"]["perfil"]=="CONSULTA")
s,u=call("GET","/api/usuarios?somenteComAcesso=false&busca=Editado",tok=T); ok("lista marca criado pelas Diarias", u["data"]["items"][0]["criadoPelasDiarias"] is True)
s,r=call("DELETE",f"/api/usuarios/{nid}",tok=T); ok("exclui usuario criado pelas Diarias", r["success"] and r["data"]["removidoDoBanco"] is True, r.get("message"))
s,r=call("POST","/api/auth/login",{"cpf":"11144477735","senha":"nova123"}); ok("excluido nao entra mais", s==401)
s,r=call("DELETE",f"/api/usuarios/{outro['id']}",tok=T); ok("usuario da Carteira: so remove o acesso", r["success"] and r["data"]["removidoDoBanco"] is False, r.get("message"))
s,u=call("GET","/api/usuarios?somenteComAcesso=false&busca=Operador",tok=T); ok("usuario da Carteira continua na base", u["data"]["totalItems"]==1 and u["data"]["items"][0]["perfil"] is None)
s,me=call("GET","/api/auth/sessao",tok=T)
s,r=call("DELETE",f"/api/usuarios/{me['data']['usuarioId']}",tok=T); ok("nao exclui a si mesmo", not r["success"])

# ---- tabela de diarias nacionais: faixa pelo destino e classe do servidor/cargo ----
s,v=call("GET","/api/cadastros/valores",tok=T); ok("tabela oficial carregada (30 linhas)", sum(1 for x in v["data"] if x["classeBeneficiario"] and x["faixaDestino"])>=30)
def mun(nome, uf):
    return next(m["id"] for m in call("GET",f"/api/localidades/municipios?busca={urllib.parse.quote(nome)}",tok=T)[1]["data"] if m["uf"]==uf)
import urllib.parse
# Grupo III da classe 2 foi reajustado para 200 a partir de 01/10/2026 (teste de reajuste acima).
casos=[("Brasília","DF",350.87),("Manaus","AM",350.87),("São Paulo","SP",332.08),("Salvador","BA",313.28),("Aracaju","SE",313.28),("Juazeiro","BA",200.0),("Feira de Santana","BA",250.62),("Campina Grande","PB",200.0)]
for nome,uf,esperado in casos:
    s,r=call("POST","/api/diarias/simular",{**req,"periodos":[per("2027-02-01","2027-02-01",mun(nome,uf),[it(I,1)])]},tok=T)
    ok(f"faixa: integral classe 2 em {nome}/{uf} = {esperado}", r["data"]["valorTotal"]==esperado, f'{r["data"]["valorTotal"]} {r["data"]["periodos"][0]["faixaDestino"] if r["data"]["periodos"] else r["data"]["erros"]}')
s,sv=call("GET",f"/api/servidores/{serv['id']}",tok=T); sv=sv["data"]
call("PUT",f"/api/servidores/{serv['id']}",{**sv,"classeBeneficiario":1},tok=T)
s,r=call("POST","/api/diarias/simular",{**req,"periodos":[per("2027-02-01","2027-02-01",car,[it(I,1),it(P,1)])]},tok=T)
ok("classe do servidor (1): 241,86 + 72,54", r["data"]["valorTotal"]==314.40 and r["data"]["classeBeneficiario"]==1, str(r["data"]["valorTotal"]))
call("PUT",f"/api/servidores/{serv['id']}",{**sv,"classeBeneficiario":None},tok=T)
s,c=call("POST","/api/cadastros/cargos",{"nome":"SECRETARIO EXECUTIVO","ativo":True,"classeBeneficiario":1},tok=T); cs=c["data"]
s,cv=call("GET",f"/api/servidores/{contratado}",tok=T); cv=cv["data"]
call("PUT",f"/api/servidores/{contratado}",{**cv,"cargoId":cs},tok=T)
s,r=call("POST","/api/diarias/simular",{**req,"servidorId":contratado,"periodos":[per("2027-03-01","2027-03-01",car,[it(I,1)])]},tok=T)
ok("classe pelo cargo do servidor (1) = 241,86", r["data"]["valorTotal"]==241.86, str(r["data"]["valorTotal"]))
# ---- paginacao/ordem do relatorio: mais recente primeiro ----
s,r=call("GET","/api/relatorios?situacao=TODAS&pageSize=50",tok=T); datas=[x["dataInicio"] for x in r["data"]["linhas"]["items"]]
ok("relatorio do mais recente para o mais antigo", datas==sorted(datas, reverse=True), str(datas[:4]))
# ---- usuarios: administrador geral pode perder o acesso, mas nao o ultimo admin ----
s,me=call("GET","/api/auth/sessao",tok=T); eu=me["data"]["usuarioId"]
s,u=call("GET","/api/usuarios?somenteComAcesso=false&pageSize=50",tok=T)
s,r=call("POST","/api/usuarios",{"nome":"Admin Dois","cpf":"390.533.447-05","matricula":"77","senha":"abc123","perfil":"ADMIN"},tok=T); a2=r["data"]; ok("cria segundo admin", r["success"], r.get("message"))
T3=call("POST","/api/auth/login",{"cpf":"39053344705","senha":"abc123"})[1]["data"]["token"]
s,r=call("DELETE",f"/api/usuarios/{eu}",tok=T3); ok("remove acesso do administrador geral da Carteira", r["success"] and r["data"]["removidoDoBanco"] is False, r.get("message"))
s,r=login(A1); ok("administrador geral sem acesso nao entra nas Diarias", s==401, str(s))
s,r=call("PUT",f"/api/usuarios/{eu}/perfil",{"perfil":"ADMIN"},tok=T3); ok("devolve o acesso escolhendo um perfil", r["success"])
s,r=login(A1); ok("administrador geral volta a entrar", s==200)
T=r["data"]["token"]
s,r=call("DELETE",f"/api/usuarios/{a2}",tok=T); ok("exclui o segundo admin", r["success"])
# ---- operador troca a propria senha ----
time.sleep(61)  # limite de 10 logins por minuto
s,r=call("POST","/api/usuarios",{"nome":"Operador Senha","cpf":"714.602.380-01","matricula":"88","senha":"abc123","perfil":"OPERADOR"},tok=T); op=r["data"]; ok("cria operador", r["success"], r.get("message"))
TO=call("POST","/api/auth/login",{"cpf":"71460238001","senha":"abc123"})[1]["data"]["token"]
s,r=call("POST","/api/auth/senha",{"senhaAtual":"errada","novaSenha":"nova456"},tok=TO); ok("senha atual errada recusada sem derrubar a sessao", s==400, str(s))
s,r=call("POST","/api/auth/senha",{"senhaAtual":"abc123","novaSenha":"  12  "},tok=TO); ok("senha curta recusada", s==400, str(s))
s,r=call("POST","/api/auth/senha",{"senhaAtual":"abc123","novaSenha":"abc123"},tok=TO); ok("senha igual a atual recusada", s==400, str(s))
s,r=call("POST","/api/auth/senha",{"senhaAtual":"abc123","novaSenha":"nova456"}); ok("sem login nao troca senha", s==401, str(s))
s,r=call("POST","/api/auth/senha",{"senhaAtual":"abc123","novaSenha":"nova456"},tok=TO); ok("operador troca a propria senha", r["success"], r.get("message"))
s,r=call("POST","/api/auth/login",{"cpf":"71460238001","senha":"abc123"}); ok("senha antiga nao entra mais", s==401, str(s))
s,r=call("POST","/api/auth/login",{"cpf":"71460238001","senha":"nova456"}); ok("senha nova entra", s==200, str(s))
s,r=call("GET","/api/relatorios/auditoria?entidade=usuario&pageSize=5",tok=T); au=[a for a in r["data"]["items"] if a["entidadeId"]==str(op) and a["acao"]=="ALTERACAO"]
ok("troca de senha auditada sem expor a senha", len(au)==1 and "nova456" not in json.dumps(au) and au[0]["usuarioNome"]=="Operador Senha", json.dumps(au)[:200])
call("DELETE",f"/api/usuarios/{op}",tok=T)
# ---- auditoria identifica o servidor por matricula ou CPF ----
s,r=call("GET","/api/relatorios/auditoria?entidade=servidor&pageSize=50",tok=T); au=r["data"]["items"]
s,lst=call("GET","/api/servidores?ativo=true&pageSize=50",tok=T); porId={str(x["id"]):x for x in lst["data"]["items"]}
com=[a for a in au if a["entidadeId"] in porId]
ok("auditoria traz matricula ou CPF do servidor", com and all((a["servidorMatricula"] or a["servidorCpf"])==(porId[a["entidadeId"]]["matricula"] or porId[a["entidadeId"]]["cpf"]) for a in com), str(len(com)))
s,r=call("GET","/api/relatorios/auditoria?entidade=cargo&pageSize=5",tok=T); ok("outros registros nao trazem servidor", all(a["servidorMatricula"] is None and a["servidorCpf"] is None for a in r["data"]["items"]))
print("FALHAS:", falhas); sys.exit(1 if falhas else 0)
