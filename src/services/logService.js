import { GoogleSpreadsheet } from 'google-spreadsheet';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ID da planilha do Google Sheets
const SHEETS_ID = process.env.GOOGLE_SHEETS_ID;

/**
 * Verifica se a planilha existe e está configurada corretamente,
 * caso contrário cria uma nova planilha
 * @returns {Promise<boolean>} - Sucesso da verificação/criação
 */
export async function verificarEPrepararPlanilha() {
  try {
    // Verifica se as credenciais do Google estão disponíveis
    if (!process.env.GOOGLE_CLIENT_ID || 
        !process.env.GOOGLE_CLIENT_SECRET || 
        !process.env.GOOGLE_REFRESH_TOKEN) {
      console.log('⚠️ Credenciais do Google não configuradas. Usando armazenamento local.');
      return false;
    }

    // Verifica se o ID da planilha está configurado
    if (!SHEETS_ID) {
      console.log('⚠️ ID da planilha não configurado no .env. Configure GOOGLE_SHEETS_ID.');
      return false;
    }
    
    try {
      // Tenta acessar a planilha existente
      console.log('🔍 Verificando planilha existente...');
      
      // Inicializa o documento
      const doc = new GoogleSpreadsheet(SHEETS_ID);
      
      // Autenticação usando OAuth2
      const { google } = await import('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
      
      const tokens = await oauth2Client.getAccessToken();
      
      await doc.useServiceAccountAuth({
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
        private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
      }).catch(() => {
        // Se falhar com Service Account, tenta OAuth2
        return doc.useOAuth2Client(oauth2Client);
      });
      
      await doc.loadInfo();
      
      // Verificar se existe pelo menos uma planilha (sheet)
      if (doc.sheetCount === 0) {
        console.log('📝 Planilha encontrada, mas sem sheets. Criando sheet de eventos...');
        // Adiciona uma nova planilha se não existir nenhuma
        const sheet = await doc.addSheet({ 
          title: 'Eventos',
          headerValues: ['nome', 'data', 'assunto', 'calendarId', 'emailEnviado', 'timestamp', 'status']
        });
        console.log(`✅ Sheet '${sheet.title}' criada com sucesso!`);
      } else {
        // Verificar se a primeira planilha tem as colunas esperadas
        const sheet = doc.sheetsByIndex[0];
        await sheet.loadHeaderRow();
        
        const headerRow = sheet.headerValues;
        const requiredColumns = ['nome', 'data', 'assunto', 'calendarId', 'emailEnviado', 'timestamp', 'status'];
        
        const missingColumns = requiredColumns.filter(col => !headerRow.includes(col));
        
        if (missingColumns.length > 0) {
          console.log(`⚠️ Colunas ausentes na planilha: ${missingColumns.join(', ')}`);
          
          // Adiciona as colunas faltantes
          await sheet.setHeaderRow([...headerRow, ...missingColumns]);
          console.log('✅ Colunas adicionadas com sucesso!');
        } else {
          console.log('✅ Planilha verificada e pronta para uso!');
        }
      }
      
      return true;
      
    } catch (error) {
      // Se a planilha não existir ou houver erro de acesso
      if (error.message && error.message.includes('not found')) {
        console.log('⚠️ Planilha não encontrada. Criando nova planilha...');
        
        // Cria uma nova planilha
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const response = await drive.files.create({
          requestBody: {
            name: 'AUREX - Registro de Eventos',
            mimeType: 'application/vnd.google-apps.spreadsheet',
          }
        });
        
        if (!response.data.id) {
          throw new Error('Falha ao criar nova planilha');
        }
        
        const newSpreadsheetId = response.data.id;
        console.log(`📝 Nova planilha criada com ID: ${newSpreadsheetId}`);
        console.log(`⚠️ Atualize o valor de GOOGLE_SHEETS_ID no seu arquivo .env com: ${newSpreadsheetId}`);
        
        // Adiciona permissão para o email do usuário
        await drive.permissions.create({
          fileId: newSpreadsheetId,
          requestBody: {
            role: 'writer',
            type: 'user',
            emailAddress: process.env.EMAIL_USER
          }
        });
        
        // Configura a nova planilha
        const doc = new GoogleSpreadsheet(newSpreadsheetId);
        await doc.useOAuth2Client(oauth2Client);
        await doc.loadInfo();
        
        // Adiciona uma planilha (sheet) para os eventos
        const sheet = await doc.addSheet({ 
          title: 'Eventos',
          headerValues: ['nome', 'data', 'assunto', 'calendarId', 'emailEnviado', 'timestamp', 'status']
        });
        
        console.log(`✅ Planilha '${doc.title}' e sheet '${sheet.title}' criadas com sucesso!`);
        
        return true;
      } else {
        console.error('❌ Erro ao verificar/criar planilha:', error);
        return false;
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar/preparar planilha:', error);
    return false;
  }
}

/**
 * Registra um evento no banco de dados (Google Sheets ou arquivo local)
 * @param {Object} dadosEvento - Dados do evento a ser registrado
 * @returns {Promise<boolean>} - Sucesso do registro
 */
export async function registrarEvento(dadosEvento) {
  try {
    console.log('🔄 Iniciando registro de evento no banco de dados...');
    
    // Se não temos ID da planilha, usar armazenamento local
    if (!SHEETS_ID) {
      console.log('⚠️ ID da planilha não configurado. Usando armazenamento local.');
      return salvarEmArquivoLocal(dadosEvento);
    }
    
    // Inicializa o documento
    const doc = new GoogleSpreadsheet(SHEETS_ID);
    console.log(`📊 Conectando à planilha: ${SHEETS_ID}`);
    
    try {
      // Primeiro tenta autenticar com Service Account (se disponível)
      if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        console.log('🔐 Autenticando com Service Account...');
        await doc.useServiceAccountAuth({
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        });
      } else {
        // Se não tiver Service Account, tenta OAuth2
        console.log('🔐 Service Account não disponível, usando OAuth2...');
        const { google } = await import('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        
        oauth2Client.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });
        
        await doc.useOAuth2Client(oauth2Client);
      }
      
      console.log('📄 Carregando informações da planilha...');
      await doc.loadInfo();
      
      // Obtém a primeira planilha (sheet)
      if (doc.sheetCount === 0) {
        console.log('⚠️ Nenhuma planilha encontrada. Criando uma nova...');
        await doc.addSheet({ 
          title: 'Eventos',
          headerValues: ['nome', 'data', 'assunto', 'calendarId', 'emailEnviado', 'timestamp', 'status']
        });
      }
      
      const sheet = doc.sheetsByIndex[0];
      console.log(`📝 Usando planilha: ${sheet.title}`);
      
      // Prepara os dados para registro
      const { nome, data, assunto, calendarId, emailEnviado, timestamp } = dadosEvento;
      
      console.log(`📝 Adicionando linha para evento: ${assunto}`);
      // Adiciona uma nova linha à planilha
      const novaLinha = await sheet.addRow({
        nome,
        data,
        assunto,
        calendarId,
        emailEnviado: emailEnviado ? 'Sim' : 'Não',
        timestamp,
        status: 'Concluído'
      });
      
      console.log(`✅ Linha adicionada com sucesso! ID: ${novaLinha._rowNumber}`);
      return true;
      
    } catch (err) {
      console.error(`❌ Erro ao salvar na planilha: ${err.message}`);
      console.log('⚠️ Fazendo fallback para armazenamento local...');
      return salvarEmArquivoLocal(dadosEvento);
    }
    
  } catch (error) {
    console.error('❌ Erro ao registrar evento:', error.message);
    // Tentar salvar localmente como último recurso
    try {
      return salvarEmArquivoLocal(dadosEvento);
    } catch (localError) {
      console.error('❌ Falha também ao salvar localmente:', localError.message);
      throw new Error('Falha ao registrar evento no banco de dados: ' + error.message);
    }
  }
}

/**
 * Salva os dados do evento em um arquivo JSON local
 * @param {Object} dadosEvento - Dados do evento
 * @returns {boolean} - Indica se o salvamento foi bem-sucedido
 */
function salvarEmArquivoLocal(dadosEvento) {
  try {
    const logFilePath = path.join(process.cwd(), 'eventos.json');
    console.log(`💾 Salvando em arquivo local: ${logFilePath}`);
    
    // Lê o arquivo existente ou cria um novo array
    let eventos = [];
    if (fs.existsSync(logFilePath)) {
      const fileContent = fs.readFileSync(logFilePath, 'utf8');
      eventos = JSON.parse(fileContent);
      console.log(`📊 Arquivo existente com ${eventos.length} eventos`);
    }
    
    // Adiciona o novo evento
    eventos.push({
      ...dadosEvento,
      emailEnviado: dadosEvento.emailEnviado ? 'Sim' : 'Não',
      status: 'Concluído'
    });
    
    // Salva de volta no arquivo
    fs.writeFileSync(logFilePath, JSON.stringify(eventos, null, 2));
    console.log(`✅ Evento salvo com sucesso no arquivo local`);
    
    return true;
  } catch (error) {
    console.error(`❌ Erro ao salvar em arquivo local: ${error.message}`);
    throw error;
  }
}
