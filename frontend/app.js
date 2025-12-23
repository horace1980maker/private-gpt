// ===== Configuration =====
const API_BASE = '';  // Same origin
let currentMode = 'rag';
let currentLanguage = 'en';
let chatHistory = [];

// ===== DOM Elements =====
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const fileInput = document.getElementById('file-input');
const uploadZone = document.getElementById('upload-zone');
const filesList = document.getElementById('files-list');
const clearChatBtn = document.getElementById('clear-chat-btn');
const deleteAllBtn = document.getElementById('delete-all-btn');
const sendBtn = document.getElementById('send-btn');

// ===== Translations =====
const translations = {
    en: {
        welcomeTitle: 'Welcome to PrivateGPT',
        welcomeText: 'Your private MEAL Expert. Upload documents and ask questions.',
        placeholder: 'Ask a question about MEAL, indicators, or your documents...',
        noFiles: 'No files uploaded yet',
        uploading: 'Uploading...',
        thinking: 'Thinking...',
    },
    es: {
        welcomeTitle: 'Bienvenido a PrivateGPT',
        welcomeText: 'Tu experto MEAL privado. Sube documentos y haz preguntas.',
        placeholder: 'Haz una pregunta sobre MEAL, indicadores, o tus documentos...',
        noFiles: 'No hay archivos cargados',
        uploading: 'Subiendo...',
        thinking: 'Pensando...',
    }
};

// ===== System Prompts =====
const systemPrompts = {
    rag: `You are a Senior MEAL Expert. Answer questions based on the provided context.
IMPORTANT: Respond in the same language the user writes in.`,
    basic: `You are a Senior MEAL Expert and RBM Specialist.
IMPORTANT: Respond in the same language the user writes in.`,
    search: null,  // Search mode doesn't use chat
    summarize: `Summarize the provided context comprehensively.
IMPORTANT: Respond in the same language the user writes in.`
};

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    loadIngestedFiles();
    setupEventListeners();
    autoResizeTextarea();
});

function setupEventListeners() {
    // Chat form submit
    chatForm.addEventListener('submit', handleChatSubmit);

    // Mode selector
    document.querySelectorAll('#mode-selector input').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentMode = e.target.value;
            document.querySelectorAll('#mode-selector .radio-option').forEach(opt => {
                opt.classList.remove('active');
            });
            e.target.closest('.radio-option').classList.add('active');
        });
    });

    // Language selector
    document.querySelectorAll('#language-selector input').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentLanguage = e.target.value;
            document.querySelectorAll('#language-selector .radio-option').forEach(opt => {
                opt.classList.remove('active');
            });
            e.target.closest('.radio-option').classList.add('active');
            updateUILanguage();
        });
    });

    // File upload
    fileInput.addEventListener('change', handleFileUpload);
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', handleFileDrop);

    // Clear chat
    clearChatBtn.addEventListener('click', clearChat);

    // Delete all files
    deleteAllBtn.addEventListener('click', deleteAllFiles);

    // Auto-resize textarea
    chatInput.addEventListener('input', autoResizeTextarea);
}

function autoResizeTextarea() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
}

function updateUILanguage() {
    const t = translations[currentLanguage];

    // Update placeholder
    chatInput.placeholder = t.placeholder;

    // Update all translatable elements
    document.querySelectorAll('[data-en]').forEach(el => {
        el.textContent = el.getAttribute(`data-${currentLanguage}`) || el.getAttribute('data-en');
    });

    // Update welcome message if visible
    const welcomeTitle = document.querySelector('.welcome-message h2');
    const welcomeText = document.querySelector('.welcome-message p');
    if (welcomeTitle) welcomeTitle.textContent = t.welcomeTitle;
    if (welcomeText) welcomeText.textContent = t.welcomeText;
}

// ===== Chat Functions =====
async function handleChatSubmit(e) {
    e.preventDefault();

    const message = chatInput.value.trim();
    if (!message) return;

    // Clear input
    chatInput.value = '';
    autoResizeTextarea();

    // Remove welcome message if present
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Add user message
    appendMessage('user', message);

    // Handle different modes
    if (currentMode === 'search') {
        await handleSearch(message);
    } else {
        await handleChat(message);
    }
}

