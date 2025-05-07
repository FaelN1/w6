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

/**
 * Converte um buffer de áudio para texto usando a API Whisper
 * @param {Buffer} audioBuffer - Buffer contendo os dados do áudio
 * @returns {Promise<string>} - Texto transcrito do áudio
 */
export async function processarAudio(audioBuffer) {
  try {
    console.log(`🎤 Iniciando processamento de áudio: ${Math.round(audioBuffer.length / 1024)} KB`);
    
    // Verificar se o audioBuffer é válido
    if (!audioBuffer || audioBuffer.length < 1000) {
      throw new Error('Buffer de áudio muito pequeno ou inválido');
    }
    
    // Identifica o tipo de arquivo analisando os primeiros bytes
    const fileSignature = audioBuffer.slice(0, 4).toString('hex');
    console.log(`🔍 Assinatura do arquivo: ${fileSignature}`);
    
    // Determinar tipo de arquivo potencial com base na assinatura
    let detectedFormat = 'unknown';
    if (fileSignature.startsWith('1a45')) {
      detectedFormat = 'webm';
    } else if (fileSignature.startsWith('4949') || fileSignature.startsWith('4d4d')) {
      detectedFormat = 'wav';
    } else if (fileSignature.startsWith('494433') || fileSignature.startsWith('fffb')) {
      detectedFormat = 'mp3';
    } else if (fileSignature.startsWith('4f676753')) {
      detectedFormat = 'ogg';
    }

    console.log(`🔍 Formato de áudio detectado: ${detectedFormat}`);

    // Validar se o formato é suportado pela API Whisper
    const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    if (!supportedFormats.includes(detectedFormat)) {
      console.warn(`⚠️ Formato de áudio não suportado: ${detectedFormat}. Tentando identificar pelo conteúdo...`);
      
      // Tentativa de identificar o formato pelo conteúdo
      if (audioBuffer.includes(Buffer.from('ftyp'))) {
        detectedFormat = 'mp4';
        console.log('🔍 Formato identificado como mp4 pelo conteúdo.');
      } else if (audioBuffer.includes(Buffer.from('OggS'))) {
        detectedFormat = 'ogg';
        console.log('🔍 Formato identificado como ogg pelo conteúdo.');
      } else {
        console.warn('⚠️ Não foi possível identificar o formato. Tentando salvar como WAV...');
        
        // Fallback: salvar como WAV simples
        const fallbackPath = path.join(tempDir, `fallback_audio_${Date.now()}.wav`);
        await createRawWaveFile(audioBuffer, fallbackPath);
        console.log(`💾 Áudio salvo como WAV para fallback: ${fallbackPath}`);
        detectedFormat = 'wav';
      }
    }

    // Salvar o buffer inicial para um arquivo temporário com extensão apropriada
    let rawPath = path.join(tempDir, `raw_audio_${Date.now()}.${detectedFormat}`);
    fs.writeFileSync(rawPath, audioBuffer);
    console.log(`💾 Arquivo de áudio bruto salvo em: ${rawPath}`);

    // Verificar se o buffer é um JSON (começa com '{')
    let processedBuffer = audioBuffer;
    if (fileSignature.startsWith('7b22')) {
      console.log('🔍 Detectado formato JSON. Tentando extrair dados de áudio...');
      try {
        // Tenta converter o buffer para string e depois para JSON
        const jsonString = audioBuffer.toString('utf-8');
        let jsonData;
        
        try {
          jsonData = JSON.parse(jsonString);
          console.log('✅ JSON válido detectado');
        } catch (jsonError) {
          console.log('⚠️ Não foi possível analisar como JSON completo, tentando extrair...');
          // Tenta encontrar dados em formato base64
          const base64Match = jsonString.match(/"data":"([^"]+)"/);
          if (base64Match && base64Match[1]) {
            console.log('✅ Dados em formato Base64 encontrados no JSON');
            // Converte base64 para buffer
            processedBuffer = Buffer.from(base64Match[1], 'base64');
          }
        }
        
        // Se conseguimos analisar o JSON, verificamos campos comuns de áudio
        if (jsonData) {
          if (jsonData.audio) {
            console.log('🔍 Campo "audio" encontrado no JSON');
            processedBuffer = Buffer.from(jsonData.audio, 'base64');
          } else if (jsonData.data) {
            console.log('🔍 Campo "data" encontrado no JSON');
            processedBuffer = Buffer.from(jsonData.data, 'base64');
          } else if (jsonData.audioData) {
            console.log('🔍 Campo "audioData" encontrado no JSON');
            processedBuffer = Buffer.from(jsonData.audioData, 'base64');
          }
        }
        
        console.log(`📊 Buffer de áudio extraído do JSON: ${Math.round(processedBuffer.length / 1024)} KB`);
      } catch (err) {
        console.warn('⚠️ Erro ao processar possível JSON:', err.message);
        // Continue com o buffer original em caso de falha
      }
    }
    
    // Determinar tipo de arquivo potencial com base na assinatura
    detectedFormat = 'unknown';
    // Verifique o buffer processado
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
    
    console.log(`🔍 Formato de áudio detectado: ${detectedFormat}`);
    
    // Salvar o buffer inicial para um arquivo temporário com extensão apropriada
    rawPath = path.join(tempDir, `raw_audio_${Date.now()}.${detectedFormat !== 'unknown' ? detectedFormat : 'bin'}`);
    fs.writeFileSync(rawPath, processedBuffer);
    console.log(`💾 Arquivo de áudio bruto salvo em: ${rawPath}`);
    
    // Usar diferentes métodos de processamento para maior confiabilidade
    const mp3Path = path.join(tempDir, `audio_${Date.now()}.mp3`);
    const wavPath = path.join(tempDir, `audio_${Date.now()}.wav`);
    
    let audioFile;
    let transcriptionFailed = false;
    
    console.log('🔄 Tentando converter para formatos otimizados para transcrição...');
    
    try {
      // Primeira tentativa: Converter para MP3 (priorizando sobre WAV)
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(rawPath)
          .outputOptions([
            '-ab 128k',       // Bitrate de 128kbps
            '-ar 44100',      // Sample rate 44.1kHz
            '-ac 1'           // Mono (1 canal)
          ])
          .output(mp3Path)
          .on('end', () => {
            console.log('✅ Conversão para MP3 concluída');
            resolve();
          })
          .on('error', (err) => {
            console.warn('⚠️ Conversão para MP3 falhou:', err.message);
            reject(err);
          })
          .run();
      });
      
      const mp3Stats = fs.statSync(mp3Path);
      console.log(`📊 Arquivo MP3 criado: ${Math.round(mp3Stats.size / 1024)} KB`);
      
      if (mp3Stats.size < 10000) {
        console.warn('⚠️ Arquivo MP3 muito pequeno, pode resultar em transcrição incompleta');
      }
      
      audioFile = fs.createReadStream(mp3Path);
      
    } catch (mp3Error) {
      console.log('🔄 Conversão MP3 falhou, tentando formato WAV como alternativa...');
      
      try {
        // Segunda tentativa: Tentar WAV como alternativa
        await new Promise((resolve, reject) => {
          ffmpeg()
            .input(rawPath)
            .outputOptions([
              // Configurações otimizadas para Whisper
              '-acodec pcm_s16le', // Codec PCM 16-bit
              '-ar 16000',         // Sample rate 16kHz (recomendado para Whisper)
              '-ac 1'              // Mono (1 canal)
            ])
            .output(wavPath)
            .on('end', () => {
              console.log('✅ Conversão para WAV concluída');
              resolve();
            })
            .on('error', (err) => {
              console.warn('⚠️ Conversão para WAV falhou:', err.message);
              reject(err);
            })
            .run();
        });
        
        const wavStats = fs.statSync(wavPath);
        console.log(`📊 Arquivo WAV criado: ${Math.round(wavStats.size / 1024)} KB`);
        
        if (wavStats.size < 10000) {
          console.warn('⚠️ Arquivo WAV muito pequeno, possivelmente corrompido');
          throw new Error('Arquivo WAV resultante muito pequeno');
        }
        
        audioFile = fs.createReadStream(wavPath);
        
      } catch (wavError) {
        console.log('🔄 Todas as conversões falharam, tentando criar um MP3 válido manualmente...');
        
        try {
          // Tentativa: Criar um MP3 válido a partir dos dados brutos
          const forceMp3Path = path.join(tempDir, `force_mp3_${Date.now()}.mp3`);
          
          // Primeiro salvamos os dados em formato raw
          const rawDataPath = path.join(tempDir, `raw_data_${Date.now()}.raw`);
          fs.writeFileSync(rawDataPath, processedBuffer);
          
          // Tentar converter dados brutos diretamente para MP3
          await new Promise((resolve, reject) => {
            ffmpeg()
              .input(rawDataPath)
              .inputFormat('s16le')  // PCM 16-bit Little-Endian
              .inputOptions([
                '-f s16le',
                '-ar 16000',
                '-ac 1'
              ])
              .outputOptions([
                '-acodec libmp3lame',
                '-ab 128k'
              ])
              .output(forceMp3Path)
              .on('end', () => {
                console.log('✅ MP3 forçado criado com sucesso');
                resolve();
              })
              .on('error', (err) => {
                console.warn('⚠️ Falha ao criar MP3 forçado:', err.message);
                reject(err);
              })
              .run();
          });
          
          // Verificar se o arquivo MP3 foi criado com sucesso
          if (fs.existsSync(forceMp3Path) && fs.statSync(forceMp3Path).size > 1000) {
            console.log('🔄 Usando MP3 forçado para transcrição');
            audioFile = fs.createReadStream(forceMp3Path);
            transcriptionFailed = false;
          } else {
            throw new Error("MP3 forçado muito pequeno ou inválido");
          }
          
          // Limpar o arquivo raw temporário
          fs.unlinkSync(rawDataPath);
          
        } catch (forcedMp3Error) {
          console.log('🔄 Criação de MP3 forçado falhou, recorrendo para WAV válido...');
          
          // Última tentativa: forçar a criação de um arquivo WAV válido
          const forceWavPath = path.join(tempDir, `force_wav_${Date.now()}.wav`);
          
          try {
            // Criar um arquivo WAV a partir do buffer bruto
            await createValidWaveFile(processedBuffer, forceWavPath);
            console.log(`✅ Arquivo WAV forçado criado: ${forceWavPath}`);
            
            // Verificar se o arquivo foi criado e tem tamanho adequado
            if (fs.existsSync(forceWavPath) && fs.statSync(forceWavPath).size > 1000) {
              console.log('🔄 Usando arquivo WAV forçado para transcrição');
              audioFile = fs.createReadStream(forceWavPath);
              transcriptionFailed = false;
            } else {
              throw new Error("Arquivo WAV criado é muito pequeno ou inválido");
            }
          } catch (wavError) {
            console.warn('⚠️ Falha ao criar WAV forçado:', wavError.message);
            
            // Último recurso: usar um arquivo MP3 vazio válido
            const emptyValidPath = path.join(tempDir, `empty_valid_${Date.now()}.mp3`);
            
            // Verificar se temos o arquivo de recurso, se não, criar um
            const emptyMp3Path = path.join(__dirname, '../../assets/empty.mp3');
            if (!fs.existsSync(emptyMp3Path)) {
              // Criar um MP3 vazio válido usando ffmpeg
              console.log('⚠️ Criando arquivo MP3 vazio de recurso...');
              try {
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
              } catch (emptyMp3Error) {
                // Se falhar na criação, usamos um placeholder
                const placeholder = Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADxAC2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2AAAAA//tAxAAAAsUJvdQQAAtCZG+3hCAAkIIggCCMAYBgCAIBAMWH8f/+EP8fniB+H8fzB8HwQx+H54PiOH+dgEYfniCD4gGD5/B8HxAMHznBiBAP5/lAhwf4PnED//nx/UCAIfnznHBDPEB/OHEH/pTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==', 'base64');
                fs.writeFileSync(emptyValidPath, placeholder);
              }
            } else {
              fs.copyFileSync(emptyMp3Path, emptyValidPath);
            }
            
            console.log('⚠️ Usando arquivo MP3 vazio válido como último recurso');
            audioFile = fs.createReadStream(emptyValidPath);
            transcriptionFailed = true;
          }
        }
      }
    }
    
    console.log('🔄 Transcrevendo áudio com API Whisper...', audioFile.path);
    
    // Transcrever o áudio usando a API Whisper com parâmetros otimizados
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "pt",
      response_format: "text",
      temperature: transcriptionFailed ? 0.2 : 0,  // Aumentar temperatura ligeiramente se houver falha prévia
      prompt: "Este é um comando de agendamento em português brasileiro. Pode conter nomes e datas."
    });
    
    console.log(`✅ Transcrição concluída: "${transcription}"`);
    
    // Se a transcrição for muito curta, tentar novamente com diferentes parâmetros
    if (transcription.length < 10 && !transcriptionFailed) {
      console.log('⚠️ Transcrição muito curta, tentando novamente com parâmetros alternativos...');
      
      const retryTranscription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "pt",
        response_format: "text",
        temperature: 0.3,  // Temperatura mais alta para tentar resultados diferentes
        prompt: "Este é um comando para agendar uma reunião. Pode incluir nome da pessoa, data e hora."
      });
      
      console.log(`✅ Segunda transcrição concluída: "${retryTranscription}"`);
      
      if (retryTranscription.length > transcription.length) {
        console.log('✅ Segunda transcrição é mais completa, usando esta versão');
        return retryTranscription;
      }
    }
    
    // Limpar arquivos temporários
    try {
      fs.unlinkSync(rawPath);
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
      console.log('🧹 Arquivos temporários removidos');
    } catch (err) {
      console.warn('⚠️ Erro ao limpar arquivos temporários:', err);
    }
    
    return transcription;
    
  } catch (error) {
    console.error('❌ Erro ao processar áudio:', error);
    throw new Error(`Falha ao processar áudio: ${error.message}`);
  }
}

