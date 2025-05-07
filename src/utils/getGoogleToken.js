import http from 'http';
import url from 'url';
import open from 'open';
import destroyer from 'server-destroy';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Ferramenta para obter o refresh token do Google OAuth2
 */
async function getRefreshToken() {
  return new Promise((resolve, reject) => {
    // Crie um cliente OAuth2
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Gere a URL de autorização
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/spreadsheets'
    ];

    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent' // Para garantir que receba o refresh token
    });

    // Crie um servidor web local para receber o código de autorização
    const server = http.createServer(async (req, res) => {
      try {
        // Verifique se é uma chamada de callback
        if (req.url.indexOf('/oauth2callback') > -1) {
          // Obtenha o código da URL
          const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
          const code = qs.get('code');
          console.log(`Código recebido: ${code}`);

          // Encerre a resposta
          res.end('Autenticação concluída! Você pode fechar esta janela.');
          server.destroy();

          // Obtenha os tokens
          const { tokens } = await oauth2Client.getToken(code);
          console.log('Tokens recebidos:');
          console.log(tokens);
          
          if (tokens.refresh_token) {
            console.log('\n=======================');
            console.log(`REFRESH TOKEN: ${tokens.refresh_token}`);
            console.log('=======================');
            console.log('\nAdicione esse token ao seu arquivo .env como GOOGLE_REFRESH_TOKEN');
          } else {
            console.log('\n⚠️ Nenhum refresh_token recebido. Tente novamente com outra conta ou revogue o acesso anterior.');
          }

          resolve(tokens.refresh_token);
        }
      } catch (e) {
        reject(e);
      }
    }).listen(3000, () => {
      // Abra a URL de autorização no navegador
      console.log('Abrindo navegador para autorização...');
      console.log(`Autorize a aplicação em: ${authorizeUrl}`);
      open(authorizeUrl, {wait: false});
    });

    destroyer(server);
  });
}

getRefreshToken().catch(console.error);
