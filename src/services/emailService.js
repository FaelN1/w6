import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Configuração do transportador de e-mail usando as variáveis SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
  }
});

/**
 * Envia um e-mail de confirmação do evento
 * @param {Object} dadosEvento - Dados do evento
 * @param {string} linkCalendario - Link para o evento no Google Calendar
 * @returns {Promise<Object>} - Informações sobre o envio do e-mail
 */
export async function enviarEmail(dadosEvento, linkCalendario) {
  try {
    const { nome, data, assunto, descricao } = dadosEvento;
    
    // Formata a data para exibição
    const dataFormatada = new Date(data).toLocaleString('pt-BR', {
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit'
    });
    
    // Destinatário simulado (em ambiente de produção, seria um e-mail real)
    const destinatario = `${nome.toLowerCase().replace(/\s+/g, '.')}@example.com`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"Assistente AUREX" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: destinatario,
      subject: `Confirmação: ${assunto}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h1 style="color: #4285f4;">Sua reunião foi agendada!</h1>
          <p>Olá ${nome},</p>
          <p>Sua reunião foi agendada com sucesso para <strong>${dataFormatada}</strong>.</p>
          <h2>Detalhes do evento:</h2>
          <ul>
            <li><strong>Assunto:</strong> ${assunto}</li>
            <li><strong>Data/Hora:</strong> ${dataFormatada}</li>
            <li><strong>Descrição:</strong> ${descricao}</li>
          </ul>
          <p>
            <a href="${linkCalendario}" style="background-color: #4285f4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 15px;">
              Ver no Google Calendar
            </a>
          </p>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            Este é um e-mail automático enviado pelo Assistente AUREX.
          </p>
        </div>
      `
    };
    
    console.log(`📧 Enviando email para ${destinatario} usando ${process.env.SMTP_HOST || 'Gmail'}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email enviado com sucesso: ${info.messageId}`);
    return info;
    
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    throw new Error('Falha ao enviar e-mail de confirmação: ' + error.message);
  }
}
