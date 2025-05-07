import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// Configuração da autenticação Google
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

/**
 * Cria um evento no Google Calendar
 * @param {Object} dadosEvento - Dados do evento a ser criado
 * @returns {Promise<Object>} - Evento criado
 */
export async function criarEvento(dadosEvento) {
  try {
    const { nome, data, assunto, descricao, duracao } = dadosEvento;
    
    // Calcula a data de término com base na duração
    const dataInicio = new Date(data);
    const dataFim = new Date(dataInicio.getTime() + duracao * 60000);
    
    // Configuração básica do evento
    const evento = {
      summary: assunto,
      description: descricao,
      start: {
        dateTime: dataInicio.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: dataFim.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };
    
    // Adiciona participantes apenas se houver um nome válido
    if (nome && nome.trim().length > 0) {
      // Verificar se há múltiplos participantes no campo nome
      const separadores = [',', ' e ', ' com ', '/', ';'];
      let participantes = [nome];
      
      // Tentar identificar múltiplos nomes usando diferentes separadores
      for (const separador of separadores) {
        if (nome.includes(separador)) {
          participantes = nome.split(separador)
            .map(n => n.trim())
            .filter(n => n.length > 0);
          break;
        }
      }
      
      // Criar um email válido para cada participante
      evento.attendees = participantes.map(participante => {
        // Normalizar o nome para um endereço de email válido
        const emailNormalizado = participante
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remover acentos
          .replace(/[^a-z0-9]/g, '.') // Substituir caracteres não alfanuméricos por ponto
          .replace(/\.+/g, '.') // Substituir múltiplos pontos por um único ponto
          .replace(/^\.|\.$/g, ''); // Remover pontos no início ou fim
          
        return { email: `${emailNormalizado}@example.com` };
      });
      
      console.log(`👥 Participantes detectados: ${evento.attendees.map(a => a.email).join(', ')}`);
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: evento,
      sendUpdates: 'all',
    });

    return response.data;
  } catch (error) {
    console.error('Erro ao criar evento no Google Calendar:', error);
    throw new Error('Falha ao criar evento no calendário: ' + error.message);
  }
}
