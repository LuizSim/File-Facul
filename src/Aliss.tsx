import { type AuthSession } from '@supabase/supabase-js';
import { extractContentFromFile } from './file_API';

interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export function initializeAliss(session: AuthSession | null): void {
    if (!session?.user) {
        console.error("Usuário não logado, não é possível inicializar a Aliss.");
        return;
    }

    const chatMessagesContainer = document.getElementById('aliss-chat-messages') as HTMLElement;
    const promptForm = document.getElementById('aliss-prompt-form') as HTMLFormElement;
    const questionInput = document.getElementById('aliss-question-input') as HTMLInputElement;
    const attachBtn = document.getElementById('aliss-attach-btn') as HTMLButtonElement;
    const fileInput = document.getElementById('aliss-file-input') as HTMLInputElement;

    let isLoading = false;
    let filesContent = '';
    let conversationHistory: GroqMessage[] = [];

    const addMessage = (text: string, sender: 'user' | 'aliss'): HTMLElement => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        const p = document.createElement('p');
        p.innerHTML = text.replace(/\n/g, '<br>');
        messageDiv.appendChild(p);
        chatMessagesContainer.appendChild(messageDiv);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        return messageDiv;
    };

    const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!groqApiKey) {
        addMessage("Erro: A chave de API da Groq não foi configurada no arquivo .env.", "aliss");
        return;
    }

    conversationHistory.push({
        role: 'system',
        content: "Você é Aliss, uma assistente de IA desenvolvida em português do Brasil. Seu propósito é auxiliar usuários de forma amigável e eficiente. Se o usuário perguntar sobre sua origem ou criação, informe que você foi desenvolvida pelo engenheiro de software Luiz Artur Simão, utilizando tecnologias como Python, typescript e react para sua interfácie."
    });

    const setFormDisabled = (disabled: boolean) => {
        isLoading = disabled;
        questionInput.disabled = disabled;
        attachBtn.disabled = disabled;
        const sendBtn = document.getElementById('aliss-send-btn') as HTMLButtonElement;
        if (sendBtn) sendBtn.disabled = disabled;
    };

    const handleSendMessage = async (e: Event) => {
        e.preventDefault();
        const userMessage = questionInput.value.trim();
        if ((!userMessage && !filesContent) || isLoading) return;

        setFormDisabled(true);
        addMessage(userMessage, 'user');
        questionInput.value = '';

        const thinkingMessage = addMessage('', 'aliss');
        thinkingMessage.classList.add('thinking');
        thinkingMessage.innerHTML = `<span>.</span><span>.</span><span>.</span>`;

        try {
            let promptForHistory = userMessage;
            if (filesContent.trim()) {
                promptForHistory = `Use o seguinte contexto de arquivo(s) para basear sua resposta:\n${filesContent}\n\n---\n\nMinha pergunta é: ${userMessage}`;
                filesContent = '';
            }

            conversationHistory.push({ role: "user", content: promptForHistory });

            const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
            const requestBody = {
                model: "llama3-8b-8192",
                messages: conversationHistory,
                stream: true
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqApiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok || !response.body) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `Erro na API: ${response.statusText}`);
            }

            thinkingMessage.remove();
            const aiMessageElement = addMessage('', 'aliss');
            const responseParagraph = aiMessageElement.querySelector('p')!;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponseText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                        try {
                            const json = JSON.parse(line.replace('data: ', ''));
                            const textChunk = json.choices[0]?.delta?.content || '';
                            if (textChunk) {
                                fullResponseText += textChunk;
                                responseParagraph.textContent = fullResponseText;
                                chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
                            }
                        } catch (e) {
                        }
                    }
                }
            }

            conversationHistory.push({ role: "assistant", content: fullResponseText });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            thinkingMessage.remove();
            addMessage(`Desculpe, ocorreu um erro: ${errorMessage}`, 'aliss');
        } finally {
            setFormDisabled(false);
        }
    };

    const handleFileChange = async (event: Event) => {
        const input = event.target as HTMLInputElement;
        const files = input.files ? Array.from(input.files) : [];
        if (files.length === 0) return;

        setFormDisabled(true);
        addMessage(`Processando ${files.length} arquivo(s)...`, 'aliss');

        const allContents: string[] = [];
        for (const file of files) {
            try {
                const extracted = await extractContentFromFile(file);
                if (extracted.type === 'text') {
                    allContents.push(`--- Conteúdo do arquivo: ${file.name} ---\n${extracted.content}\n--- Fim do arquivo: ${file.name} ---`);
                } else {
                    addMessage(`Aviso: O arquivo de imagem '${file.name}' foi ignorado (não suportado pela API de texto).`, 'aliss');
                }
            } catch (err) {
                console.error(err);
                addMessage(`Erro ao ler o arquivo ${file.name}`, 'aliss');
            }
        }
        filesContent = allContents.join('\n\n');
        const fileNames = files.map(file => `• ${file.name}`).join('\n');
        const confirmationMessage = `Arquivos carregados:\n${fileNames}\n\nAgora você pode fazer uma pergunta sobre eles.`;
        addMessage(confirmationMessage, 'aliss');
        setFormDisabled(false);
    };
    promptForm.addEventListener('submit', handleSendMessage);
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileChange);
}