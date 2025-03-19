import { useEffect, useRef } from 'react';

export default function BlocklyEditor({ project, room, projectId }) {
    const blocklyContainerRef = useRef(null);
    const workspaceRef = useRef(null);

    useEffect(() => {
        if (!blocklyContainerRef.current || !window.Blockly || !project) return;

        // Initialize Blockly
        const workspace = Blockly.inject(blocklyContainerRef.current, {
            toolbox: getDefaultToolbox(),
            grid: {
                spacing: 20,
                length: 3,
                colour: '#ccc',
                snap: true
            },
            trashcan: true,
            zoom: {
                controls: true,
                wheel: true,
                startScale: 1.0,
                maxScale: 3,
                minScale: 0.3,
                scaleSpeed: 1.2
            }
        });

        workspaceRef.current = workspace;

        // Load blocks from project if available
        if (project.blocks && project.blocks.xml) {
            try {
                const xml = Blockly.Xml.textToDom(project.blocks.xml);
                Blockly.Xml.domToWorkspace(xml, workspace);
            } catch (e) {
                console.error('Error loading blocks:', e);
            }
        }

        // Setup collaboration if needed
        if (room) {
            setupCollaboration(workspace, room, projectId, project);
        }

        return () => {
            if (workspaceRef.current) {
                workspaceRef.current.dispose();
            }
        };
    }, [project, room, projectId]);

    const getDefaultToolbox = () => {
        return {
            kind: 'categoryToolbox',
            contents: [
                {
                    kind: 'category',
                    name: 'Logic',
                    colour: 210,
                    contents: [
                        { kind: 'block', type: 'controls_if' },
                        { kind: 'block', type: 'logic_compare' },
                        { kind: 'block', type: 'logic_operation' },
                        { kind: 'block', type: 'logic_negate' },
                        { kind: 'block', type: 'logic_boolean' }
                    ]
                },
                {
                    kind: 'category',
                    name: 'Loops',
                    colour: 120,
                    contents: [
                        { kind: 'block', type: 'controls_repeat_ext' },
                        { kind: 'block', type: 'controls_whileUntil' },
                        { kind: 'block', type: 'controls_for' },
                        { kind: 'block', type: 'controls_forEach' }
                    ]
                },
                {
                    kind: 'category',
                    name: 'Math',
                    colour: 230,
                    contents: [
                        { kind: 'block', type: 'math_number' },
                        { kind: 'block', type: 'math_arithmetic' },
                        { kind: 'block', type: 'math_single' },
                        { kind: 'block', type: 'math_random_int' }
                    ]
                },
                {
                    kind: 'category',
                    name: 'Text',
                    colour: 160,
                    contents: [
                        { kind: 'block', type: 'text' },
                        { kind: 'block', type: 'text_join' },
                        { kind: 'block', type: 'text_append' },
                        { kind: 'block', type: 'text_length' }
                    ]
                },
                {
                    kind: 'category',
                    name: 'Variables',
                    colour: 330,
                    custom: 'VARIABLE'
                },
                {
                    kind: 'category',
                    name: 'Functions',
                    colour: 290,
                    custom: 'PROCEDURE'
                },
                {
                    kind: 'category',
                    name: 'HTML',
                    colour: 20,
                    contents: [
                        { 
                            kind: 'block', 
                            type: 'html_element',
                            fields: {
                                TAG: 'div'
                            },
                            inputs: {
                                CONTENT: {
                                    shadow: {
                                        type: 'text',
                                        fields: {
                                            TEXT: 'Hello World'
                                        }
                                    }
                                }
                            }
                        },
                        { kind: 'block', type: 'html_attribute' }
                    ]
                },
                {
                    kind: 'category',
                    name: 'CSS',
                    colour: 65,
                    contents: [
                        { kind: 'block', type: 'css_property' },
                        { kind: 'block', type: 'css_selector' }
                    ]
                }
            ]
        };
    };

    const setupCollaboration = (workspace, room, projectId, project) => {
        // Track block movements for collaboration
        workspace.addChangeListener((event) => {
            if (event.type === Blockly.Events.BLOCK_MOVE ||
                event.type === Blockly.Events.BLOCK_CREATE ||
                event.type === Blockly.Events.BLOCK_DELETE ||
                event.type === Blockly.Events.BLOCK_CHANGE) {

                // Send block event to collaborators
                room.send({
                    type: "blockly-event",
                    event: event.toJson()
                });

                // Save blocks to project
                const xml = Blockly.Xml.workspaceToDom(workspace);
                const xmlText = Blockly.Xml.domToText(xml);
                const jsCode = Blockly.JavaScript.workspaceToCode(workspace);

                room.collection('project').update(projectId, { 
                    blocks: { xml: xmlText },
                    code: {
                        ...project.code,
                        js: jsCode
                    }
                });
            }
        });

        // Handle incoming blockly events
        room.onmessage = (message) => {
            const data = message.data;
            if (data.type === "blockly-event") {
                applyExternalBlocklyEvent(workspace, data.event);
            }
        };

        // Subscribe to presence changes to show collaborator cursors
        room.party.subscribePresence((presence) => {
            updateCollaboratorCursors(workspace, presence, room);
        });
    };

    const applyExternalBlocklyEvent = (workspace, eventJson) => {
        // Temporarily disable event handling to prevent infinite loops
        workspace.setEventHandlerEnabled(false);

        // Create Blockly event from JSON
        const event = Blockly.Events.fromJson(eventJson, workspace);
        event.run(true);

        // Re-enable event handling
        workspace.setEventHandlerEnabled(true);
    };

    const updateCollaboratorCursors = (workspace, presence, room) => {
        // Clear existing cursors
        for (const cursorId in workspace.collaborators) {
            workspace.collaborators[cursorId].element.remove();
            delete workspace.collaborators[cursorId];
        }

        const clientId = room.party.client.id;

        // Add cursors for collaborators
        for (const peerId in presence) {
            // Skip own cursor
            if (peerId === clientId) continue;

            const peerPresence = presence[peerId];
            const peerInfo = room.party.peers[peerId];

            // Only show cursor if user is editing blocks
            if (peerPresence.blocklyPosition) {
                const position = peerPresence.blocklyPosition;
                createCollaboratorCursor(workspace, peerId, position, peerInfo.username);
            }
        }
    };

    const createCollaboratorCursor = (workspace, peerId, position, username) => {
        // Create cursor element
        const cursorElement = document.createElement('div');
        cursorElement.className = 'blockly-collaborator-cursor';
        cursorElement.style.position = 'absolute';
        cursorElement.style.width = '10px';
        cursorElement.style.height = '10px';
        cursorElement.style.borderRadius = '50%';
        cursorElement.style.backgroundColor = getRandomColor(peerId);
        cursorElement.style.zIndex = '100';
        cursorElement.style.pointerEvents = 'none';

        // Add username label
        const label = document.createElement('div');
        label.textContent = username || 'Collaborator';
        label.style.position = 'absolute';
        label.style.top = '-20px';
        label.style.left = '0';
        label.style.backgroundColor = cursorElement.style.backgroundColor;
        label.style.color = 'white';
        label.style.padding = '0 4px';
        label.style.borderRadius = '2px';
        label.style.fontSize = '12px';
        label.style.whiteSpace = 'nowrap';

        cursorElement.appendChild(label);

        // Position cursor
        cursorElement.style.left = position.x + 'px';
        cursorElement.style.top = position.y + 'px';

        // Add to DOM
        blocklyContainerRef.current.appendChild(cursorElement);

        // Store reference to cursor
        if (!workspace.collaborators) {
            workspace.collaborators = {};
        }
        workspace.collaborators[peerId] = {
            element: cursorElement,
            position: position
        };
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

    return (
        <div 
            ref={blocklyContainerRef} 
            style={{ width: '100%', height: '100%' }}
        />
    );
}