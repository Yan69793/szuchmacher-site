# YAN OS — GUIA DE INSTALAÇÃO E CONFIGURAÇÃO

**Versão 2.0 | Março 2026**

Este guia cobre exclusivamente as etapas que exigem sua intervenção manual.
O sistema já está configurado com todos os dados do servidor HostGator.

---

## RESUMO DO QUE JÁ FOI FEITO AUTOMATICAMENTE

| Módulo | Status |
|--------|--------|
| `data/config.py` | ✓ Servidor pré-configurado ([USER-FTP-YAN-OS], IP, diretório) |
| `data/populador.py` | ✓ Popula PPTX com dados e narrativa |
| `data/atualizador_site.py` | ✓ Atualiza index.html + macro_data.json + PDF via FTP |
| `monitor_mercado.py` | ✓ Alertas intradiários com Qwen |
| `qualificador_leads.py` | ✓ Qualificação automática de leads |
| `testar_sistema.py` | ✓ Suite de testes para todos os componentes |
| `.env` | ✓ Pré-preenchido com dados do servidor |

---

## ETAPAS MANUAIS NECESSÁRIAS

### ETAPA 1 — Instalar dependências Python

Abra o PowerShell **na pasta do projeto** e execute:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Por que manual:** requer Python instalado na sua máquina e acesso ao PowerShell.

---

### ETAPA 2 — Preencher a senha do FTP no arquivo `.env`

Abra o arquivo `.env` com o Bloco de Notas (ou qualquer editor) e substitua:

```
SITE_PASS=<<PREENCHER: sua senha do cPanel/FTP>>
```

Por:

```
SITE_PASS=SUA_SENHA_AQUI
```

**Onde encontrar:** é a mesma senha que você usa para entrar no cPanel da HostGator
(cliente.hostgator.com.br → Hospedagens e Servidores → cPanel).

**Por que manual:** senhas não podem ser preenchidas automaticamente por segurança.

---

### ETAPA 3 — Obter e configurar a API Key do Claude (Anthropic)

1. Acesse: https://console.anthropic.com/
2. Faça login com sua conta
3. Vá em **API Keys** → **Create Key**
4. Copie a chave (começa com `sk-ant-`)
5. No arquivo `.env`, substitua:
   ```
   ANTHROPIC_API_KEY=<<PREENCHER: sk-ant-...>>
   ```
   Por:
   ```
   ANTHROPIC_API_KEY=sk-ant-SUA_CHAVE_AQUI
   ```

**Por que manual:** chaves de API são credenciais pessoais intransferíveis.

---

### ETAPA 4 — Configurar notificações via Telegram (RECOMENDADO)

O Telegram é o canal mais confiável: gratuito, sem limite de mensagens, sem cadastro de número.

**Passo 4.1 — Criar o Bot:**
1. Abra o Telegram no celular ou computador
2. Busque por `@BotFather` e inicie uma conversa
3. Envie o comando: `/newbot`
4. Escolha um nome para o bot (ex: `YanOS Alertas`)
5. Escolha um username (ex: `yanos_yan_bot`)
6. O BotFather vai te enviar o **token** no formato: `1234567890:AAFxxxxxx`
7. Copie esse token

**Passo 4.2 — Descobrir seu Chat ID:**
1. Busque por `@userinfobot` no Telegram
2. Inicie uma conversa (clique em Start)
3. O bot responde automaticamente com seu **Id** (um número como `123456789`)
4. Copie esse número

**Passo 4.3 — Preencher no `.env`:**
```
TELEGRAM_BOT_TOKEN=1234567890:AAFxxxxxx
TELEGRAM_CHAT_ID=123456789
```

**Passo 4.4 — Testar:**
```powershell
.\venv\Scripts\Activate.ps1
python testar_sistema.py telegram
```
Você vai receber uma mensagem de teste no Telegram confirmando que está funcionando.

**Por que manual:** criação de bots requer interação com a plataforma Telegram.

---