/**
 * Tenta converter o arquivo usando diferentes formatos de entrada
 * @param {string} inputPath - Caminho do arquivo de entrada
 * @param {string} outputPath - Caminho do arquivo de saída
 * @param {string[]} formatsToTry - Formatos de entrada para tentar
 */
async function convertWithFallbacks(inputPath, outputPath, formatsToTry) {
  let success = false;
  let lastError = null;
  
  // Tenta cada formato até ter sucesso
  for (const format of formatsToTry) {
    try {
      console.log(`🔄 Tentando converter como ${format}...`);
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(inputPath)
          .inputFormat(format)
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
    throw new Error(`Nenhum formato funcionou para conversão: ${lastError?.message}`);
  }
}

/**
 * Cria um arquivo WAV simples a partir dos dados brutos
 * Este é um último recurso quando outros métodos falham
 */
async function createRawWaveFile(audioBuffer, outputPath) {
  // Cria um cabeçalho WAV básico
  // Este é um método simplificado - pode não funcionar para todos os tipos de áudio
  const wavHeader = Buffer.alloc(44);
  
  // "RIFF"
  wavHeader.write('RIFF', 0);
  // Tamanho do arquivo (menos 8 bytes para RIFF e tamanho)
  wavHeader.writeUInt32LE(32 + audioBuffer.length, 4);
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
