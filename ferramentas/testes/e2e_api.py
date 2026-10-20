"""Teste ponta a ponta da API (banco de desenvolvimento com database/dev/01_dados_ficticios.sql e schemas recém-criados).
Uso: python3 ferramentas/testes/e2e_api.py [http://localhost:5244]"""
import json, sys, urllib.request, urllib.error
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

per=lambda ini,fim,dest,itens,id=None: {"id":id,"dataInicio":ini,"dataFim":fim,"destinoMunicipioId":dest,"itens":itens}
it=lambda tipo,q=None,id=None: {"id":id,"tipoDiariaId":tipo,"quantidade":q}
s,r=call("POST","/api/diarias/simular",{"servidorId":serv["id"],"objetivo":"x","processoSei":None,"observacao":None,"periodos":[]},tok=T)
s,r=call("POST","/api/diarias",{"servidorId":serv["id"],"objetivo":"Sem origem","processoSei":None,"observacao":None,"periodos":[{"id":None,"dataInicio":"2026-03-01","dataFim":"2026-03-01","destinoMunicipioId":car,"itens":[{"id":None,"tipoDiariaId":I,"quantidade":None}]}]},tok=T)
ok("cidade de origem obrigatoria", not r["success"] and "origem" in r["message"], r["message"])
req={"servidorId":serv["id"],"origemMunicipioId":rec,"objetivo":"Escolta","processoSei":"1/2026","observacao":None,"periodos":[
    per("2026-10-05","2026-10-07",car,[it(I,2),it(P,1)]), per("2026-10-10","2026-10-15",pet,[it(I)])]}
s,r=call("POST","/api/diarias/simular",req,tok=T)
ok("simulacao: 2x177 + 1x88,50 + 6x177 = 1504,50", r["data"]["valorTotal"]==1504.5, str(r["data"]["valorTotal"]))
s,r=call("POST","/api/diarias",req,tok=T); d1=r["data"]; ok("lanca diaria com itens", r["success"], r["message"])
s,r=call("GET",f"/api/diarias/{d1}",tok=T); det=r["data"]
ok("nova diaria entra PENDENTE", det["situacao"]=="PENDENTE")
ok("periodo 1 com 2 itens", len(det["periodos"][0]["itens"])==2)
s,r=call("POST","/api/diarias",{**req,"periodos":[per("2026-10-14","2026-10-16",car,[it(P,1)])]},tok=T)
ok("conflito de datas bloqueado", not r["success"], r["message"][:80])
s,r=call("POST","/api/diarias/simular",{**req,"servidorId":contratado,"periodos":[per("2026-11-01","2026-11-03",car,[it(I,3),it(P,1)])]},tok=T)
ok("soma de quantidades > dias bloqueada", any("excede" in e for e in r["data"]["erros"]))
s,r=call("POST","/api/diarias/simular",{**req,"servidorId":contratado,"periodos":[per("2026-11-01","2026-11-03",car,[it(I,1),it(I,1)])]},tok=T)
ok("tipo repetido bloqueado", any("repetido" in e for e in r["data"]["erros"]))
s,r=call("POST",f"/api/diarias/{d1}/aprovar",tok=T); ok("quem lancou nao aprova", not r["success"], r["message"])
s,u=call("GET","/api/usuarios?somenteComAcesso=false",tok=T); outro=[x for x in u["data"]["items"] if not x["administradorGeral"]][0]
call("PUT",f"/api/usuarios/{outro['id']}/perfil",{"perfil":"ADMIN"},tok=T)
s,r=login(A2); T2=r["data"]["token"]
s,r=call("POST",f"/api/diarias/{d1}/aprovar",tok=T2); ok("outro admin aprova", r["success"], r["message"])
s,r=call("POST",f"/api/diarias/{d1}/rejeitar",{"motivo":"x"},tok=T2); ok("aprovada nao pode ser rejeitada", not r["success"])
call("PUT",f"/api/cadastros/valores/{vInt}",{"tipoDiariaId":I,"vinculo":None,"cargoId":None,"valor":177,"vigenciaInicio":"2026-01-01","vigenciaFim":"2026-09-30"},tok=T)
call("POST","/api/cadastros/valores",{"tipoDiariaId":I,"vinculo":None,"cargoId":None,"valor":200,"vigenciaInicio":"2026-10-01","vigenciaFim":None},tok=T)
s,r=call("GET",f"/api/diarias/{d1}",tok=T); det=r["data"]
ed={**req,"objetivo":"Escolta (ajustada)","periodos":[per(p["dataInicio"],p["dataFim"],p["destinoMunicipioId"],
    [it(i["tipoDiariaId"],i["quantidade"],i["id"]) for i in p["itens"]],p["id"]) for p in det["periodos"]]}