### ETAPA 5 — Configurar WhatsApp via CallMeBot (ALTERNATIVO ao Telegram)

Se preferir receber alertas no WhatsApp:

1. Salve o número **+34 644 55 15 51** na sua agenda
2. Envie a mensagem: `I allow callmebot to send me messages`
3. Você vai receber uma resposta com seu **API Key** (ex: `123456`)
4. No `.env`, preencha:
   ```
   CALLMEBOT_PHONE=5521981088992
   CALLMEBOT_APIKEY=123456
   ```
   (substitua o telefone pelo seu número com DDD e código do país, sem +)

**Por que manual:** a ativação do CallMeBot requer envio de mensagem pelo WhatsApp pessoal.

---

### ETAPA 6 — Obter e configurar a API Key do Qwen (OPCIONAL)

O Qwen é necessário para o monitor de mercado e qualificador de leads.
Se não configurar, esses módulos funcionam com análise simplificada (sem IA).

1. Acesse: https://dashscope.aliyuncs.com/
2. Crie uma conta (gratuito: 1 milhão de tokens/mês)
3. Vá em **API Keys** → crie uma nova chave
4. No `.env`, substitua:
   ```
   QWEN_API_KEY=<<PREENCHER: sk-...>>
   ```
   Por:
   ```
   QWEN_API_KEY=sk-SUA_CHAVE_AQUI
   ```

**Por que manual:** registro em plataforma externa.

---

### ETAPA 7 — Copiar o template PPTX

1. Localize seu arquivo `Fechamento_de_Mercado_2.pptx` (o template base)
2. Copie para a pasta do projeto:
   ```
   yan_os/template/Fechamento_template.pptx
   ```
   *(renomeie exatamente para `Fechamento_template.pptx`)*

**Por que manual:** o arquivo PPTX é seu template proprietário e não pode ser incluído automaticamente.

**DICA:** Para ver o mapa completo do template (quais shapes têm quais textos), execute:
```powershell
.\venv\Scripts\Activate.ps1
python main.py --diagnostico-template
```
Isso imprime posição e conteúdo de cada elemento do PPTX, útil para ajustar o populador.

---

### ETAPA 8 — Definir variáveis de ambiente no Windows (para Task Scheduler)

Para que o briefing rode automaticamente via Windows Task Scheduler, as chaves API precisam estar nas variáveis de **sistema** (não de usuário).

1. Clique com o botão direito em **"Este PC"** → Propriedades
2. Clique em **"Configurações avançadas do sistema"**
3. Clique em **"Variáveis de Ambiente"**
4. Na seção **"Variáveis do sistema"** (não de usuário), clique em **"Novo"** para cada uma:

   | Nome | Valor |
   |------|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-...` |
   | `QWEN_API_KEY` | `sk-...` (se configurado) |
   | `SITE_PASS` | sua senha FTP |
   | `TELEGRAM_BOT_TOKEN` | `123456789:AAF...` |
   | `TELEGRAM_CHAT_ID` | `123456789` |

5. Clique OK em todas as janelas
6. **Reinicie o PowerShell** para carregar as novas variáveis

**Por que manual:** configuração de variáveis de sistema requer permissão de administrador e interação com o painel do Windows.

---

### ETAPA 9 — Instalar o agendamento automático (Task Scheduler)

1. Abra o PowerShell **como Administrador** (botão direito → "Executar como administrador")
2. Navegue até a pasta do projeto
3. Execute:
   ```powershell
   .\venv\Scripts\Activate.ps1
   python main.py --instalar --hora 18:30
   .\instalar_agendamento.ps1
   ```

Isso cria uma tarefa chamada `YanOS_Briefing` que roda todo dia às 18:30.

**Por que manual:** instalação de tarefas agendadas requer privilégios de administrador.

---

### ETAPA 10 — Primeiro teste completo do pipeline

Após configurar tudo, rode o diagnóstico:

```powershell
.\venv\Scripts\Activate.ps1
python testar_sistema.py
```

Resultado esperado: todos os itens com ✓ (exceto os módulos que você optou por não configurar, que aparecerão com ○).

Depois, rode o primeiro briefing manualmente para ver tudo funcionando:

```powershell
python main.py --manual
```

Isso vai:
1. Pedir os dados de mercado via teclado
2. Gerar a narrativa com Claude
3. Gerar o PPTX
4. Publicar no site via FTP
5. Atualizar index.html, macro_data.json

---

## REFERÊNCIA RÁPIDA DE COMANDOS

```powershell
# Ativar ambiente (sempre primeiro)
.\venv\Scripts\Activate.ps1

