"""Lê a connection string do appsettings do CarteiraPenal e imprime: host porta banco usuario senha.
Uso em shell (a senha não é exibida, só repassada):  read -r H P D U W <<< "$(python3 conn_carteira.py <appsettings.json>)" """
import json, sys
cs = json.load(open(sys.argv[1]))["ConnectionStrings"]["DefaultConnection"]
kv = {}
for parte in cs.split(";"):
    if "=" in parte:
        k, v = parte.split("=", 1)
        kv[k.strip().lower()] = v.strip()
host, _, porta = kv.get("host", "").partition(":")
print(host, kv.get("port") or porta or "5432", kv.get("database"), kv.get("username") or kv.get("user id"), kv.get("password"))
