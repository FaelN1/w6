import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

dotenv.config();

// Configuração de caminhos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, '../../temp');

// Garantir que o diretório temp existe
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`📁 Diretório temporário criado: ${tempDir}`);
}

// Configuração do FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
console.log(`🛠️ FFmpeg configurado: ${ffmpegPath}`);

// Configuração da API OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Formatos suportados pela API Whisper
const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];

/**
 * Converte um buffer de áudio para texto usando a API Whisper
 * @param {Buffer} audioBuffer - Buffer contendo os dados do áudio
 * @returns {Promise<string>} - Texto transcrito do áudio
 */
export async function processarAudio(audioBuffer) {
  // Array para rastrear arquivos temporários para limpeza
  const tempFiles = [];
  
  try {
    console.log(`🎤 Iniciando processamento de áudio: ${Math.round(audioBuffer.length / 1024)} KB`);
    
    // Verificar se o audioBuffer é válido
    if (!audioBuffer || audioBuffer.length < 1000) {
      throw new Error('Buffer de áudio muito pequeno ou inválido');
    }
    
    // Identificar formato e extrair dados de áudio
    const { detectedFormat, processedBuffer } = detectAudioFormat(audioBuffer);
    
    // Salvar o buffer processado em um arquivo temporário
    const rawPath = path.join(tempDir, `raw_audio_${Date.now()}.${detectedFormat !== 'unknown' ? detectedFormat : 'bin'}`);
    fs.writeFileSync(rawPath, processedBuffer);
    tempFiles.push(rawPath);
    console.log(`💾 Arquivo de áudio bruto salvo em: ${rawPath}`);
    
    // Determinar a melhor estratégia de conversão com base no formato detectado
    let audioFile;
    let transcriptionFailed = false;
    
    // Tentar realizar conversões em ordem de prioridade
    try {
      const { file, failed } = await convertAudio(rawPath, detectedFormat, tempFiles);
      audioFile = file;
      transcriptionFailed = failed;
    } catch (conversionError) {
      console.error('❌ Falha em todas as tentativas de conversão:', conversionError.message);
      throw new Error(`Não foi possível processar o áudio: ${conversionError.message}`);
    }
    
    // Transcrever áudio
    const transcription = await transcribeAudio(audioFile, transcriptionFailed);
    
    return transcription;
    
  } catch (error) {
    console.error('❌ Erro ao processar áudio:', error);
    throw new Error(`Falha ao processar áudio: ${error.message}`);
  } finally {
    // Garantir que os arquivos temporários sejam removidos
    cleanupTempFiles(tempFiles);
  }
}

/**
 * Detecta o formato de áudio e extrai os dados do buffer
 * @param {Buffer} audioBuffer - Buffer contendo os dados do áudio
 * @returns {Object} - Objeto com o formato detectado e o buffer processado
 */
