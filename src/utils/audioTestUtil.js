import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processarAudio } from '../services/audioService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Utilitário para testar a transcrição de um arquivo de áudio salvo
 * Uso: node src/utils/audioTestUtil.js <caminho_do_arquivo>
 */
async function testarAudioSalvo() {
  try {
    // Pega o caminho do arquivo do argumento de linha de comando
    const filePath = process.argv[2];
    
    if (!filePath) {
      console.error('❌ Forneça o caminho do arquivo de áudio como argumento');
      console.log('Uso: node src/utils/audioTestUtil.js <caminho_do_arquivo>');
      process.exit(1);
    }
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Arquivo não encontrado: ${filePath}`);
      process.exit(1);
    }
    
    console.log(`📂 Carregando arquivo: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`📊 Tamanho do arquivo: ${Math.round(fileBuffer.length / 1024)} KB`);
    
    console.log('🔄 Transcrevendo áudio...');
    const transcricao = await processarAudio(fileBuffer);
    
    console.log('\n✅ Transcrição concluída:');
    console.log('----------------------------');
    console.log(transcricao);
    console.log('----------------------------');
    
  } catch (error) {
    console.error('❌ Erro ao testar áudio:', error);
  }
}

// Executa o teste se este arquivo for chamado diretamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testarAudioSalvo();
}
