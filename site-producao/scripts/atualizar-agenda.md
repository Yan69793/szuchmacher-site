# Rotina semanal — Agenda macro szuchmacher.com.br

Execute esta rotina toda segunda-feira às 08:30 BRT (após a abertura do Focus).

## Objetivo
Atualizar o calendário macroeconômico dos da semana corrente (PT + EN) e publicá-lo no servidor.

## Instruções

1. Calcule a janela: inicio = segunda-feira da semana corrente, fim = domingo da semana corrente (formato YYYY-MM-DD).

2. Pesquise (WebSearch) o calendário programado para essa janela em fontes oficiais:
   - Brasil: BCB (bcb.gov.br/calendariodivulgacao), IBGE (ibge.gov.br/calendario), S&P Global PMI Brasil
   - EUA: BLS (bls.gov/schedule), ISM (ismworld.org), S&P Global PMI, Census Bureau, DoL
   - Inclua apenas eventos com data e fonte confirmadas. Nunca antecipe resultado.
   - Boletim Focus = toda segunda às 08:25 BRT.

3. Leia as credenciais de deploy em:
   E:\Diretorio\Claude\Site\site-producao\.env   (chaves FTP_HOST, FTP_USER, FTP_PASS)

4. Leia o template em:
   E:\Diretorio\Claude\Site\site-producao\agenda-server.php
   Siga o formato exato (array PHP, campos: data, hora_brt, regiao, evento, evento_en, descricao, descricao_en, fonte, relevancia).

5. Reescreva o agenda-server.php com a nova janela e eventos bilíngues. Atualize meta.version para hoje.

6. Faça backup do arquivo vivo, upload da nova versão e valide na URL pública.
   Sempre use TLS verificado (--ssl-reqd). Nunca use -k.
   Capure status HTTP com -o NUL -w "%{http_code}".
   Se a validação falhar, restaure o backup.

   ATENÇÃO — caminho FTP correto (sem public_html):
     backup:  curl --ssl-reqd -s -o agenda-backup-live.php --user "USER:PASS" "ftp://HOST/assets/agenda.php"
     upload:  curl --ssl-reqd -T agenda-server.php --user "USER:PASS" "ftp://HOST/assets/agenda.php"
     validar: curl -s "https://szuchmacher.com.br/assets/agenda.php" -o NUL -w "%{http_code}"

7. Reporte: janela, número de eventos, evento de maior relevância, status de cada passo.