function detectAudioFormat(audioBuffer) {
  // Identifica o tipo de arquivo analisando os primeiros bytes
  const fileSignature = audioBuffer.slice(0, 4).toString('hex');
  console.log(`🔍 Assinatura do arquivo: ${fileSignature}`);
  
  let detectedFormat = 'unknown';
  let processedBuffer = audioBuffer;
  
  // Detecção por assinatura de bytes
  if (fileSignature.startsWith('1a45')) {
    detectedFormat = 'webm';
  } else if (fileSignature.startsWith('4949') || fileSignature.startsWith('4d4d')) {
    detectedFormat = 'wav';
  } else if (fileSignature.startsWith('494433') || fileSignature.startsWith('fffb')) {
    detectedFormat = 'mp3';
  } else if (fileSignature.startsWith('4f676753')) {
    detectedFormat = 'ogg';
  } else if (fileSignature.startsWith('7b22')) {
    // Possível JSON - tentar extrair dados de áudio
    console.log('🔍 Detectado formato JSON. Tentando extrair dados de áudio...');
    try {
      const jsonString = audioBuffer.toString('utf-8');
      let jsonData;
      
      try {
        jsonData = JSON.parse(jsonString);
        console.log('✅ JSON válido detectado');
        
        // Extrair dados de áudio de campos comuns
        if (jsonData.audio) {
          processedBuffer = Buffer.from(jsonData.audio, 'base64');
          console.log('🔍 Campo "audio" encontrado no JSON');
        } else if (jsonData.data) {
          processedBuffer = Buffer.from(jsonData.data, 'base64');
          console.log('🔍 Campo "data" encontrado no JSON');
        } else if (jsonData.audioData) {
          processedBuffer = Buffer.from(jsonData.audioData, 'base64');
          console.log('🔍 Campo "audioData" encontrado no JSON');
        }
      } catch (jsonError) {
        // Tentar encontrar dados em formato base64
        const base64Match = jsonString.match(/"data":"([^"]+)"/);
        if (base64Match && base64Match[1]) {
          console.log('✅ Dados em formato Base64 encontrados no JSON');
          processedBuffer = Buffer.from(base64Match[1], 'base64');
        }
      }
      
      console.log(`📊 Buffer de áudio extraído do JSON: ${Math.round(processedBuffer.length / 1024)} KB`);
      
      // Re-detectar o formato após extrair do JSON
      const processedSignature = processedBuffer.slice(0, 4).toString('hex');
      if (processedSignature.startsWith('1a45')) {
        detectedFormat = 'webm';
      } else if (processedSignature.startsWith('4949') || processedSignature.startsWith('4d4d')) {
        detectedFormat = 'wav';
      } else if (processedSignature.startsWith('494433') || processedSignature.startsWith('fffb')) {
        detectedFormat = 'mp3';
      } else if (processedSignature.startsWith('4f676753')) {
        detectedFormat = 'ogg';
      }
      
    } catch (err) {
      console.warn('⚠️ Erro ao processar possível JSON:', err.message);
    }
  }
  
  // Verificar detecção por conteúdo se a assinatura não foi reconhecida
  if (detectedFormat === 'unknown') {
    if (processedBuffer.includes(Buffer.from('ftyp'))) {
      detectedFormat = 'mp4';
      console.log('🔍 Formato identificado como mp4 pelo conteúdo.');
    } else if (processedBuffer.includes(Buffer.from('OggS'))) {
      detectedFormat = 'ogg';
      console.log('🔍 Formato identificado como ogg pelo conteúdo.');
    }
  }
  
  console.log(`🔍 Formato de áudio detectado: ${detectedFormat}`);
  return { detectedFormat, processedBuffer };
}

/**
 * Converte o áudio para formatos compatíveis com a API Whisper
 * @param {string} rawPath - Caminho para o arquivo de áudio bruto
 * @param {string} detectedFormat - Formato detectado do áudio
 * @param {string[]} tempFiles - Lista para rastrear arquivos temporários
 * @returns {Promise<Object>} - Objeto com o arquivo de áudio e status de falha
 */
async function convertAudio(rawPath, detectedFormat, tempFiles) {
  const mp3Path = path.join(tempDir, `audio_${Date.now()}.mp3`);
  const wavPath = path.join(tempDir, `audio_${Date.now()}.wav`);
  
  tempFiles.push(mp3Path, wavPath);
  
  console.log('🔄 Tentando converter para formatos otimizados para transcrição...');
  
  // Estratégia baseada no formato detectado
  if (supportedFormats.includes(detectedFormat)) {
    console.log(`✅ Formato ${detectedFormat} já é suportado pela API Whisper`);
    return { file: fs.createReadStream(rawPath), failed: false };
  }
  
  // Tentar MP3 primeiro (geralmente melhor para Whisper)
  try {
    await convertWithFallbacks(
      rawPath, 
      mp3Path, 
      ['s16le', detectedFormat, 'wav', 'auto']
    );
    
    const mp3Stats = fs.statSync(mp3Path);
    console.log(`📊 Arquivo MP3 criado: ${Math.round(mp3Stats.size / 1024)} KB`);
    
    if (mp3Stats.size >= 1000) {
      return { file: fs.createReadStream(mp3Path), failed: mp3Stats.size < 10000 };
    }
    throw new Error('Arquivo MP3 muito pequeno ou inválido');
  } catch (mp3Error) {
    console.log(`🔄 Conversão para MP3 falhou: ${mp3Error.message}`);
    
    // Tentar WAV como alternativa
    try {
      await convertWithFallbacks(
        rawPath,
        wavPath,
        ['s16le', detectedFormat, 'auto'],
        {
          outputOptions: [
            '-acodec pcm_s16le',
            '-ar 16000',
            '-ac 1'
          ]
        }
      );
      
      const wavStats = fs.statSync(wavPath);
      console.log(`📊 Arquivo WAV criado: ${Math.round(wavStats.size / 1024)} KB`);
      
      if (wavStats.size >= 1000) {
        return { file: fs.createReadStream(wavPath), failed: wavStats.size < 10000 };
      }
      throw new Error('Arquivo WAV muito pequeno ou inválido');
    } catch (wavError) {
      // Usar abordagem de último recurso
      return await createFallbackAudio(rawPath, tempFiles);
    }
  }
}

