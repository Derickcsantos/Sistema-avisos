require('dotenv').config();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/calendar', // escopo de escrita/leitura
        // outros escopos possíveis:
        // 'https://www.googleapis.com/auth/calendar.events',
        // 'https://www.googleapis.com/auth/calendar.readonly'
      ],
      accessType: 'offline',
      prompt: 'consent',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const name = profile.displayName;
        const email = profile.emails[0].value;

        // Verificar se usuário já existe
        const { data: existingUser, error: selectError } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        let userObj;
        if (existingUser) {
          userObj = { ...existingUser, accessToken };
          return done(null, userObj);
        }

        if (selectError && selectError.code !== 'PGRST116') {
          return done(selectError, null);
        }

        if (existingUser) {
          return done(null, existingUser); // já tem ID
        }

        // Criar novo usuário
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert([{
            name,
            email,
            google_id: googleId,
            password: null,      // Usuário Google não tem senha
            plano: 'Free',       // Valor padrão
            tipo: 'Comum',       // Valor padrão
            phone: null          // Opcional
          }])
          .select()
          .single();

        if (insertError) {
          console.error('Erro ao inserir usuário:', JSON.stringify(insertError, null, 2));
          return done(insertError, null);
        }

        userObj = { ...newUser, accessToken };
        return done(null, newUser);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});
