// Initialize Supabase client
const SUPABASE_URL = 'https://zmljydpxsbixyihrbxko.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbGp5ZHB4c2JpeHlpaHJieGtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NDYyMTMsImV4cCI6MjA3NzEyMjIxM30.9l9G7UqnHTUKfU69son9LcPA220TR4ABZi1L-IvmkWg';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Authentication functions
async function signUpUser(email, password, username) {
  try {
    const { user, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username
        }
      }
    });

    if (error) throw error;

    // Create a profile for the user
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        {
          id: user.id,
          username,
          avatar_url: null,
          online: true
        }
      ]);

    if (profileError) throw profileError;
    return { user, error: null };
  } catch (error) {
    console.error('Error signing up:', error.message);
    return { user: null, error };
  }
}

async function signInUser(email, password) {
  try {
    const { user, error } = await supabase.auth.signIn({ email, password });
    if (error) throw error;

    // Update online status
    await supabase
      .from('profiles')
      .update({ online: true })
      .match({ id: user.id });

    return { user, error: null };
  } catch (error) {
    console.error('Error signing in:', error.message);
    return { user: null, error };
  }
}

async function signOutUser() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Update online status before signing out
    const user = supabase.auth.user();
    if (user) {
      await supabase
        .from('profiles')
        .update({ online: false })
        .match({ id: user.id });
    }
  } catch (error) {
    console.error('Error signing out:', error.message);
  }
}

// Real-time subscriptions
function subscribeToMessages() {
  const messagesSubscription = supabase
    .from('messages')
    .on('INSERT', payload => {
      appendMessage(payload.new);
    })
    .subscribe();

  return messagesSubscription;
}