/**
 * Cria áudio de fallback quando todas as conversões normais falham
 * @param {string} rawPath - Caminho para o arquivo bruto
 * @param {string[]} tempFiles - Lista para rastrear arquivos temporários
 * @returns {Promise<Object>} - Objeto com o arquivo de áudio e status de falha
 */
async function createFallbackAudio(rawPath, tempFiles) {
  console.log('🔄 Todas as conversões falharam, tentando métodos de último recurso...');
  
  const forceWavPath = path.join(tempDir, `force_wav_${Date.now()}.wav`);
  tempFiles.push(forceWavPath);
  
  try {
    // Ler o buffer original
    const rawBuffer = fs.readFileSync(rawPath);
    
    // Tentar criar um WAV válido
    await createValidWaveFile(rawBuffer, forceWavPath);
    
    if (fs.existsSync(forceWavPath) && fs.statSync(forceWavPath).size > 1000) {
      console.log('✅ Arquivo WAV forçado criado com sucesso');
      return { file: fs.createReadStream(forceWavPath), failed: false };
    }
  } catch (wavError) {
    console.warn('⚠️ Falha ao criar WAV forçado:', wavError.message);
  }
  
  // Último recurso: criar um MP3 vazio válido
  const emptyValidPath = path.join(tempDir, `empty_valid_${Date.now()}.mp3`);
  tempFiles.push(emptyValidPath);
  
  try {
    // Tentar criar um MP3 vazio usando FFmpeg
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input('anullsrc')
        .inputFormat('lavfi')
        .inputOptions(['-t 1'])
        .outputOptions([
          '-acodec libmp3lame',
          '-ab 8k'
        ])
        .output(emptyValidPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  } catch (error) {
    // Fallback para um MP3 vazio estático
    const placeholder = Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADxAC2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2AAAAA//tAxAAAAsUJvdQQAAtCZG+3hCAAkIIggCCMAYBgCAIBAMWH8f/+EP8fniB+H8fzB8HwQx+H54PiOH+dgEYfniCD4gGD5/B8HxAMHznBiBAP5/lAhwf4PnED//nx/UCAIfnznHBDPEB/OHEH/pTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==', 'base64');
    fs.writeFileSync(emptyValidPath, placeholder);
  }
  
  console.log('⚠️ Usando arquivo MP3 vazio como último recurso');
  return { file: fs.createReadStream(emptyValidPath), failed: true };
}

/**
 * Transcreve o arquivo de áudio usando a API Whisper
 * @param {ReadStream} audioFile - Stream do arquivo de áudio a ser transcrito
 * @param {boolean} transcriptionFailed - Indica se houve falha anterior
 * @returns {Promise<string>} - Texto transcrito
 */
async function transcribeAudio(audioFile, transcriptionFailed) {
  console.log('🔄 Transcrevendo áudio com API Whisper...', audioFile.path);
  
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    language: "pt",
    response_format: "text",
    temperature: transcriptionFailed ? 0.2 : 0,
    prompt: "Este é um comando de agendamento em português brasileiro. Pode conter nomes e datas."
  });
  
  console.log(`✅ Transcrição concluída: "${transcription}"`);
  
  // Se a transcrição for muito curta, tentar novamente com parâmetros diferentes
  if (transcription.length < 10 && !transcriptionFailed) {
    console.log('⚠️ Transcrição muito curta, tentando novamente com parâmetros alternativos...');
    
    const retryTranscription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "pt",
      response_format: "text",
      temperature: 0.3,
      prompt: "Este é um comando para agendar uma reunião. Pode incluir nome da pessoa, data e hora."
    });
    
    console.log(`✅ Segunda transcrição concluída: "${retryTranscription}"`);
    
    if (retryTranscription.length > transcription.length) {
      console.log('✅ Segunda transcrição é mais completa, usando esta versão');
      return retryTranscription;
    }
  }
  
  return transcription;
}

