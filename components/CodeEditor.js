let monacoEditor = null;

export default class CodeEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = Object.assign({
            language: 'javascript',
            theme: 'vs-dark',
            fontSize: 14,
            automaticLayout: true,
            minimap: {
                enabled: true
            },
            wordWrap: 'on',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            tabSize: 2,
            value: ''
        }, options);
        
        this.editor = null;
        this.room = options.room;
        this.projectId = options.projectId;
        this.currentFile = 'js'; // Default to JS file
        this.collaborationEnabled = false;
        this.collaborators = {};
        this.decorations = [];
        
        this._init();
    }
    
    async _init() {
        // Load Monaco editor
        await this._loadMonaco();
        
        // Create editor
        this.editor = monaco.editor.create(this.container, this.options);
        
        // Setup file switching
        this._setupFileSwitching();
        
        // Setup realtime collaboration if requested
        if (this.options.collaboration && this.room) {
            this._setupCollaboration();
        }
        
        // Setup auto-save if enabled
        if (this.options.autoSave) {
            this._setupAutoSave();
        }
    }
    
    async _loadMonaco() {
        return new Promise((resolve) => {
            if (window.monaco) {
                resolve(window.monaco);
                return;
            }
            
            require.config({
                paths: {
                    'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs'
                }
            });
            
            require(['vs/editor/editor.main'], () => {
                resolve(window.monaco);
            });
        });
    }
    
    _setupFileSwitching() {
        // Add event listeners for file tabs
        document.querySelectorAll('.file-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const fileType = e.target.dataset.file;
                this.switchFile(fileType);
            });
        });
    }
    
    switchFile(fileType) {
        // Save current file content
        this._saveCurrentFile();
        
        // Update current file
        this.currentFile = fileType;
        
        // Update editor language
        const languageMap = {
            'html': 'html',
            'css': 'css',
            'js': 'javascript'
        };
        
        monaco.editor.setModelLanguage(
            this.editor.getModel(),
            languageMap[fileType] || 'javascript'
        );
        
        // Load file content
        this._loadFileContent();
        
        // Update active tab
        document.querySelectorAll('.file-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.file === fileType) {
                tab.classList.add('active');
            }
        });
    }
    
    _loadFileContent() {
        if (!this.projectId) return;
        
        // Fetch the latest project data
        const projects = this.room.collection('project').filter({ id: this.projectId }).getList();
        if (projects && projects.length > 0) {
            const project = projects[0];
            
            // Get content based on file type
            const contentMap = {
                'html': project.code?.html || '',
                'css': project.code?.css || '',
                'js': project.code?.js || ''
            };
            
            // Set editor value
            this.editor.setValue(contentMap[this.currentFile] || '');
        }
    }
    
    _saveCurrentFile() {
        if (!this.projectId) return;
        
        const content = this.editor.getValue();
        
        // Fetch the latest project data
        const projects = this.room.collection('project').filter({ id: this.projectId }).getList();
        if (projects && projects.length > 0) {
            const project = projects[0];
            
            // Create an updated code object
            const code = { ...(project.code || {}) };
            code[this.currentFile] = content;
            
            // Update the project
            this.room.collection('project').update(this.projectId, { code });
        }
    }
    
    _setupCollaboration() {
        this.collaborationEnabled = true;
        
        // Set up presence for cursor position
        this.editor.onDidChangeCursorPosition((e) => {
            if (this.room) {
                const position = e.position;
                this.room.party.updatePresence({
                    file: this.currentFile,
                    position: {
                        lineNumber: position.lineNumber,
                        column: position.column
                    },
                    selections: this.editor.getSelections().map(s => ({
                        startLineNumber: s.startLineNumber,
                        startColumn: s.startColumn,
                        endLineNumber: s.endLineNumber,
                        endColumn: s.endColumn
                    }))
                });
            }
        });
        
        // Listen for content changes
        this.editor.onDidChangeModelContent((e) => {
            // Only send changes if they were made by the user (not by collaboration sync)
            if (!this._isApplyingExternalChanges) {
                const edits = e.changes.map(change => ({
                    range: change.range,
                    text: change.text,
                    file: this.currentFile
                }));
                
                this.room.send({
                    type: "code-edit",
                    edits,
                    file: this.currentFile
                });
            }
        });
        
        // Handle incoming code edits
        this.room.onmessage = (event) => {
            const data = event.data;
            if (data.type === "code-edit" && data.file === this.currentFile) {
                this._applyExternalChanges(data.edits);
            }
        };
        
        // Subscribe to presence changes to show collaborator cursors
        this.room.party.subscribePresence((presence) => {
            this._updateCollaboratorCursors(presence);
        });
    }
    
    _applyExternalChanges(edits) {
        this._isApplyingExternalChanges = true;
        
        this.editor.executeEdits(
            "collaboration", 
            edits.map(edit => ({
                range: edit.range,
                text: edit.text,
                forceMoveMarkers: true
            }))
        );
        
        this._isApplyingExternalChanges = false;
    }
    
    _updateCollaboratorCursors(presence) {
        // Clear existing decorations
        this.decorations = this.editor.deltaDecorations(this.decorations, []);
        
        const newDecorations = [];
        const clientId = this.room.party.client.id;
        
        // Add decorations for each collaborator
        for (const peerId in presence) {
            // Skip own cursor
            if (peerId === clientId) continue;
            
            const peerPresence = presence[peerId];
            const peerInfo = this.room.party.peers[peerId];
            
            // Only show cursors for users looking at the same file
            if (peerPresence.file === this.currentFile && peerPresence.position) {
                // Add cursor decoration
                newDecorations.push({
                    range: new monaco.Range(
                        peerPresence.position.lineNumber,
                        peerPresence.position.column,
                        peerPresence.position.lineNumber,
                        peerPresence.position.column
                    ),
                    options: {
                        className: 'collaborator-cursor',
                        hoverMessage: { value: peerInfo.username || 'Collaborator' },
                        zIndex: 10,
                        beforeContentClassName: `collaborator-cursor collaborator-cursor-${peerId}`,
                        // Add dynamic style for cursor color
                        after: {
                            content: '',
                            inlineClassName: `collaborator-name collaborator-name-${peerId}`
                        }
                    }
                });
                
                // Add selection decorations if available
                if (peerPresence.selections) {
                    peerPresence.selections.forEach(selection => {
                        newDecorations.push({
                            range: new monaco.Range(
                                selection.startLineNumber,
                                selection.startColumn,
                                selection.endLineNumber,
                                selection.endColumn
                            ),
                            options: {
                                className: `collaborator-selection collaborator-selection-${peerId}`
                            }
                        });
                    });
                }
                
                // Add dynamic styles for this collaborator
                this._addCollaboratorStyle(peerId, this._getRandomColor(peerId));
            }
        }
        
        // Apply decorations
        this.decorations = this.editor.deltaDecorations(this.decorations, newDecorations);
    }
    
    _addCollaboratorStyle(peerId, color) {
        // Remove existing style element for this peer
        const existingStyle = document.getElementById(`collaborator-style-${peerId}`);
        if (existingStyle) {
            existingStyle.remove();
        }
        
        // Create style element
        const style = document.createElement('style');
        style.id = `collaborator-style-${peerId}`;
        style.innerHTML = `
            .collaborator-cursor-${peerId}::before {
                content: '';
                position: absolute;
                display: block;
                width: 2px;
                height: 18px;
                background-color: ${color};
                z-index: 10;
            }
            .collaborator-name-${peerId}::after {
                content: attr(data-name);
                position: absolute;
                top: -18px;
                left: 0;
                font-size: 12px;
                background-color: ${color};
                color: white;
                padding: 0 4px;
                border-radius: 2px;
                white-space: nowrap;
            }
            .collaborator-selection-${peerId} {
                background-color: ${color}33;
            }
        `;
        document.head.appendChild(style);
    }
    
    _getRandomColor(seed) {
        // Generate a deterministic color based on the peer ID
        const hash = Array.from(seed).reduce((acc, char) => {
            return ((acc << 5) - acc) + char.charCodeAt(0) | 0;
        }, 0);
        
        // Use a predefined set of colors for better visibility
        const colors = [
            '#FF5733', '#33FF57', '#3357FF', '#F3FF33', 
            '#FF33F3', '#33FFF3', '#FF8033', '#8033FF'
        ];
        
        return colors[Math.abs(hash) % colors.length];
    }
    
    _setupAutoSave() {
        setInterval(() => {
            this._saveCurrentFile();
        }, this.options.autoSaveInterval || 30000);
    }
    
    getValue() {
        return this.editor.getValue();
    }
    
    setValue(value) {
        this.editor.setValue(value);
    }
    
    dispose() {
        if (this.editor) {
            this.editor.dispose();
        }
    }
}