# Briefing completo (modo padrão diário)
python main.py

# Briefing com dados manuais (quando TradingView não estiver disponível)
python main.py --manual

# Só narrativa (reutiliza dados já coletados)
python main.py --so-narrativa

# Sem publicar no site (só PPTX)
python main.py --sem-site

# Diagnóstico completo do sistema
python testar_sistema.py

# Testar só FTP
python testar_sistema.py ftp

# Testar só Telegram
python testar_sistema.py telegram

# Ver mapa do template PPTX
python main.py --diagnostico-template

# Iniciar monitor de mercado (roda durante o pregão)
python monitor_mercado.py

# Testar alertas de mercado
python monitor_mercado.py --testar

# Qualificar lead manualmente
python qualificador_leads.py --manual

# Testar qualificador de leads
python qualificador_leads.py --testar

# Ver configuração atual
python data/config.py
```

---

## ESTRUTURA FINAL DO PROJETO

```
yan_os/
├── .env                    ← suas credenciais (nunca compartilhe)
├── main.py                 ← orquestrador principal
├── monitor_mercado.py      ← alertas intradiários
├── qualificador_leads.py   ← qualificação de leads
├── testar_sistema.py       ← suite de testes
├── requirements.txt        ← dependências Python
├── instalar_agendamento.ps1 ← gerado pelo main.py --instalar
│
├── data/
│   ├── config.py           ← configuração centralizada
│   ├── coletor.py          ← coleta de dados de mercado
│   ├── gerador.py          ← narrativa via Claude
│   ├── populador.py        ← geração do PPTX
│   ├── atualizador_site.py ← publicação nos sites
│   └── ultimo_dados.json   ← dados do último pregão (gerado automaticamente)
│
├── template/
│   └── Fechamento_template.pptx  ← ← ← VOCÊ COLOCA AQUI (ETAPA 7)
│
├── output/
│   ├── Fechamento_Mirabaud_YYYYMMDD.pptx  ← gerado diariamente
│   └── site_data/          ← JSONs locais (modo local)
│
└── logs/
    ├── yan_os.log          ← log geral
    └── atualizador.log     ← log de publicação nos sites
```

---

## PROBLEMAS COMUNS

**"ANTHROPIC_API_KEY não encontrada"**
→ Verifique se o `.env` está na raiz do projeto e se a chave está correta.

**"Template não encontrado"**
→ Copie o PPTX para `template/Fechamento_template.pptx` (Etapa 7).

**"FTP conexão recusada"**
→ Verifique SITE_PASS no `.env`. A senha é a mesma do cPanel da HostGator.

**"Telegram: Unauthorized"**
→ O BOT_TOKEN está incorreto. Verifique no BotFather com o comando `/mybots`.

**"Telegram: chat not found"**
→ O CHAT_ID está incorreto. Use @userinfobot para obter o correto.

**PPTX gerado mas textos não aparecem nos slides corretos**
→ Execute `python main.py --diagnostico-template` e veja o mapa de shapes.
→ O populador substitui placeholders no formato `{{CHAVE}}`. Abra o PPTX,
   adicione `{{IBOVESPA_PONTOS}}` no slide correto, e o sistema preencherá automaticamente.

---

## SUPORTE

Em caso de dúvidas, abra uma nova conversa e descreva:
1. Qual etapa está executando
2. A mensagem de erro exata
3. O resultado de `python testar_sistema.py`
