require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const nodemailer = require('nodemailer');
const passport = require("passport");
const auth = require('./auth');

const app = express();
const port = process.env.PORT || 3000;

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

// Configurações do app
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(passport.initialize());
app.use(passport.session());

// Middleware para verificar autenticação
const checkAuth = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  next();
};

// Middleware para buscar o id do usuário autenticado
const fetchUserId = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).send('Usuário não autenticado');
  }
  // Se já tiver userDbId na sessão, usa ele
  if (req.session && req.session.userDbId) {
    req.userDbId = req.session.userDbId;
    return next();
  }
  // Busca o id do usuário pelo email
  const { data: userDb, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', req.user.email)
    .single();
  if (userError || !userDb) {
    console.error(userError);
    return res.status(500).send('Usuário não encontrado');
  }
  req.userDbId = userDb.id;
  if (req.session) req.session.userDbId = userDb.id;
  next();
};

// Rotas
// Rota principal
app.get('/', checkAuth, fetchUserId, async (req, res) => {
  // Contar lembretes por status
  const { count: allCount } = await supabase
    .from('reminders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.userDbId);

  const { count: activeCount } = await supabase
    .from('reminders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.userDbId)
    .eq('is_completed', false)
    .eq('is_cancelled', false);

  const { count: completedCount } = await supabase
    .from('reminders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.userDbId)
    .eq('is_completed', true);

  res.render('index', {
    user: req.user,
    remindersCount: {
      all: allCount || 0,
      active: activeCount || 0,
      completed: completedCount || 0
    }
  });
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .single();
  
  if (error || !data) {
    return res.render('login', { error: 'Credenciais inválidas' });
  }
  
  req.user = data;
  req.session.userDbId = data.id;
  res.redirect('/reminders');
});

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  
  if (existingUser) {
    return res.render('register', { error: 'Email já cadastrado' });
  }
  
  const { data, error } = await supabase
    .from('users')
    .insert([{ name, email, password }])
    .select()
    .single();
  
  if (error) {
    return res.render('register', { error: 'Erro ao cadastrar usuário' });
  }
  
  req.user = data;
  req.session.userDbId = data.id;
  res.redirect('/reminders');
});

app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    successRedirect: "/reminders",
  })
);

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/reminders', checkAuth, fetchUserId, async (req, res) => {
  console.log("Usuário logado:", req.user);

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', req.userDbId)
    .order('event_date', { ascending: true });
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao buscar lembretes');
  }
  
  res.render('reminders', { 
    user: req.user, 
    reminders,
    activeTab: 'all'
  });
});

app.get("/api/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ message: "Not authenticated" });
  }
});

app.get('/reminders/active', checkAuth, fetchUserId, async (req, res) => {
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', req.userDbId)
    .eq('is_completed', false)
    .eq('is_cancelled', false)
    .order('event_date', { ascending: true });
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao buscar lembretes');
  }
  
  res.render('reminders', { 
    user: req.user, 
    reminders,
    activeTab: 'active'
  });
});

app.get('/reminders/completed', checkAuth, fetchUserId, async (req, res) => {
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', req.userDbId)
    .eq('is_completed', true)
    .order('event_date', { ascending: true });
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao buscar lembretes');
  }
  
  res.render('reminders', { 
    user: req.user, 
    reminders,
    activeTab: 'completed'
  });
});

app.get('/reminders/cancelled', checkAuth, fetchUserId, async (req, res) => {
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', req.userDbId)
    .eq('is_cancelled', true)
    .order('event_date', { ascending: true });
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao buscar lembretes');
  }
  
  res.render('reminders', { 
    user: req.user, 
    reminders,
    activeTab: 'cancelled'
  });
});

app.get('/reminders/new', checkAuth, fetchUserId, (req, res) => {
  res.render('edit-reminder', { 
    user: req.user, 
    reminder: null 
  });
});

app.post('/reminders', checkAuth, fetchUserId, async (req, res) => {
  const { title, description, event_date, reminder_date } = req.body;
  
  const { error } = await supabase
    .from('reminders')
    .insert([{
      user_id: req.userDbId,
      title,
      description,
      event_date: new Date(event_date).toISOString(),
      reminder_date: new Date(reminder_date).toISOString()
    }]);
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao criar lembrete');
  }
  
  res.redirect('/reminders');
});

app.get('/reminders/:id/edit', checkAuth, fetchUserId, async (req, res) => {
  const { id } = req.params;
  
  const { data: reminder, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('id', id)
    .eq('user_id', req.userDbId)
    .single();
  
  if (error || !reminder) {
    return res.status(404).send('Lembrete não encontrado');
  }
  
  res.render('edit-reminder', { 
    user: req.user, 
    reminder 
  });
});

app.post('/reminders/:id', checkAuth, fetchUserId, async (req, res) => {
  const { id } = req.params;
  const { title, description, event_date, reminder_date } = req.body;
  
  const { error } = await supabase
    .from('reminders')
    .update({
      title,
      description,
      event_date: new Date(event_date).toISOString(),
      reminder_date: new Date(reminder_date).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', req.userDbId);
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao atualizar lembrete');
  }
  
  res.redirect('/reminders');
});

app.post('/reminders/:id/complete', checkAuth, fetchUserId, async (req, res) => {
  const { id } = req.params;
  
  const { error } = await supabase
    .from('reminders')
    .update({
      is_completed: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', req.userDbId);
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao marcar lembrete como concluído');
  }
  
  res.redirect('/reminders');
});

app.post('/reminders/:id/cancel', checkAuth, fetchUserId, async (req, res) => {
  const { id } = req.params;
  
  const { error } = await supabase
    .from('reminders')
    .update({
      is_cancelled: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', req.userDbId);
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao cancelar lembrete');
  }
  
  res.redirect('/reminders');
});

app.post('/reminders/:id/delete', checkAuth, fetchUserId, async (req, res) => {
  const { id } = req.params;
  
  const { error } = await supabase
    .from('reminders')
    .delete()
    .eq('id', id)
    .eq('user_id', req.userDbId);
  
  if (error) {
    console.error(error);
    return res.status(500).send('Erro ao excluir lembrete');
  }
  
  res.redirect('/reminders');
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
