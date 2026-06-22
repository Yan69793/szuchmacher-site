"""
populador.py — YAN OS v2
Popula o template PPTX substituindo shapes diretamente (sem placeholders).
"""

import re
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    import lxml.etree as etree
except ImportError:
    raise ImportError("Execute: pip install python-pptx lxml")

VERDE    = RGBColor(0x1A, 0x7A, 0x40)
VERMELHO = RGBColor(0xB8, 0x1C, 0x1C)
NS = "http://schemas.openxmlformats.org/drawingml/2006/main"

def qn(t): return f"{{{NS}}}{t}"
def rgb_hex(cor): return str(cor)  # RGBColor.__str__ retorna "1A7A40"

def _capturar_estilo(txBody):
    est = {"sz": "1100", "latin": None, "cor_hex": "002A4A", "lnSpc": "150000"}
    for p in txBody.findall(qn("p")):
        for r in p.findall(qn("r")):
            rPr = r.find(qn("rPr"))
            if rPr is not None:
                if rPr.get("sz"): est["sz"] = rPr.get("sz")
                lat = rPr.find(qn("latin"))
                if lat is not None: est["latin"] = etree.tostring(lat, encoding="unicode")
                sf = rPr.find(qn("solidFill"))
                if sf is not None:
                    srgb = sf.find(qn("srgbClr"))
                    if srgb is not None: est["cor_hex"] = srgb.get("val", "002A4A")
        pPr = p.find(qn("pPr"))
        if pPr is not None:
            lnSpc = pPr.find(qn("lnSpc"))
            if lnSpc is not None:
                s = lnSpc.find(qn("spcPct"))
                if s is not None: est["lnSpc"] = s.get("val", "150000")
        if est["sz"] and est["latin"]: return est
    return est

def _build_run(texto, bold, italic, est, cor=None):
    r = etree.Element(qn("r"))
    rPr = etree.SubElement(r, qn("rPr"))
    rPr.set("lang", "pt-BR"); rPr.set("dirty", "0")
    rPr.set("sz", est.get("sz", "1100"))
    if bold:   rPr.set("b", "1")
    if italic: rPr.set("i", "1")
    hex_val = rgb_hex(cor) if cor else est.get("cor_hex", "002A4A")
    sf = etree.SubElement(rPr, qn("solidFill"))
    etree.SubElement(sf, qn("srgbClr")).set("val", hex_val)
    if est.get("latin"):
        try: rPr.append(etree.fromstring(est["latin"]))
        except: pass
    etree.SubElement(r, qn("t")).text = texto
    return r

def _reescrever(shape, paragrafos, bold_first=False, italic=False):
    txBody = shape.text_frame._txBody
    est = _capturar_estilo(txBody)
    for p in txBody.findall(qn("p")): txBody.remove(p)
    for texto in paragrafos:
        if not texto: continue
        p_el = etree.SubElement(txBody, qn("p"))
        pPr  = etree.SubElement(p_el, qn("pPr"))
        lnSpc = etree.SubElement(pPr, qn("lnSpc"))
        etree.SubElement(lnSpc, qn("spcPct")).set("val", est.get("lnSpc", "150000"))
        if bold_first:
            m  = re.match(r'([^.!?]*[.!?])\s*(.*)', texto.strip(), re.DOTALL)
            f1 = m.group(1).strip() if m else texto.strip()
            f2 = m.group(2).strip() if m else ""
            p_el.append(_build_run(f1, True, italic, est))
            if f2: p_el.append(_build_run(" " + f2, False, italic, est))
        else:
            p_el.append(_build_run(texto.strip(), False, italic, est))
    fim = etree.SubElement(txBody, qn("p"))
    etree.SubElement(fim, qn("endParaRPr")).set("lang", "pt-BR")

def _set_cell(tabela, row, col, texto, cor=None):
    txBody = tabela.rows[row].cells[col].text_frame._txBody
    est = _capturar_estilo(txBody)
    for p in txBody.findall(qn("p")): txBody.remove(p)
    p_el = etree.SubElement(txBody, qn("p"))
    t = str(texto).strip()
    if cor is None:
        if t.startswith("+"): cor = VERDE
        elif t.startswith("-"): cor = VERMELHO
    p_el.append(_build_run(t, False, False, est, cor=cor))

