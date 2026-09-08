import importlib.util
import json
import unittest
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch


ARQUIVO = Path(__file__).parents[1] / "agents" / "geopolitica_agent.py"
spec = importlib.util.spec_from_file_location("geopolitica_agent", ARQUIVO)
geo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geo)


class GeopoliticaAgentTests(unittest.TestCase):
    def test_deduplicar_agrupa_manchetes_semelhantes(self):
        itens = [
            {"titulo": "US sanctions Iran oil exports after shipping crisis", "url": "https://a", "veiculo": "A", "tipo": "primaria"},
            {"titulo": "US sanctions Iran oil exports amid shipping crisis", "url": "https://b", "veiculo": "B", "tipo": "primaria"},
            {"titulo": "ECB discusses next interest-rate decision", "url": "https://c", "veiculo": "C", "tipo": "analise"},
        ]
        grupos = geo.deduplicar(itens)
        self.assertEqual(len(grupos), 2)
        self.assertEqual(grupos[0]["independentes"], 2)

    def test_validar_coleta_exige_fontes_primarias(self):
        grupo = [{"veiculo": "Research", "tipo": "analise"}]
        self.assertFalse(geo.validar_coleta(grupo, 1, 1))

    def test_semana_alvo_domingo_aponta_para_segunda(self):
        domingo = datetime(2026, 9, 6, 18, tzinfo=timezone(timedelta(hours=-3)))
        with patch.object(geo, "brt_now", return_value=domingo):
            self.assertEqual(geo.semana_alvo()[:3], ("2026-W37", "2026-09-07", "2026-09-13"))

    def test_semana_alvo_segunda_de_manha_e_fallback_corrente(self):
        segunda = datetime(2026, 9, 7, 8, tzinfo=timezone(timedelta(hours=-3)))
        with patch.object(geo, "brt_now", return_value=segunda):
            self.assertEqual(geo.semana_alvo()[:3], ("2026-W37", "2026-09-07", "2026-09-13"))

    def test_semana_alvo_manual_aponta_para_proxima(self):
        quarta = datetime(2026, 9, 9, 12, tzinfo=timezone(timedelta(hours=-3)))
        with patch.object(geo, "brt_now", return_value=quarta):
            self.assertEqual(geo.semana_alvo()[:3], ("2026-W38", "2026-09-14", "2026-09-20"))

    def test_janela_domingo_respeita_exemplo_de_data_informado(self):
        self.assertEqual(geo.janela_domingo(date(2026, 9, 7))[1:], ("2026-09-08", "2026-09-13", "08 a 13 de setembro de 2026"))

    def test_janela_domingo_real_inicia_na_segunda(self):
        self.assertEqual(geo.janela_domingo(date(2026, 9, 6))[:3], ("2026-W37", "2026-09-07", "2026-09-13"))

    def test_janela_domingo_vira_mes(self):
        self.assertEqual(geo.janela_domingo(date(2026, 9, 27))[1:], ("2026-09-28", "2026-10-04", "28 de setembro a 04 de outubro de 2026"))

    def test_janela_domingo_vira_ano(self):
        self.assertEqual(geo.janela_domingo(date(2026, 12, 27))[1:], ("2026-12-28", "2027-01-03", "28 de dezembro de 2026 a 03 de janeiro de 2027"))

    def test_validar_payload_rejeita_probabilidade_numerica(self):
        data = json.loads((geo.DATA_JSON).read_text(encoding="utf-8"))
        data["scenarios"][0]["probabilidade"] = 0.5
        self.assertTrue(any("probabilidade" in e for e in geo.validar_payload(data)))

    def test_validar_payload_rejeita_url_fora_do_dossie(self):
        data = json.loads(geo.DATA_JSON.read_text(encoding="utf-8"))
        self.assertTrue(geo.validar_payload(data, {"https://fonte-autorizada.example/"}))

    def test_validar_payload_aceita_edicao_atual(self):
        data = json.loads(geo.DATA_JSON.read_text(encoding="utf-8"))
        urls = {f["url"] for f in data["sources"]}
        self.assertEqual(geo.validar_payload(data, urls), [])

    def test_validar_payload_rejeita_week_incoerente(self):
        data = json.loads(geo.DATA_JSON.read_text(encoding="utf-8"))
        data["week"]["label"] = "14 a 20 de setembro de 2026"
        data["week"]["end"] = "2026-09-21"
        self.assertTrue(any("week" in e for e in geo.validar_payload(data)))

    def test_validar_payload_rejeita_generated_at_sem_timezone(self):
        data = json.loads(geo.DATA_JSON.read_text(encoding="utf-8"))
        data["generated_at"] = "2026-09-07T19:40:00"
        self.assertTrue(any("generated_at" in e for e in geo.validar_payload(data)))


if __name__ == "__main__":
    unittest.main()
