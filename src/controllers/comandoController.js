import { parseComando } from '../utils/parser.js';
import { criarEvento } from '../services/calendarService.js';
import { enviarEmail } from '../services/emailService.js';
import { registrarEvento } from '../services/logService.js';
import { gerarFala, formatarMensagemFala } from '../services/speechService.js';

/**
 * Processa um comando de texto e executa as ações correspondentes
 * @param {string} comando - O comando de texto a ser processado
 * @returns {Object} - O resultado do processamento
 */
export async function processarComando(comando) {
  try {
    // Passo 1: Interpretar o comando
    console.log('🔍 Interpretando comando...');
    const dadosEvento = await parseComando(comando);
    
    console.log('✅ Dados extraídos:', dadosEvento);
    
    // Passo 2: Criar evento no Google Calendar
    console.log('📅 Criando evento no Google Calendar...');
    const eventoCalendario = await criarEvento(dadosEvento);
    
    // Passo 3: Enviar e-mail de confirmação
    console.log('📧 Enviando e-mail de confirmação...');
    const emailEnviado = await enviarEmail(dadosEvento, eventoCalendario.htmlLink);
    
    // Passo 4: Registrar em banco de dados
    console.log('💾 Registrando evento no banco de dados...');
    await registrarEvento({
      ...dadosEvento,
      calendarId: eventoCalendario.id,
      emailEnviado: emailEnviado.messageId ? true : false,
      timestamp: new Date().toISOString()
    });
    
    // Passo 5: Gerar resposta de voz
    console.log('🔊 Gerando resposta de voz...');
    const mensagemVoz = formatarMensagemFala(dadosEvento);
    const audioData = await gerarFala(mensagemVoz);
    
    return {
      success: true,
      message: `Evento com ${dadosEvento.nome} criado com sucesso!`,
      dados: {
        evento: eventoCalendario,
        email: emailEnviado.messageId ? "Enviado com sucesso" : "Falha no envio",
        registroDb: true
      },
      audio: audioData // Adicionando os dados do áudio à resposta
    };
    
  } catch (error) {
    console.error('❌ Erro ao processar comando:', error);
    throw error;
  }
}
