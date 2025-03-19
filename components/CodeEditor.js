import { useEffect, useRef } from 'react';

export default function CodeEditor({ project, room, projectId }) {
    const editorContainerRef = useRef(null);
    const editorInstanceRef = useRef(null);
    const collaborationEnabledRef = useRef(false);
    const currentFileRef = useRef('js'); // Default to JS file
    const collaboratorsRef = useRef({});
    const decorationsRef = useRef([]);
    const isApplyingExternalChangesRef = useRef(false);

    useEffect(() => {
        if (!editorContainerRef.current || !room || !project) return;

        let isLoaded = false;

        const loadEditor = async () => {
            if (window.monaco) {
                initializeEditor();
                return;
            }

            require.config({
                paths: {
                    'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs'
                }
            });

            require(['vs/editor/editor.main'], () => {
                initializeEditor();
            });
        };

        const initializeEditor = () => {
            if (isLoaded) return;
            isLoaded = true;

            const options = {
                value: project.code?.js || '// Your code here',
                language: 'javascript',
                theme: 'vs-dark',
                fontSize: 14,
                automaticLayout: true,
                minimap: { enabled: true },
                wordWrap: 'on',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                tabSize: 2,
            };

            const editor = monaco.editor.create(editorContainerRef.current, options);

            editorInstanceRef.current = editor;

            // Setup collaboration if needed
            if (room) {
                setupCollaboration(editor);
            }

            // Setup file switching
            setupFileSwitching(editor);

            // Setup auto-save if enabled
            setupAutoSave(editor);
        };

        const setupCollaboration = (editor) => {
            collaborationEnabledRef.current = true;

            // Set up presence for cursor position
            editor.onDidChangeCursorPosition((e) => {
                if (room) {
                    const position = e.position;
                    room.party.updatePresence({
                        file: currentFileRef.current,
                        position: {
                            lineNumber: position.lineNumber,
                            column: position.column
                        },
                        selections: editor.getSelections().map(s => ({
                            startLineNumber: s.startLineNumber,
                            startColumn: s.startColumn,
                            endLineNumber: s.endLineNumber,
                            endColumn: s.endColumn
                        }))
                    });
                }
            });

            // Listen for content changes
            editor.onDidChangeModelContent((e) => {
                // Only send changes if they were made by the user (not by collaboration sync)
                if (!isApplyingExternalChangesRef.current) {
                    const edits = e.changes.map(change => ({
                        range: change.range,
                        text: change.text,
                        file: currentFileRef.current
                    }));

                    room.send({
                        type: "code-edit",
                        edits,
                        file: currentFileRef.current
                    });
                }
            });

            // Handle incoming code edits
            room.onmessage = (event) => {
                const data = event.data;
                if (data.type === "code-edit" && data.file === currentFileRef.current) {
                    applyExternalChanges(editor, data.edits);
                }
            };

            // Subscribe to presence changes to show collaborator cursors
            room.party.subscribePresence((presence) => {
                updateCollaboratorCursors(editor, presence);
            });
        };

        const setupFileSwitching = (editor) => {
            // Add event listeners for file tabs
            document.querySelectorAll('.file-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const fileType = e.target.dataset.file;
                    switchFile(editor, fileType);
                });
            });
        };

        const switchFile = (editor, fileType) => {
            // Save current file content
            saveCurrentFile(editor);

            // Update current file
            currentFileRef.current = fileType;

            // Update editor language
            const languageMap = {
                'html': 'html',
                'css': 'css',
                'js': 'javascript'
            };

            monaco.editor.setModelLanguage(
                editor.getModel(),
                languageMap[fileType] || 'javascript'
            );

            // Load file content
            loadFileContent(editor);

            // Update active tab
            document.querySelectorAll('.file-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.file === fileType) {
                    tab.classList.add('active');
                }
            });
        };

        const loadFileContent = (editor) => {
            if (!projectId) return;

            // Fetch the latest project data
            const projects = room.collection('project').filter({ id: projectId }).getList();
            if (projects && projects.length > 0) {
                const project = projects[0];

                // Get content based on file type
                const contentMap = {
                    'html': project.code?.html || '',
                    'css': project.code?.css || '',
                    'js': project.code?.js || ''
                };

                // Set editor value
                editor.setValue(contentMap[currentFileRef.current] || '');
            }
        };

        const saveCurrentFile = (editor) => {
            if (!projectId) return;

            const content = editor.getValue();

            // Fetch the latest project data
            const projects = room.collection('project').filter({ id: projectId }).getList();
            if (projects && projects.length > 0) {
                const project = projects[0];

                // Create an updated code object
                const code = { ...(project.code || {}) };
                code[currentFileRef.current] = content;

                // Update the project
                room.collection('project').update(projectId, { code });
            }
        };

        const applyExternalChanges = (editor, edits) => {
            isApplyingExternalChangesRef.current = true;

            editor.executeEdits(
                "collaboration", 
                edits.map(edit => ({
                    range: edit.range,
                    text: edit.text,
                    forceMoveMarkers: true
                }))
            );

            isApplyingExternalChangesRef.current = false;
        };

        const updateCollaboratorCursors = (editor, presence) => {
            // Clear existing decorations
            decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);

            const newDecorations = [];
            const clientId = room.party.client.id;

            // Add decorations for each collaborator
            for (const peerId in presence) {
                // Skip own cursor
                if (peerId === clientId) continue;

                const peerPresence = presence[peerId];
                const peerInfo = room.party.peers[peerId];

                // Only show cursors for users looking at the same file
                if (peerPresence.file === currentFileRef.current && peerPresence.position) {
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
                    addCollaboratorStyle(peerId, getRandomColor(peerId));
                }
            }

            // Apply decorations
            decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
        };

        const addCollaboratorStyle = (peerId, color) => {
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
        };

        const getRandomColor = (seed) => {
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
        };

        const setupAutoSave = (editor) => {
            setInterval(() => {
                saveCurrentFile(editor);
            }, 30000);
        };

        loadEditor();

        return () => {
            if (editorInstanceRef.current) {
                editorInstanceRef.current.dispose();
            }
        };
    }, [project, room, projectId]);

    return (
        <div 
            ref={editorContainerRef} 
            style={{ width: '100%', height: '100%' }}
        />
    );
}