def _atualizar_data(src, data_iso):
    try:
        dt  = datetime.strptime(data_iso, "%Y-%m-%d")
        nova = f"{dt.day:02d}/{dt.month:02d}/{dt.year}"
    except:
        nova = data_iso
    tmp = str(src).replace(".pptx", "_tmpdata.pptx")
    cont = {}
    with zipfile.ZipFile(src, "r") as z:
        for n in z.namelist(): cont[n] = z.read(n)
    key = "ppt/slideLayouts/slideLayout1.xml"
    if key in cont:
        xml = re.sub(r'\d{2}/\d{2}/\d{4}', nova, cont[key].decode("utf-8"))
        cont[key] = xml.encode("utf-8")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for n, d in cont.items(): z.writestr(n, d)
    return tmp


def popular_pptx(template_path: str, dados: dict, narrativa: dict, saida_path: str) -> str:
    print(f"\n[populador] Template: {Path(template_path).name}")

    hoje = dados.get("data", datetime.now().strftime("%Y-%m-%d"))
    tmp  = _atualizar_data(template_path, hoje)
    prs  = Presentation(tmp)
    sl   = list(prs.slides)

    # Extrai textos da narrativa
    def txt(lista): return [str(x) for x in lista if x]
    def driver_txt(d):
        if isinstance(d, dict): return d.get("texto", "")
        return str(d)

    destaques = txt([re.sub(r'\*\*','',x) for x in narrativa.get("destaques",[])])
    radar     = txt(narrativa.get("no_radar", []))
    drivers   = txt([driver_txt(d) for d in narrativa.get("drivers", [])])
    agenda    = txt(narrativa.get("agenda", []))
    la_trame  = narrativa.get("la_trame", "")

    # ── Slide 0: Destaques + Radar ──────────────────────────────────────────
    print("[populador] Substituindo em 4 slides...")
    _reescrever(sl[0].shapes[2], destaques, bold_first=True)
    _reescrever(sl[0].shapes[4], radar)

    # ── Slide 1: Drivers + Agenda + La Trame ───────────────────────────────
    _reescrever(sl[1].shapes[2], drivers, bold_first=True)
    _reescrever(sl[1].shapes[3], agenda)
    _reescrever(sl[1].shapes[6], [la_trame], italic=True)

    # ── Slide 2: Tabelas ────────────────────────────────────────────────────
    def g(s, c, sub): 
        try: return str(dados.get(s,{}).get(c,{}).get(sub,"—"))
        except: return "—"

    tabelas = {
        1: {1:(g("asia","nikkei","pontos"),    g("asia","nikkei","variacao")),
            2:(g("asia","hang_seng","pontos"), g("asia","hang_seng","variacao")),
            3:(g("asia","shanghai","pontos"),  g("asia","shanghai","variacao"))},
        2: {1:(g("yields","treasury_10y","taxa"), g("yields","treasury_10y","variacao")),
            2:(g("yields","bund_10y","taxa"),     g("yields","bund_10y","variacao")),
            3:(g("yields","jgb_10y","taxa"),      g("yields","jgb_10y","variacao"))},
        3: {1:(f"$ {g('commodities','wti','preco')}",    g("commodities","wti","variacao")),
            2:(f"$ {g('commodities','ouro','preco')}",   g("commodities","ouro","variacao")),
            3:(f"$ {g('commodities','minerio','preco')}", g("commodities","minerio","variacao"))},
        4: {1:(g("brasil","ibovespa","pontos"),    g("brasil","ibovespa","variacao")),
            2:(f"R$ {g('brasil','dolar','valor')}", g("brasil","dolar","variacao")),
            3:(f"{g('brasil','di_jan28','taxa')}%", g("brasil","di_jan28","variacao"))},
        5: {1:(g("eua","sp500","pontos"),  g("eua","sp500","variacao")),
            2:(g("eua","nasdaq","pontos"), g("eua","nasdaq","variacao")),
            3:(g("eua","dow","pontos"),    g("eua","dow","variacao"))},
        6: {1:(g("europa","dax","pontos"),  g("europa","dax","variacao")),
            2:(g("europa","cac","pontos"),  g("europa","cac","variacao")),
            3:(g("europa","ftse","pontos"), g("europa","ftse","variacao"))},
    }

    for si, linhas in tabelas.items():
        t = sl[2].shapes[si].table
        for ri, (val, var) in linhas.items():
            _set_cell(t, ri, 1, val)
            _set_cell(t, ri, 2, var)

    print("  4/4 slides processados.")
    prs.save(saida_path)
    try: Path(tmp).unlink()
    except: pass
    print(f"[populador] ✓ Salvo: {saida_path}")
    return saida_path
