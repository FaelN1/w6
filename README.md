Coletando informações do workspace# Documentação Técnica - Projeto AUREX

## 1. Visão Geral

AUREX é um assistente de agendamento de reuniões baseado em comandos de linguagem natural, capaz de processar instruções por texto ou voz. O sistema interpreta os comandos, extrai informações relevantes como nomes, datas e horários, e cria automaticamente eventos no Google Calendar com envio de e-mails de confirmação aos participantes.

## 2. Arquitetura do Sistema

O sistema segue uma arquitetura em camadas MVC (Model-View-Controller) modificada:

- **Frontend**: Interface HTML/JS básica para entrada de comandos de texto e voz
- **Backend**: Servidor Node.js/Express com as seguintes camadas:
  - **Controllers**: Gerenciam o fluxo de processamento dos comandos
  - **Services**: Implementam a lógica de negócio e integração com APIs externas
  - **Utils**: Utilitários para processamento de dados e manipulação de recursos

## 3. Componentes Principais

### 3.1 Serviço de Parser (parser.js)
- Interpreta comandos em linguagem natural usando OpenAI GPT-3.5
- Extrai informações estruturadas (nome, data, hora, assunto)
- Realiza normalizações e correções de datas

### 3.2 Serviço de Calendário (calendarService.js)
- Gerencia autenticação OAuth2 com Google API
- Cria eventos no Google Calendar
- Adiciona participantes e configura lembretes

### 3.3 Serviço de E-mail (emailService.js)
- Envia e-mails de confirmação usando Nodemailer
- Gera templates HTML para os e-mails
- Gerencia conexões SMTP

### 3.4 Serviço de Áudio (audioService.js)
- Processa arquivos de áudio recebidos
- Converte formatos usando FFmpeg
- Transcreve áudio para texto usando OpenAI Whisper API
- Implementa mecanismos de fallback para vários formatos de áudio

### 3.5 Serviço de Log (logService.js)
- Registra eventos em planilha Google Sheets
- Implementa armazenamento local de fallback
- Gerencia verificação e preparação da planilha

### 3.6 Controlador de Comandos (comandoController.js)
- Coordena o fluxo completo de processamento
- Orquestra os serviços de parser, calendário, email e log
- Gerencia tratamento de erros e fallbacks

### 3.7 Serviço de Síntese de Voz (speechService.js)
- Gera respostas faladas usando ElevenLabs Text-to-Speech
- Formata mensagens naturais a partir dos dados dos eventos
- Gerencia cache de arquivos de áudio temporários
- Suporta vozes em português brasileiro de alta qualidade

## 4. Fluxos de Processamento

### 4.1 Processamento de Comando de Texto
1. Recebe comando via API REST
2. Parser interpreta o comando usando OpenAI
3. Controlador coordena a criação do evento no calendário
4. E-mail de confirmação é enviado aos participantes
5. Evento é registrado no serviço de log
6. Uma resposta em áudio é gerada via ElevenLabs
7. O resultado é retornado ao cliente incluindo a URL do áudio

### 4.2 Processamento de Comando de Voz
1. Frontend captura áudio usando MediaRecorder API
2. Áudio é enviado para o backend via HTTP
3. Serviço de áudio processa e converte o arquivo
4. Áudio é transcrito para texto via OpenAI Whisper
5. O fluxo segue o mesmo processo do comando de texto
6. O áudio de resposta é reproduzido automaticamente no frontend

## 5. APIs e Integrações

- **OpenAI API**: Processamento de linguagem natural e transcrição de áudio
- **ElevenLabs API**: Síntese de voz natural para respostas faladas
- **Google Calendar API**: Criação e gerenciamento de eventos
- **Google OAuth2**: Autenticação e autorização
- **Nodemailer**: Envio de e-mails
- **Google Sheets API**: Registro de eventos

## 6. Processamento de Áudio

O sistema implementa um pipeline de processamento de áudio robusto:

1. Detecção automática do formato de áudio
2. Conversão para formatos otimizados (MP3 ou WAV)
3. Mecanismos de fallback para diferentes codecs
4. Tratamento de erros com retry automatizado
5. Uso do FFmpeg para conversão confiável

## 7. Gerenciamento de Credenciais

O sistema usa o arquivo .env para armazenar credenciais sensíveis:
- Chaves de API do Google (OAuth2)
- Tokens de refresh para autenticação persistente
- Credenciais SMTP para envio de e-mails
- Chave da API OpenAI
- Chave da API ElevenLabs

## 8. Utilitários de Desenvolvimento

- **getGoogleToken.js**: Ferramenta para gerar tokens de refresh OAuth2
- **audioTestUtil.js**: Utilitário para testar a transcrição de áudio localmente

## 9. Mecanismos de Fallback

O sistema implementa estratégias de fallback em vários níveis:
- Armazenamento local em JSON quando Google Sheets falha
- Múltiplas tentativas de processamento de áudio com diferentes formatos
- Valores padrão quando o parsing de comando falha

## 10. Requisitos de Implantação

- Node.js v14 ou superior
- Conta Google com APIs habilitadas
- Armazenamento para arquivos temporários de áudio
- Conexão à internet para acessar as APIs externas
- Conta ElevenLabs para síntese de voz

## 11. Considerações de Segurança

- Credenciais OAuth2 armazenadas em variáveis de ambiente
- Tokens de autenticação não são expostos ao frontend
- Tamanho limitado para uploads de arquivos de áudio
- Validação de dados de entrada antes do processamento