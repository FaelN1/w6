import OpenAI from 'openai';
import dotenv from 'dotenv';
import moment from 'moment-timezone';

dotenv.config();

// Configuração da API OpenAI usando a nova sintaxe
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Interpreta um comando em linguagem natural e extrai informações relevantes
 * @param {string} comando - O comando em linguagem natural
 * @returns {Promise<Object>} - Objeto com as informações extraídas
 */
export async function parseComando(comando) {
  try {
    // Verificar se temos um comando substantivo
    if (!comando || comando.trim().length < 3) {
      return {
        nome: 'Usuário',
        data: moment().add(1, 'day').hour(10).minute(0).second(0).toISOString(),
        assunto: `Reunião agendada por voz`,
        descricao: `Reunião agendada automaticamente via assistente AUREX.`,
        duracao: 60
      };
    }
    
    // Usando a OpenAI com o modelo gpt-3.5-turbo
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Você é um assistente especializado em extrair informações de comandos em português para agendamentos no Brasil. Use o fuso horário de Brasília (GMT-3)."
        },
        {
          role: "user",
          content: `
          Extraia as seguintes informações deste comando para uma reunião no Brasil:
          - Nome da pessoa para reunião
          - Data e hora da reunião (considerando hoje como ${moment().format('DD/MM/YYYY')})
          
          Comando: "${comando}"
          
          Responda apenas em formato JSON válido:
          {
            "nome": "nome da pessoa",
            "dataHora": "data e hora em formato ISO"
          }
          `
        }
      ],
      temperature: 0,
      max_tokens: 150
    });

    // Extraindo o texto da resposta
    const content = response.choices[0].message.content.trim();
    
    // Tentativa de encontrar o JSON na resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Não foi possível extrair um JSON válido da resposta');
    }
    
    // Extraindo o JSON da resposta
    const jsonResponse = JSON.parse(jsonMatch[0]);
    
    // Extraindo a data e o nome do comando
    const nome = jsonResponse.nome;
    let dataHoraStr = jsonResponse.dataHora;
    
    // Processa a data e hora para garantir o ano correto e o fuso horário brasileiro
    let dataEvento = moment.tz(dataHoraStr, 'America/Sao_Paulo');
    const anoAtual = moment().year();

    // Se a data não for válida ou estiver no passado, fazer ajustes
    if (!dataEvento.isValid() || dataEvento.isBefore(moment())) {
      // Extrair dia, mês e hora do comando original
      const regexDia = /dia\s+(\d{1,2})\s+de\s+([^\s]+)/i;
      const regexHora = /(\d{1,2})h/i;
      const diaMatch = comando.match(regexDia);
      const horaMatch = comando.match(regexHora);

      if (diaMatch && horaMatch) {
        const dia = parseInt(diaMatch[1]);
        const mes = traduzirMes(diaMatch[2]);
        const hora = parseInt(horaMatch[1]);
        dataEvento = moment.tz('America/Sao_Paulo').year(anoAtual).month(mes).date(dia).hour(hora).minute(0).second(0);

        // Se a data já passou este ano, avançar para o próximo ano
        if (dataEvento.isBefore(moment())) {
          dataEvento.add(1, 'year');
        }
      } else {
        // Fallback para caso não consiga extrair do comando
        // Usar a data que veio do modelo, mas corrigir o ano
        if (dataEvento.isValid()) {
          dataEvento.year(anoAtual);
          if (dataEvento.isBefore(moment())) {
            dataEvento.add(1, 'year');
          }
        } else {
          // Se tudo falhar, agendar para amanhã na hora especificada ou 10h como padrão
          dataEvento = moment.tz('America/Sao_Paulo').add(1, 'days').hour(10).minute(0).second(0);
        }
      }
    }

    console.log(`Data interpretada: ${dataEvento.format('YYYY-MM-DD HH:mm:ss')} (${dataEvento.fromNow()})`);

    // Tratamento especial para transcrições curtas ou incompletas
    if (nome && nome.trim() === '' && comando.length < 10) {
      // Para comandos muito curtos ou sem nome identificado, use valores padrão
      return {
        nome: 'Usuário',
        data: moment().add(1, 'day').hour(10).minute(0).second(0).toISOString(),
        assunto: `Reunião: ${comando}`,
        descricao: `Reunião agendada automaticamente via assistente AUREX com comando: "${comando}"`,
        duracao: 60
      };
    }

    // Formatando a resposta
    return {
      nome: nome,
      data: dataEvento.toISOString(),
      assunto: `Reunião com ${nome}`,
      descricao: `Reunião agendada automaticamente via assistente AUREX.`,
      duracao: 60 // duração padrão em minutos
    };
  } catch (error) {
    console.error('Erro ao interpretar comando:', error);
    
    // Fornecer uma resposta padrão em caso de erro para evitar falha total
    return {
      nome: 'Usuário', 
      data: moment().add(1, 'day').hour(10).minute(0).second(0).toISOString(),
      assunto: `Reunião agendada via voz`,
      descricao: `Reunião agendada automaticamente via assistente AUREX.`,
      duracao: 60
    };
  }
}

/**
 * Converte o nome do mês em português para o índice (0-11)
 * @param {string} nomeMes - Nome do mês em português
 * @returns {number} - Índice do mês (0-11)
 */
function traduzirMes(nomeMes) {
  const meses = {
    'janeiro': 0, 'jan': 0, 'fevereiro': 1, 'fev': 1, 
    'março': 2, 'mar': 2, 'abril': 3, 'abr': 3,
    'maio': 4, 'mai': 4, 'junho': 5, 'jun': 5,
    'julho': 6, 'jul': 6, 'agosto': 7, 'ago': 7,
    'setembro': 8, 'set': 8, 'outubro': 9, 'out': 9,
    'novembro': 10, 'nov': 10, 'dezembro': 11, 'dez': 11
  };
  
  // Converter para minúsculas e remover acentos para comparação
  const mesNormalizado = nomeMes.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  return meses[mesNormalizado] !== undefined ? meses[mesNormalizado] : new Date().getMonth();
}
