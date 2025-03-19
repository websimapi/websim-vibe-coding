const { useState, useEffect, useRef } = React;

export default function LLMAssistant({ isOpen, onToggle, project, editorMode }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    
    useEffect(() => {
        // Scroll to bottom whenever messages change
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);
    
    const handleSendMessage = async () => {
        if (!input.trim()) return;
        
        // Add user message to chat
        const userMessage = {
            role: 'user',
            content: input
        };
        
        setMessages(prevMessages => [...prevMessages, userMessage]);
        setInput('');
        setIsTyping(true);
        
        try {
            // Get current editing context
            const context = await getProjectContext(project);
            
            // Create conversation history
            const conversationHistory = [
                {
                    role: 'system',
                    content: `You are an AI assistant for the Vibe Coding platform. You help users with coding questions and provide suggestions.
                    You're currently assisting with a project titled "${project?.title || 'Untitled Project'}".
                    ${context ? `Here's the current state of the project:\n${context}` : ''}
                    Keep responses concise and focused on helping the user with their coding tasks.`
                },
                ...messages.slice(-10),
                userMessage
            ];
            
            // Send request to LLM
            const completion = await websim.chat.completions.create({
                messages: conversationHistory
            });
            
            // Add AI response to chat
            setMessages(prevMessages => [...prevMessages, completion]);
        } catch (error) {
            console.error('Error getting LLM response:', error);
            // Add error message
            setMessages(prevMessages => [
                ...prevMessages, 
                { 
                    role: 'assistant', 
                    content: "Sorry, I encountered an error while processing your request. Please try again."
                }
            ]);
        } finally {
            setIsTyping(false);
        }
    };
    
    const getProjectContext = async (project) => {
        if (!project) return '';
        
        // Get the current code content from the project
        const { code } = project;
        
        let context = '';
        
        if (code) {
            if (code.html) context += `HTML:\n${code.html}\n\n`;
            if (code.css) context += `CSS:\n${code.css}\n\n`;
            if (code.js) context += `JavaScript:\n${code.js}\n\n`;
        }
        
        return context;
    };
    
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };
    
    const handleSuggestion = async (type) => {
        let promptText = '';
        
        switch (type) {
            case 'fix':
                promptText = "Please review my code and suggest fixes for any bugs or issues:";
                break;
            case 'optimize':
                promptText = "Please suggest ways to optimize my code for better performance:";
                break;
            case 'explain':
                promptText = "Please explain how my code works in a simple way:";
                break;
            case 'idea':
                promptText = "Please suggest a creative idea to enhance my project:";
                break;
            default:
                return;
        }
        
        setInput(promptText);
    };
    
    const generateAsset = async () => {
        try {
            // Set a default prompt
            const prompt = "Give me a prompt for generating an image asset that would fit well with my project.";
            
            // Add system message to chat
            setMessages(prevMessages => [
                ...prevMessages, 
                { 
                    role: 'user', 
                    content: "Can you help me generate an image asset for my project?"
                }
            ]);
            
            setIsTyping(true);
            
            // Get image generation suggestion from LLM
            const suggestion = await websim.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI assistant for the Vibe Coding platform. The user wants to generate an image asset.
                        Suggest a specific prompt that would work well for generating an image for their project titled "${project?.title || 'Untitled Project'}".
                        Make your suggestion detailed and specific to create a good image.`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });
            
            // Extract the suggested prompt
            const suggestedPrompt = suggestion.content;
            
            // Add AI suggestion to chat
            setMessages(prevMessages => [
                ...prevMessages, 
                { 
                    role: 'assistant', 
                    content: `${suggestedPrompt}\n\nGenerating image based on this prompt...`
                }
            ]);
            
            // Generate the image
            const result = await websim.imageGen({
                prompt: suggestedPrompt,
                aspect_ratio: "1:1"
            });
            
            // Add image result to chat
            setMessages(prevMessages => [
                ...prevMessages, 
                { 
                    role: 'assistant', 
                    content: `Here's your generated image. You can right-click to save it or copy its URL to use in your project.\n\n![Generated Image](${result.url})`
                }
            ]);
        } catch (error) {
            console.error('Error generating asset:', error);
            // Add error message
            setMessages(prevMessages => [
                ...prevMessages, 
                { 
                    role: 'assistant', 
                    content: "Sorry, I encountered an error while generating the image. Please try again."
                }
            ]);
        } finally {
            setIsTyping(false);
        }
    };
    
    // Render message content (handling markdown, code blocks, etc.)
    const renderMessageContent = (content) => {
        // Simple markdown-like rendering
        // This is a placeholder - in a real app, use a proper markdown renderer
        const formattedContent = content
            // Handle code blocks
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Handle inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Handle bold
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // Handle italic
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            // Handle links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            // Handle image links
            .replace(/!\[([^\]]+)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="message-image" />')
            // Handle newlines
            .replace(/\n/g, '<br>');
        
        return <div dangerouslySetInnerHTML={{ __html: formattedContent }} />;
    };
    
    return (
        <div className={`llm-panel ${isOpen ? 'open' : ''}`}>
            <div className="llm-header">
                <h3>AI Assistant</h3>
                <button onClick={onToggle} className="btn btn-icon">
                    <i className="mdi mdi-close"></i>
                </button>
            </div>
            
            <div className="llm-actions">
                <button 
                    className="btn btn-outline btn-sm" 
                    onClick={() => handleSuggestion('fix')}
                >
                    <i className="mdi mdi-bug"></i> Fix Issues
                </button>
                <button 
                    className="btn btn-outline btn-sm" 
                    onClick={() => handleSuggestion('optimize')}
                >
                    <i className="mdi mdi-rocket"></i> Optimize
                </button>
                <button 
                    className="btn btn-outline btn-sm" 
                    onClick={() => handleSuggestion('explain')}
                >
                    <i className="mdi mdi-information"></i> Explain
                </button>
                <button 
                    className="btn btn-outline btn-sm" 
                    onClick={() => handleSuggestion('idea')}
                >
                    <i className="mdi mdi-lightbulb"></i> Ideas
                </button>
                <button 
                    className="btn btn-outline btn-sm" 
                    onClick={generateAsset}
                >
                    <i className="mdi mdi-image"></i> Generate Asset
                </button>
            </div>
            
            <div className="llm-body">
                {messages.length === 0 ? (
                    <div className="empty-chat">
                        <div className="empty-chat-icon">
                            <i className="mdi mdi-robot"></i>
                        </div>
                        <h3>AI Assistant</h3>
                        <p>Ask me anything about coding or your project!</p>
                    </div>
                ) : (
                    messages.map((message, index) => (
                        <div 
                            key={index} 
                            className={`message ${message.role === 'user' ? 'user-message' : 'ai-message'}`}
                        >
                            <div className="message-avatar">
                                {message.role === 'user' ? (
                                    <i className="mdi mdi-account"></i>
                                ) : (
                                    <i className="mdi mdi-robot"></i>
                                )}
                            </div>
                            <div className="message-content">
                                {renderMessageContent(message.content)}
                            </div>
                        </div>
                    ))
                )}
                
                {isTyping && (
                    <div className="message ai-message">
                        <div className="message-avatar">
                            <i className="mdi mdi-robot"></i>
                        </div>
                        <div className="message-content typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} />
            </div>
            
            <div className="llm-input">
                <textarea 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)} 
                    onKeyDown={handleKeyDown}
                    placeholder="Ask the AI for help..."
                    rows={1}
                />
                <button 
                    className="btn btn-primary" 
                    onClick={handleSendMessage}
                >
                    <i className="mdi mdi-send"></i>
                </button>
            </div>
        </div>
    );
}

