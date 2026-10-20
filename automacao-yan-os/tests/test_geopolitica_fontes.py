import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("geo", Path(__file__).parents[1] / "agents" / "geopolitica_agent.py")
geo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geo)


def _f(titulo, n):
    return {"url": f"https://x.test/{n}", "titulo": titulo, "veiculo": "V", "data": "2026-10-11", "tipo": "primaria"}


def _payload():
    fontes = [_f("Putin aide looks to boost Russian shipbuilding ties with China", 1),
              _f("How Taiwan's military manpower shortage is undermining its ability to fight", 2),
              _f("Oil prices climb as supply fears grow", 3)] + [_f(f"Filler item number {i}", 10 + i) for i in range(8)]
    tese = {"fato": "Assessor de Putin busca ampliar lacos navais com a China.",
            "interpretacao": "Cooperacao naval avanca.", "sources": fontes[:3]}
    return {"themes": [], "regions": {"china_asia": {"teses": [tese]}}, "sources": list(fontes)}


def test_remove_fonte_taiwan_que_o_texto_nao_usa_e_mantem_as_demais():
    p = _payload()
    log = geo.podar_fontes_sem_uso(p)
    urls = [f["url"] for f in p["regions"]["china_asia"]["teses"][0]["sources"]]
    assert "https://x.test/2" not in urls
    assert "https://x.test/1" in urls and "https://x.test/3" in urls  # sem nome proprio: nao julgada
    assert any("Taiwan" in l for l in log)


def test_global_e_reduzido_so_acima_do_piso():
    p = _payload()
    geo.podar_fontes_sem_uso(p)
    assert all(f["url"] != "https://x.test/2" for f in p["sources"]) or len(p["sources"]) >= 8