s,r=call("PUT",f"/api/diarias/{d1}",ed,tok=T); ok("edicao", r["success"], r["message"])
s,r=call("GET",f"/api/diarias/{d1}",tok=T)
ok("edicao mantem valores gravados apesar do reajuste", r["data"]["valorTotal"]==1504.5, str(r["data"]["valorTotal"]))
ok("edicao devolve para PENDENTE", r["data"]["situacao"]=="PENDENTE")
s,r=call("PUT",f"/api/diarias/{d1}",{**ed,"periodos":ed["periodos"]+[per("2026-10-20","2026-10-20",car,[it(I)])]},tok=T)
s,r=call("GET",f"/api/diarias/{d1}",tok=T); ok("periodo novo usa valor reajustado", r["data"]["valorTotal"]==1704.5, str(r["data"]["valorTotal"]))
s,r=call("POST",f"/api/diarias/{d1}/rejeitar",{"motivo":"Falta portaria"},tok=T2); ok("rejeicao com motivo", r["success"])
s,r=call("POST","/api/diarias",{**req,"periodos":[per("2026-10-14","2026-10-16",car,[it(P,1)])]},tok=T)
ok("rejeitada libera as datas", r["success"], r["message"]); d2=r["data"]
s,r=call("POST",f"/api/diarias/{d2}/cancelar",{"motivo":"desistiu"},tok=T); ok("cancelamento", r["success"])
s,r=call("GET","/api/relatorios?dataInicio=2026-10-01&dataFim=2026-10-31&situacao=TODAS",tok=T); ok("relatorio todas", r["data"]["linhas"]["totalItems"]==5)
s,x=call("GET","/api/relatorios/exportar?situacao=TODAS",tok=T,raw=True); ok("xlsx", s==200 and x[:2]==b"PK")
s,r=call("GET","/api/relatorios/dashboard?ano=2026",tok=T); ok("dashboard", r["success"])
call("PUT",f"/api/usuarios/{outro['id']}/perfil",{"perfil":"CONSULTA"},tok=T)
s,r=login(A2); s,r=call("POST",f"/api/diarias/{d1}/aprovar",tok=r["data"]["token"]); ok("consulta nao aprova (403)", s==403)

