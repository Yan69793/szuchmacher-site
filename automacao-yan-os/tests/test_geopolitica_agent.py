import importlib.util
import json
import os
import unittest
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch


ARQUIVO = Path(__file__).parents[1] / "agents" / "geopolitica_agent.py"
spec = importlib.util.spec_from_file_location("geopolitica_agent", ARQUIVO)
geo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geo)

# Alias porque os stubs de requests usam `json=` como nome de parametro, que
# sombreia o modulo json dentro do corpo da funcao.
_DUMPS = json.dumps


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


class CadeiaDeProvedoresTests(unittest.TestCase):
    """P1-001 (16/09/2026): a conta OpenRouter desta maquina esta com credito
    zerado e devolve HTTP 402 antes de chegar ao modelo quando o max_tokens
    pedido nao cabe no saldo. A sintese nao pode depender de uma perna so."""

    ISO, INI, FIM, LABEL = "2026-W38", "2026-09-14", "2026-09-20", "14 a 20 de setembro de 2026"

    def _cadeia(self):
        return [
            {"id": "deepseek", "label": "DeepSeek", "url": "https://api.deepseek.com/chat/completions",
             "chave": "sk-deepseek-teste", "modelo": "deepseek-flash", "max_tokens": 8192},
            {"id": "openrouter", "label": "OpenRouter", "url": "https://openrouter.ai/api/v1/chat/completions",
             "chave": "sk-openrouter-teste", "modelo": "anthropic/claude-haiku-4-5", "max_tokens": 12000},
        ]

    def test_config_llm_prioriza_deepseek_quando_ha_chave(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "sk-ds", "GEOPOLITICA_LLM_PROVIDER": "auto"}):
            self.assertEqual([p["id"] for p in geo._config_llm()], ["deepseek", "openrouter"])

    def test_config_llm_sem_chave_deepseek_usa_openrouter(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "", "DEEPSEEK_KEY": "", "GEOPOLITICA_LLM_PROVIDER": "auto"}):
            self.assertEqual([p["id"] for p in geo._config_llm()], ["openrouter"])

    def test_config_llm_aceita_ordem_explicita(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "sk-ds", "GEOPOLITICA_LLM_PROVIDER": "openrouter,deepseek"}):
            self.assertEqual([p["id"] for p in geo._config_llm()], ["openrouter", "deepseek"])

    def test_post_llm_rebaixa_max_tokens_no_402_de_saldo(self):
        enviados = []

        class FakeRequests:
            @staticmethod
            def post(url, headers=None, json=None, timeout=None):
                enviados.append(json["max_tokens"])
                if len(enviados) == 1:
                    return FakeResp(402, '{"error":{"message":"You requested up to 8192 tokens, but can only afford 4096."}}')
                return FakeResp(200, {"choices": [{"message": {"content": '{"ok":true}'}}]})

        with patch.object(geo, "requests", FakeRequests):
            ok, saida = geo._post_llm(self._cadeia()[0], "prompt")

        self.assertTrue(ok)
        self.assertEqual(saida, '{"ok":true}')
        self.assertEqual(enviados, [8192, 4096], "o retry usa o N do corpo, nao constante nova")

    def test_sintetizar_cai_para_a_segunda_perna(self):
        class FakeRequests:
            @staticmethod
            def post(url, headers=None, json=None, timeout=None):
                if "deepseek" in url:
                    return FakeResp(402, '{"error":{"message":"Insufficient credits"}}')
                return FakeResp(200, {"choices": [{"message": {"content": _DUMPS({"schema_version": 1, "themes": []})}}]})

        with patch.object(geo, "requests", FakeRequests), patch.object(geo, "_config_llm", return_value=self._cadeia()):
            payload = geo.sintetizar([], [], (self.ISO, self.INI, self.FIM, self.LABEL))

        self.assertEqual(payload["week"]["iso"], self.ISO)
        self.assertEqual(payload["generated_at"][:4], str(datetime.now().year))

    def test_sintetizar_erro_nomeia_as_pernas_e_nao_vaza_chave(self):
        class FakeRequests:
            @staticmethod
            def post(url, headers=None, json=None, timeout=None):
                return FakeResp(402, '{"error":{"message":"Insufficient credits"}}')

        with patch.object(geo, "requests", FakeRequests), patch.object(geo, "_config_llm", return_value=self._cadeia()):
            with self.assertRaises(RuntimeError) as ctx:
                geo.sintetizar([], [], (self.ISO, self.INI, self.FIM, self.LABEL))

        msg = str(ctx.exception)
        self.assertIn("DeepSeek", msg)
        self.assertIn("OpenRouter", msg)
        self.assertNotIn("sk-deepseek-teste", msg)
        self.assertNotIn("sk-openrouter-teste", msg)

    def test_conteudo_vazio_nao_e_sucesso_na_perna(self):
        class FakeRequests:
            @staticmethod
            def post(url, headers=None, json=None, timeout=None):
                return FakeResp(200, {"choices": [{"finish_reason": "length", "message": {"content": ""}}],
                                      "usage": {"completion_tokens_details": {"reasoning_tokens": 8192}}})

        with patch.object(geo, "requests", FakeRequests):
            ok, motivo = geo._post_llm(self._cadeia()[0], "prompt")

        self.assertFalse(ok)
        self.assertIn("conteudo vazio", motivo)
        self.assertIn("reasoning_tokens", motivo)

    def test_conteudo_cortado_no_teto_nao_e_sucesso(self):
        class FakeRequests:
            @staticmethod
            def post(url, headers=None, json=None, timeout=None):
                return FakeResp(200, {"choices": [{"finish_reason": "length", "message": {"content": '{"a":1'}}],
                                      "usage": {"completion_tokens": 32768}})

        with patch.object(geo, "requests", FakeRequests):
            ok, motivo = geo._post_llm(self._cadeia()[0], "prompt")

        self.assertFalse(ok)
        self.assertIn("bateu no teto", motivo)

    def test_post_llm_nao_derruba_a_cascata_quando_a_rede_falha(self):
        class FakeRequests:
            @staticmethod
            def post(url, headers=None, json=None, timeout=None):
                raise OSError("dns temporariamente fora")

        with patch.object(geo, "requests", FakeRequests):
            ok, motivo = geo._post_llm(self._cadeia()[0], "prompt")

        self.assertFalse(ok)
        self.assertIn("indisponivel", motivo)


class FakeResp:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._payload = body
        self.text = body if isinstance(body, str) else json.dumps(body)

    def json(self):
        return json.loads(self._payload) if isinstance(self._payload, str) else self._payload


if __name__ == "__main__":
    unittest.main()
