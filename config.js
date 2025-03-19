// Configuration file for Vibe Coding application

export const CONFIG = {
    // Application settings
    app: {
        name: "Vibe Coding",
        version: "1.0.0",
        defaultTheme: "light"
    },
    
    // Editor settings
    editor: {
        defaultMode: "code", // "code" or "blocks"
        fontSize: 14,
        tabSize: 2,
        autoSave: true,
        autoSaveInterval: 30000, // milliseconds
        defaultLanguage: "javascript",
        languages: ["javascript", "html", "css", "json", "markdown"],
        themeOptions: ["vs", "vs-dark", "hc-black"],
        defaultTheme: "vs-dark"
    },
    
    // Preview settings
    preview: {
        autoRefresh: true,
        refreshDelay: 1000, // milliseconds
        defaultHeight: "40%" // Percentage of the editor area
    },
    
    // Collaboration settings
    collaboration: {
        maxCollaborators: 10,
        presenceRefreshRate: 1000 // milliseconds
    },
    
    // LLM Assistant settings
    assistant: {
        defaultContext: "You are a helpful coding assistant who provides concise and accurate advice.",
        suggestionInterval: 5000, // milliseconds for passive suggestion mode
        maxTokens: 1000,
        temperature: 0.7
    },
    
    // UI settings
    ui: {
        galleryProjectsPerPage: 12,
        maxProjectTitleLength: 50,
        maxProjectDescriptionLength: 200
    }
};

