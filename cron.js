require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const CronJob = require('cron').CronJob;

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Função para enviar lembretes
async function sendReminders() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  
  // Buscar lembretes que devem ser enviados hoje
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*, users(email, name)')
    .gte('reminder_date', startOfDay.toISOString())
    .lt('reminder_date', endOfDay.toISOString())
    .eq('is_completed', false)
    .eq('is_cancelled', false);
  
  if (error) {
    console.error('Erro ao buscar lembretes:', error);
    return;
  }
  
  // Enviar emails
  for (const reminder of reminders) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: reminder.users.email,
        subject: `Lembrete: ${reminder.title}`,
        html: `
          <h1>Olá, ${reminder.users.name}!</h1>
          <p>Este é um lembrete sobre: <strong>${reminder.title}</strong></p>
          <p>${reminder.description || ''}</p>
          <p>Data do evento: ${new Date(reminder.event_date).toLocaleString()}</p>
          <p>Atenciosamente,<br>Sistema de Lembretes</p>
        `
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`Email enviado para ${reminder.users.email}`);
    } catch (err) {
      console.error(`Erro ao enviar email para ${reminder.users.email}:`, err);
    }
  }
}

// Agendar job para rodar todos os dias às 8:00 AM
const job = new CronJob(
  '0 8 * * *', // Todos os dias às 8:00 AM
  sendReminders,
  null,
  true,
  'America/Sao_Paulo'
);

console.log('Serviço de lembretes iniciado. Aguardando horário programado...');