// Load messages from Supabase with user info
async function loadMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      profiles:sender_id (username, avatar_url)
    `)
    .order('created_at', { ascending: true })
    .limit(100);
  
  if (error) {
    console.error('Error loading messages:', error);
    return;
  }

  const messagesContainer = document.querySelector('.messages');
  messagesContainer.innerHTML = ''; // Clear existing messages

  const currentUser = supabase.auth.user();

  data.forEach(message => {
    appendMessage(message, currentUser?.id);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Append a single message to the chat
function appendMessage(message, currentUserId = null) {
  const messagesContainer = document.querySelector('.messages');
  const newMsg = document.createElement('div');
  newMsg.classList.add('message-item');
  
  const isSelf = currentUserId && message.sender_id === currentUserId;
  if (isSelf) newMsg.classList.add('self');

  const senderName = message.profiles?.username || 'Unknown User';
  const messageTime = new Date(message.created_at).toLocaleTimeString();

  newMsg.innerHTML = `
    <div class="message-header">
      <span class="sender">${senderName}</span>
      <span class="timestamp">${messageTime}</span>
    </div>
    <div class="message-content">${message.content}</div>
  `;
  
  messagesContainer.appendChild(newMsg);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Save message to Supabase
async function sendMessageToDb(sender, text) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{ sender, content: text }]);
  
  if (error) {
    console.error('Error sending message:', error);
    return false;
  }
  return true;
}

// Track online users
async function initializeOnlineUsers() {
  const onlineUsersSubscription = supabase
    .from('profiles')
    .on('UPDATE', payload => {
      updateOnlineUsersList();
    })
    .subscribe();

  await updateOnlineUsersList();
  return onlineUsersSubscription;
}

async function updateOnlineUsersList() {
  const { data: onlineUsers, error } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('online', true);

  if (error) {
    console.error('Error fetching online users:', error);
    return;
  }

  const onlineList = document.getElementById('online-users-list');
  onlineList.innerHTML = '';

  onlineUsers.forEach(user => {
    const li = document.createElement('li');
    li.className = 'online-user';
    li.innerHTML = `
      <div class="user-avatar small">
        <img src="${user.avatar_url || 'assets/default-avatar.png'}" alt="${user.username}">
      </div>
      <span>${user.username}</span>
      <span class="online-indicator"></span>
    `;
    onlineList.appendChild(li);
  });
}

// Initialize app with authentication check
document.addEventListener('DOMContentLoaded', async () => {
  const loginCard = document.getElementById('login-card');
  const signupCard = document.getElementById('signup-card');
  const dashboardCard = document.getElementById('dashboard-card');
  const showSignupLink = document.getElementById('show-signup');
  const showLoginLink = document.getElementById('show-login');
  
  // Set up authentication listeners
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      const user = session.user;
      document.getElementById('current-username').textContent = user.user_metadata.username || user.email;
      showCard(dashboardCard);
      loadMessages();
      initializeOnlineUsers();
    } else if (event === 'SIGNED_OUT') {
      showCard(loginCard);
    }
  });
  const logoutBtn = document.getElementById('logout-btn');
  const chatSearch = document.getElementById('chat-search');
  const settingsBtn = document.getElementById('settings-btn');
  const chatMain = document.querySelector('.chat-main');
  const settingsMain = document.querySelector('.settings-main');

  // Show selected card
  const showCard = (cardToShow) => {
    [loginCard, signupCard, dashboardCard].forEach((card) => {
      if (card === cardToShow) {
        card.classList.add('active');
        card.classList.remove('hidden');
      } else {
        card.classList.remove('active');
        setTimeout(() => card.classList.add('hidden'), 400);
      }
    });
    adjustCardLayout();
  };

  // Resize logic
  const adjustCardLayout = () => {
    const isDashboard = dashboardCard.classList.contains('active');
    if (isDashboard) {
      dashboardCard.style.height = `${window.innerHeight - 40}px`;
    } else {
      const activeCard = document.querySelector('.card.active:not(#dashboard-card)');
      if (activeCard) {
        activeCard.style.maxHeight = `${window.innerHeight - 60}px`;
      }
    }
  };

  window.addEventListener('resize', adjustCardLayout);

  // Navigation
  showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    showCard(signupCard);
  });

  showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    showCard(loginCard);
  });

  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    showCard(loginCard);
  });

  // Login simulation
  loginCard.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    alert('Login successful (demo)');
    showCard(dashboardCard);
    // Load messages when dashboard is shown
    await loadMessages();
  });

  // Signup simulation
  signupCard.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Signup successful (demo)');
    showCard(loginCard);
  });

  // Sending messages
  const sendMessage = async () => {
    const input = dashboardCard.querySelector('.message-input input');
    const text = input.value.trim();
    if (text) {
      // Save to Supabase first
      const success = await sendMessageToDb('You', text);
      if (!success) {
        console.error('Failed to save message');
        return;
      }

      // Update UI
      const messages = dashboardCard.querySelector('.messages');
      const newMsg = document.createElement('div');
      newMsg.classList.add('message-item', 'self');
      newMsg.innerHTML = `<span class="sender">You:</span> ${text}`;
      messages.appendChild(newMsg);
      input.value = '';
      messages.scrollTop = messages.scrollHeight;
    }
  };

  dashboardCard.querySelector('.message-input button').addEventListener('click', sendMessage);
  dashboardCard.querySelector('.message-input input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  // Chat search focus and blur handlers
  if (chatSearch) {
    const chatList = document.querySelector('.chat-list');
    
    chatSearch.addEventListener('focus', () => {
      chatList.classList.add('visible');
    });

    // Optional: Hide list when clicking outside search and chat list
    document.addEventListener('click', (e) => {
      if (!chatSearch.contains(e.target) && !chatList.contains(e.target)) {
        chatList.classList.remove('visible');
      }
    });

    // Search functionality
    chatSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const chats = dashboardCard.querySelectorAll('.chat-item');
      chats.forEach((chat) => {
        const name = chat.textContent.toLowerCase();
        chat.style.display = name.includes(query) ? '' : 'none';
      });
    });
  }

  // Switch active chat
  const chatItems = dashboardCard.querySelectorAll('.chat-item');
  chatItems.forEach((item) => {
    item.addEventListener('click', () => {
      chatItems.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Settings functionality with smooth transitions
  settingsBtn.addEventListener('click', () => {
    // If settings are hidden, show them with a delay
    if (settingsMain.classList.contains('hidden')) {
      chatMain.classList.add('hidden');
      setTimeout(() => {
        settingsMain.classList.remove('hidden');
        // add body class to trigger background blur/dim
        document.body.classList.add('settings-open');
      }, 50);
    } else {
      // If settings are visible, hide them first
      settingsMain.classList.add('hidden');
      setTimeout(() => {
        chatMain.classList.remove('hidden');
        // remove blur when settings closed
        document.body.classList.remove('settings-open');
      }, 300);
    }
    settingsBtn.classList.toggle('active');
  });

  // Settings close button (for mobile full-screen experience)
  const settingsCloseBtn = document.getElementById('settings-close');
  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // reuse the settings button handler to toggle
      settingsBtn.click();
    });
  }

  // Dark mode toggle with smooth transition
  const darkModeToggle = document.getElementById('dark-mode');
  const root = document.documentElement;
  
  // Check for saved dark mode preference
  const savedDarkMode = localStorage.getItem('darkMode') === 'true';
  darkModeToggle.checked = savedDarkMode;
  if (savedDarkMode) {
    document.body.classList.add('dark-mode');
  }
  
  darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkModeToggle.checked);
  });

  // Logout with loading animation
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('hidden');
    
    // Simulate logout process
    setTimeout(() => {
      loadingOverlay.classList.add('hidden');
      showCard(loginCard);
      // Reset settings view
      settingsMain.classList.add('hidden');
      chatMain.classList.remove('hidden');
      settingsBtn.classList.remove('active');
      // ensure any blur state is removed on logout
      document.body.classList.remove('settings-open');
    }, 2000);
  });

  // Browser notifications
  const notificationToggle = document.getElementById('browser-notifications');
  notificationToggle.addEventListener('change', () => {
    if (notificationToggle.checked) {
      Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') {
          notificationToggle.checked = true;
        } else {
          notificationToggle.checked = false;
          alert('Please allow notifications to enable this feature.');
        }
      });
    }
  });

  // Initial view
  showCard(loginCard);
});
