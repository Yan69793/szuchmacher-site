import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "agents"))
import agenda_agent as a  # noqa: E402


def test_ipca15_em_ingles():
    en, desc = a.traduzir_ibge_en("Índice Nacional de Preços ao Consumidor Amplo 15")
    assert "IPCA-15" in en and "Preços" not in en and "Scheduled" in desc


def test_ipca_nao_vira_ipca15():
    en, _ = a.traduzir_ibge_en("Índice Nacional de Preços ao Consumidor Amplo")
    assert "15" not in en


def test_titulo_desconhecido_nao_e_inventado():
    assert a.traduzir_ibge_en("Foo Bar")[0] == "Foo Bar"


def test_pmi_flash_sem_portugues_nos_campos_en():
    evs = a._eventos_global_pmi("2026-10-20", "2026-10-30")
    assert len(evs) == 4
    for e in evs:
        for campo in ("evento_en", "descricao_en"):
            for pt in ("EUA", "Zona do Euro", "Reino Unido", "Alemanha"):
                assert pt not in e[campo]
