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

per=lambda ini,fim,dest,itens,id=None: {"id":id,"dataInicio":ini,"dataFim":fim,"destinoMunicipioId":dest,"itens":itens}
it=lambda tipo,q=None,id=None: {"id":id,"tipoDiariaId":tipo,"quantidade":q}
req={"servidorId":serv["id"],"objetivo":"Escolta","processoSei":"1/2026","observacao":None,"periodos":[
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
print("FALHAS:", falhas); sys.exit(1 if falhas else 0)