function appendMessage(role, content, sources = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = formatMessage(content);

    if (sources && sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'sources';
        sourcesDiv.innerHTML = '<strong>Sources:</strong><br>' +
            sources.map(s => `📄 ${s.file_name || s.doc_metadata?.file_name || 'Document'}`).join('<br>');
        messageDiv.appendChild(sourcesDiv);
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messageDiv;
}

function formatMessage(content) {
    // Basic markdown-like formatting
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>')
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
}

async function handleChat(message) {
    const t = translations[currentLanguage];

    // Add thinking message
    const thinkingDiv = appendMessage('assistant', t.thinking);
    thinkingDiv.classList.add('loading');

    // Build messages array
    const messages = [];

    // Add system prompt based on mode
    const systemPrompt = systemPrompts[currentMode];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    // Add history (last 10 messages)
    chatHistory.slice(-10).forEach(msg => {
        messages.push(msg);
    });

    // Add current message
    messages.push({ role: 'user', content: message });

    try {
        const response = await fetch(`${API_BASE}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: messages,
                use_context: currentMode === 'rag' || currentMode === 'summarize',
                include_sources: true,
                stream: true
            })
        });

        if (!response.ok) throw new Error('Chat request failed');

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let sources = [];

        thinkingDiv.classList.remove('loading');
        thinkingDiv.innerHTML = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices?.[0]?.delta?.content) {
                            fullContent += parsed.choices[0].delta.content;
                            thinkingDiv.innerHTML = formatMessage(fullContent);
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        }
                        if (parsed.sources) {
                            sources = parsed.sources;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }

        // Add sources if any
        if (sources.length > 0) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'sources';
            sourcesDiv.innerHTML = '<strong>Sources:</strong><br>' +
                sources.map(s => `📄 ${s.document?.doc_metadata?.file_name || 'Document'}`).join('<br>');
            thinkingDiv.appendChild(sourcesDiv);
        }

        // Save to history
        chatHistory.push({ role: 'user', content: message });
        chatHistory.push({ role: 'assistant', content: fullContent });

    } catch (error) {
        console.error('Chat error:', error);
        thinkingDiv.classList.remove('loading');
        thinkingDiv.innerHTML = `<span style="color: var(--danger)">Error: ${error.message}</span>`;
    }
}

async function handleSearch(message) {
    const t = translations[currentLanguage];
    const thinkingDiv = appendMessage('assistant', t.thinking);
    thinkingDiv.classList.add('loading');

    try {
        const response = await fetch(`${API_BASE}/v1/chunks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: message,
                limit: 5,
                prev_next_chunks: 0
            })
        });

        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        thinkingDiv.classList.remove('loading');

        if (data.data && data.data.length > 0) {
            thinkingDiv.innerHTML = data.data.map((chunk, i) =>
                `<strong>${i + 1}. ${chunk.document?.doc_metadata?.file_name || 'Document'}</strong><br>` +
                `<p>${chunk.text.substring(0, 300)}...</p><hr>`
            ).join('');
        } else {
            thinkingDiv.innerHTML = currentLanguage === 'es'
                ? 'No se encontraron resultados.'
                : 'No results found.';
        }

    } catch (error) {
        console.error('Search error:', error);
        thinkingDiv.classList.remove('loading');
        thinkingDiv.innerHTML = `<span style="color: var(--danger)">Error: ${error.message}</span>`;
    }
}

function clearChat() {
    chatMessages.innerHTML = `
        <div class="welcome-message">
            <h2>${translations[currentLanguage].welcomeTitle}</h2>
            <p>${translations[currentLanguage].welcomeText}</p>
        </div>
    `;
    chatHistory = [];
}

// ===== File Functions =====
async function loadIngestedFiles() {
    try {
        const response = await fetch(`${API_BASE}/v1/ingest/list`);
        if (!response.ok) throw new Error('Failed to load files');

        const data = await response.json();
        renderFilesList(data.data || []);

    } catch (error) {
        console.error('Load files error:', error);
    }
}

function renderFilesList(files) {
    if (files.length === 0) {
        filesList.innerHTML = `<li class="file-item" style="color: var(--text-muted)">
            ${translations[currentLanguage].noFiles}
        </li>`;
        return;
    }

    // Group by file name
    const fileNames = [...new Set(files.map(f => f.doc_metadata?.file_name).filter(Boolean))];

    filesList.innerHTML = fileNames.map(name => `
        <li class="file-item" data-filename="${name}">
            <span class="file-name">📄 ${name}</span>
            <button class="delete-btn" onclick="deleteFile('${name}')">🗑️</button>
        </li>
    `).join('');
}

async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length) return;

    for (const file of files) {
        await uploadFile(file);
    }

    fileInput.value = '';
    await loadIngestedFiles();
}

async function handleFileDrop(e) {
    e.preventDefault();
    uploadZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    for (const file of files) {
        await uploadFile(file);
    }

    await loadIngestedFiles();
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/v1/ingest/file`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        console.log(`Uploaded: ${file.name}`);

    } catch (error) {
        console.error('Upload error:', error);
        alert(`Failed to upload ${file.name}: ${error.message}`);
    }
}

async function deleteFile(filename) {
    try {
        // Get all doc IDs for this file
        const listResponse = await fetch(`${API_BASE}/v1/ingest/list`);
        const listData = await listResponse.json();

        const docsToDelete = listData.data.filter(
            doc => doc.doc_metadata?.file_name === filename
        );

        for (const doc of docsToDelete) {
            await fetch(`${API_BASE}/v1/ingest/${doc.doc_id}`, {
                method: 'DELETE'
            });
        }

        await loadIngestedFiles();

    } catch (error) {
        console.error('Delete error:', error);
    }
}

async function deleteAllFiles() {
    if (!confirm(currentLanguage === 'es'
        ? '¿Estás seguro de eliminar todos los archivos?'
        : 'Are you sure you want to delete all files?')) {
        return;
    }

    try {
        const listResponse = await fetch(`${API_BASE}/v1/ingest/list`);
        const listData = await listResponse.json();

        for (const doc of listData.data) {
            await fetch(`${API_BASE}/v1/ingest/${doc.doc_id}`, {
                method: 'DELETE'
            });
        }

        await loadIngestedFiles();

    } catch (error) {
        console.error('Delete all error:', error);
    }
}
