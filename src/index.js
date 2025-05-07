import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { processarComando } from './controllers/comandoController.js';
import { processarAudio } from './services/audioService.js';
import { verificarEPrepararPlanilha } from './services/logService.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fileUpload from 'express-fileupload';

// Carrega variáveis de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Cria um servidor HTTP
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // limite de 10MB
  abortOnLimit: true,
  createParentPath: true
}));
app.use(express.static(path.join(__dirname, '../public')));

// Adicionar rota para arquivos de áudio temporários
app.use('/audio', express.static(path.join(__dirname, '../temp')));

// Rota principal para receber comandos de texto
app.post('/comando', async (req, res) => {
  try {
    const { comando } = req.body;
    
    if (!comando) {
      return res.status(400).json({ error: 'Comando não fornecido' });
    }
    
    console.log(`📝 Comando recebido: "${comando}"`);
    
    const resultado = await processarComando(comando);
    res.status(200).json(resultado);
  } catch (error) {
    console.error('❌ Erro ao processar comando:', error.message);
    res.status(500).json({ error: 'Erro ao processar comando', detalhes: error.message });
  }
});

// Nova rota para processamento de áudio via HTTP
app.post('/processar-audio', async (req, res) => {
  try {
    if (!req.files || !req.files.audio) {
      return res.status(400).json({ 
        tipo: 'erro',
        mensagem: 'Nenhum arquivo de áudio enviado' 
      });
    }
    
    const audioFile = req.files.audio;
    const audioBuffer = audioFile.data;
    const fileSize = Math.round(audioBuffer.length / 1024);
    
    console.log(`🎤 Áudio recebido via HTTP: ${fileSize} KB`);
    
    // Validar tamanho mínimo do arquivo
    if (audioBuffer.length < 1024) {
      console.warn('⚠️ Áudio muito pequeno, possivelmente inválido');
      return res.status(400).json({
        tipo: 'erro',
        mensagem: 'O áudio enviado é muito curto ou vazio'
      });
    }
    
    // Processar o áudio recebido
    console.log('🔄 Enviando áudio para transcrição...');
    let texto;
    try {
      texto = await processarAudio(audioBuffer);
      console.log(`🎯 Áudio transcrito: "${texto}"`);
      
      // Se o texto resultante for muito curto (menos de 5 caracteres), pode ser um erro
      if (texto && texto.trim().length < 5) {
        console.warn(`⚠️ Transcrição muito curta: "${texto}". Considerando como falha.`);
        return res.status(400).json({
          tipo: 'erro',
          mensagem: 'Transcrição muito curta, possível erro na extração de áudio.'
        });
      }
    } catch (transcriptError) {
      console.error('❌ Erro na transcrição:', transcriptError);
      return res.status(500).json({
        tipo: 'erro',
        mensagem: `Erro ao processar áudio: ${transcriptError.message}`
      });
    }
    
    if (!texto || texto.trim() === '') {
      return res.status(400).json({
        tipo: 'erro',
        mensagem: 'A transcrição não retornou texto'
      });
    }
    
    // Processar comando
    console.log('🔄 Processando comando transcrito...');
    const resultado = await processarComando(texto);
    console.log('✅ Comando processado com sucesso');
    
    // Enviar resposta
    res.status(200).json({
      tipo: 'resultado',
      texto: texto,
      resultado: resultado
    });
    console.log('📤 Resultado enviado ao cliente');
    
  } catch (error) {
    console.error('❌ Erro ao processar áudio:', error);
    res.status(500).json({
      tipo: 'erro',
      mensagem: `Erro no processamento: ${error.message}`
    });
  }
});

// Rota de saúde para verificar se o servidor está online
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Rota para a página principal com interface de usuário
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Função para inicialização do aplicativo
async function iniciarApp() {
  try {
    // Verificar se a planilha existe e está configurada corretamente
    console.log('🔄 Verificando configuração da planilha...');
    await verificarEPrepararPlanilha();
    
    // Inicia o servidor HTTP
    server.listen(PORT, () => {
      console.log(`🚀 Servidor AUREX rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar aplicação:', error);
    process.exit(1);
  }
}

// Iniciar o aplicativo
iniciarApp();