/**
 * Tenta converter o arquivo usando diferentes formatos de entrada
 * @param {string} inputPath - Caminho do arquivo de entrada
 * @param {string} outputPath - Caminho do arquivo de saída
 * @param {string[]} formatsToTry - Formatos de entrada para tentar
 * @param {Object} options - Opções adicionais para FFmpeg
 */
async function convertWithFallbacks(inputPath, outputPath, formatsToTry, options = {}) {
  let success = false;
  let lastError = null;
  
  // Tenta cada formato até ter sucesso
  for (const format of formatsToTry) {
    try {
      console.log(`🔄 Tentando converter como ${format}...`);
      await new Promise((resolve, reject) => {
        let command = ffmpeg().input(inputPath);
        
        if (format !== 'auto') {
          command = command.inputFormat(format);
        }
        
        // Aplicar opções de saída se fornecidas
        if (options.outputOptions) {
          command = command.outputOptions(options.outputOptions);
        } else {
          // Padrões para MP3
          command = command.outputOptions([
            '-ab 128k',
            '-ar 44100',
            '-ac 1'
          ]);
        }
        
        command
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log(`🛠️ Comando FFmpeg: ${commandLine}`);
          })
          .on('end', () => {
            console.log(`✅ Conversão como ${format} concluída`);
            success = true;
            resolve();
          })
          .on('error', (err) => {
            console.warn(`⚠️ Falha ao converter como ${format}: ${err.message}`);
            lastError = err;
            reject(err);
          })
          .run();
      });
      
      // Se a conversão for bem-sucedida, interrompe o loop
      if (success) break;
    } catch (err) {
      // Continua tentando o próximo formato
      console.log(`⚠️ Formato ${format} falhou, tentando próximo...`);
    }
  }
  
  if (!success) {
    throw new Error(`Nenhum formato funcionou para conversão: ${lastError?.message || 'Motivo desconhecido'}`);
  }
}

/**
 * Limpa os arquivos temporários criados durante o processo
 * @param {string[]} filePaths - Lista de caminhos para arquivos a serem removidos
 */
function cleanupTempFiles(filePaths) {
  if (!filePaths || !filePaths.length) return;
  
  console.log(`🧹 Limpando ${filePaths.length} arquivos temporários`);
  
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn(`⚠️ Não foi possível remover arquivo temporário ${filePath}: ${err.message}`);
    }
  }
}

/**
 * Cria um arquivo WAV válido a partir de um buffer de áudio
 * @param {Buffer} audioBuffer - Buffer contendo os dados do áudio
 * @param {string} outputPath - Caminho do arquivo de saída
 */
async function createValidWaveFile(audioBuffer, outputPath) {
  // Cria um cabeçalho WAV básico
  const wavHeader = Buffer.alloc(44);
  
  // "RIFF"
  wavHeader.write('RIFF', 0);
  // Tamanho do arquivo (menos 8 bytes para RIFF e tamanho)
  wavHeader.writeUInt32LE(36 + audioBuffer.length, 4);
  // "WAVE"
  wavHeader.write('WAVE', 8);
  // "fmt "
  wavHeader.write('fmt ', 12);
  // Tamanho do bloco fmt (16)
  wavHeader.writeUInt32LE(16, 16);
  // Formato de áudio (1 = PCM)
  wavHeader.writeUInt16LE(1, 20);
  // Número de canais (1 = mono)
  wavHeader.writeUInt16LE(1, 22);
  // Taxa de amostragem (44100 Hz)
  wavHeader.writeUInt32LE(44100, 24);
  // Bytes por segundo (44100 * 2)
  wavHeader.writeUInt32LE(44100 * 2, 28);
  // Bytes por amostra * canais (2 * 1)
  wavHeader.writeUInt16LE(2, 32);
  // Bits por amostra (16)
  wavHeader.writeUInt16LE(16, 34);
  // "data"
  wavHeader.write('data', 36);
  // Tamanho dos dados
  wavHeader.writeUInt32LE(audioBuffer.length, 40);
  
  // Escrever o arquivo WAV
  const fd = fs.openSync(outputPath, 'w');
  fs.writeSync(fd, wavHeader);
  fs.writeSync(fd, audioBuffer);
  fs.closeSync(fd);
}