# ---- feedback da apresentação ----
s,r=call("GET",f"/api/diarias/{d1}",tok=T); ok("detalhe traz cidade de origem", r["data"]["cidadeOrigemId"]==rec and "Recife" in r["data"]["cidadeOrigem"], r["data"]["cidadeOrigem"])
hoje=__import__("datetime").date.today().isoformat()
s,r=call("GET",f"/api/relatorios?situacao=TODAS&cadastroInicio={hoje}&cadastroFim={hoje}",tok=T); ok("filtro data do cadastro (hoje)", r["data"]["linhas"]["totalItems"]==5, str(r["data"]["linhas"]["totalItems"]))
s,r=call("GET","/api/relatorios?situacao=TODAS&cadastroInicio=2020-01-01&cadastroFim=2020-12-31",tok=T); ok("filtro data do cadastro (fora)", r["data"]["linhas"]["totalItems"]==0)
s,r=call("GET",f"/api/relatorios?situacao=TODAS&cidadeOrigemId={rec}",tok=T); ok("filtro cidade de origem", r["data"]["linhas"]["totalItems"]==5 and r["data"]["linhas"]["items"][0]["cidadeOrigem"].startswith("Recife"))
s,r=call("GET",f"/api/relatorios?situacao=TODAS&cidadeOrigemId={car}",tok=T); ok("filtro cidade de origem (outra)", r["data"]["linhas"]["totalItems"]==0)
s,x=call("GET",f"/api/relatorios/exportar?situacao=TODAS&cadastroInicio={hoje}&cidadeOrigemId={rec}",tok=T,raw=True); ok("exportacao com filtros novos", s==200 and x[:2]==b"PK")
s,r=call("GET",f"/api/relatorios/dashboard?situacao=VIGENTES&cadastroInicio={hoje}&cadastroFim={hoje}",tok=T); ok("dashboard por data do cadastro", r["success"] and "porOrigem" in r["data"])
s,r=call("GET",f"/api/analises/serie?situacao=TODAS&cadastroInicio={hoje[:8]}01&cadastroFim={hoje}&baseData=cadastro",tok=T); ok("serie por data do cadastro", r["success"] and sum(p["valor"] for p in r["data"]["pontos"])>0)
s,r=call("GET","/api/analises/ranking/cidadeOrigem?situacao=TODAS",tok=T); ok("analise por cidade de origem", r["success"] and r["data"]["itens"][0]["rotulo"].startswith("Recife"))
# tipos
s,r=call("POST","/api/cadastros/tipos",{"nome":"teste","descricao":"testes","ativo":True},tok=T); tteste=r["data"]
s,r=call("DELETE",f"/api/cadastros/tipos/{tteste}",tok=T); ok("exclui tipo sem uso", r["success"], r["message"])
s,r=call("DELETE",f"/api/cadastros/tipos/{I}",tok=T); ok("nao exclui tipo em uso", not r["success"] and "usado" in r["message"], r["message"][:70])
# passagem aerea: valor livre, sem tabela, nao conta como dia
s,r=call("POST","/api/cadastros/tipos",{"nome":"Passagem Aérea","descricao":None,"ativo":True,"valorLivre":True},tok=T); PA=r["data"]; ok("cria tipo valor livre", r["success"], r.get("message"))
reqPa={**req,"servidorId":contratado,"periodos":[per("2026-12-01","2026-12-03",car,[it(I),{"id":None,"tipoDiariaId":PA,"quantidade":None,"valorUnitario":1234.56}])]}
s,r=call("POST","/api/diarias/simular",reqPa,tok=T)
ok("passagem: 3x150 (contratado) + 1234,56 digitado", r["data"]["valorTotal"]==1684.56 and not r["data"]["erros"], f'{r["data"]["valorTotal"]} {r["data"]["erros"]}')
s,r=call("POST","/api/diarias/simular",{**reqPa,"periodos":[per("2026-12-01","2026-12-03",car,[it(I),it(PA)])]},tok=T)
ok("passagem sem valor bloqueada", any("informe o valor" in e for e in r["data"]["erros"]), str(r["data"]["erros"]))
s,r=call("POST","/api/diarias",reqPa,tok=T); dpa=r["data"]; ok("lanca diaria com passagem", r["success"], r["message"])
s,r=call("GET",f"/api/diarias/{dpa}",tok=T); ipa=next(i for i in r["data"]["periodos"][0]["itens"] if i["tipoDiariaId"]==PA)
ok("passagem gravada com valor livre e qtd 1", ipa["valorLivre"] and ipa["quantidade"]==1 and ipa["valorUnitario"]==1234.56)
s,r=call("GET",f"/api/relatorios?situacao=TODAS&servidor=Maria%20Contratada",tok=T); ok("passagem nao soma em quantidade de diarias", r["data"]["totais"]["quantidade"]==3 and r["data"]["totais"]["valorTotal"]==1684.56, str(r["data"]["totais"]))
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
print("FALHAS:", falhas); sys.exit(1 if falhas else 0)
