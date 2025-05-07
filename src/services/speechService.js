import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, '../../temp');

// Garantir que o diretório temp existe
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configurações da API ElevenLabs
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// ID da voz padrão da ElevenLabs (Rachel - voz feminina que funciona bem em português)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; 

/**
 * Gera áudio a partir do texto usando a API ElevenLabs
 * @param {string} texto - Texto a ser convertido em fala
 * @param {string} voiceId - ID da voz (opcional)
 * @returns {Promise<Object>} - Objeto com URL e duração do áudio
 */
export async function gerarFala(texto, voiceId = DEFAULT_VOICE_ID) {
  try {
    console.log(`🔊 Gerando áudio para: "${texto.substring(0, 50)}..."`);
    
    if (!ELEVENLABS_API_KEY) {
      throw new Error('Chave da API ElevenLabs não configurada');
    }
    
    // Limitar o tamanho do texto para evitar custos excessivos
    const textoLimitado = texto.length > 300 ? texto.substring(0, 300) + '...' : texto;
    
    // Preparar os parâmetros para a API
    const payload = {
      text: textoLimitado,
      model_id: 'eleven_multilingual_v2', // Modelo que suporta português
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0, // Neutro
        use_speaker_boost: true
      }
    };
    
    // Gerar um nome de arquivo único
    const timestamp = Date.now();
    const audioFileName = `speech_${timestamp}.mp3`;
    const outputPath = path.join(tempDir, audioFileName);
    
    // Fazer requisição para a API da ElevenLabs
    console.log('🔄 Enviando requisição para ElevenLabs API...');
    const response = await axios({
      method: 'post',
      url: `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
      data: payload,
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });
    
    // Salvar o arquivo de áudio
    fs.writeFileSync(outputPath, response.data);
    console.log(`✅ Áudio gerado e salvo em: ${outputPath}`);
    
    // Calcular duração aproximada (com base em palavras por minuto)
    const palavras = textoLimitado.split(' ').length;
    const duracaoEstimada = Math.ceil(palavras / 150 * 60); // 150 palavras por minuto
    
    return {
      url: `/audio/${audioFileName}`,
      caminho: outputPath,
      duracao: duracaoEstimada // em segundos
    };
  } catch (error) {
    console.error('❌ Erro ao gerar fala:', error.message);
    throw new Error(`Falha ao gerar áudio: ${error.message}`);
  }
}

/**
 * Formata uma mensagem de resposta para síntese de voz
 * @param {Object} dados - Dados do evento
 * @returns {string} - Texto formatado para síntese de voz
 */
export function formatarMensagemFala(dados) {
  const { nome, data, assunto } = dados;
  
  // Formatar a data para um formato mais natural
  const dataFormatada = new Date(data).toLocaleString('pt-BR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Criar uma mensagem natural para ser falada
  return `Sua reunião com ${nome} foi agendada com sucesso para ${dataFormatada}. 
          O assunto é: ${assunto}. O evento foi adicionado ao seu Google Calendar 
          e um e-mail de confirmação foi enviado.`;
}
