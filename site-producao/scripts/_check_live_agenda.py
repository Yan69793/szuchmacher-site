import re
import urllib.request

h = urllib.request.urlopen("https://szuchmacher.com.br/").read().decode("utf-8", "replace")
print("Organização e clareza:", "Organização e clareza" in h)
print("Clareza estratégica:", "Clareza estratégica" in h)
m = re.search(r"macro-panel\.js\?v=([^\"']+)", h)
print("js ver:", m.group(1) if m else None)
m = re.search(r"sz-design\.css\?v=([^\"']+)", h)
print("css ver:", m.group(1) if m else None)
print("agendaTitle:", "agendaTitle" in h)

req = urllib.request.Request(
    "https://szuchmacher.com.br/assets/macro-panel.js",
    headers={"Cache-Control": "no-cache"},
)
js = urllib.request.urlopen(req).read().decode("utf-8", "replace")
print("rotulo:", "rotuloJanelaAgenda" in js)
print("dia p2 only:", "return { dia: p[2]" in js or "dia: p[2], meta" in js)
print("Proxima semana:", "Próxima semana" in js)
print("old 20/07 as strong:", "return { dia: p[2] + '/' + p[1]" in js)
