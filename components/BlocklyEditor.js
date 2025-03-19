export default class BlocklyEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = Object.assign({
            media: 'https://blockly-demo.appspot.com/static/media/',
            toolbox: this._getDefaultToolbox(),
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
        }, options);
        
        this.workspace = null;
        this.room = options.room;
        this.projectId = options.projectId;
        this.collaborationEnabled = false;
        this.collaborators = {};
        
        this._init();
    }
    
    _init() {
        // Initialize Blockly workspace
        this.workspace = Blockly.inject(this.container, this.options);
        
        // Setup realtime collaboration if requested
        if (this.options.collaboration && this.room) {
            this._setupCollaboration();
        }
        
        // Load blocks from project
        this._loadBlocksFromProject();
        
        // Setup auto-save
        if (this.options.autoSave) {
            this._setupAutoSave();
        }
        
        // Setup code generation
        this._setupCodeGeneration();
    }
    
    _getDefaultToolbox() {
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
    }
    
    _loadBlocksFromProject() {
        if (!this.projectId) return;
        
        // Fetch the latest project data
        const projects = this.room.collection('project').filter({ id: this.projectId }).getList();
        if (projects && projects.length > 0) {
            const project = projects[0];
            
            if (project.blocks && project.blocks.xml) {
                try {
                    const xml = Blockly.Xml.textToDom(project.blocks.xml);
                    Blockly.Xml.domToWorkspace(xml, this.workspace);
                } catch (e) {
                    console.error('Error loading blocks:', e);
                }
            }
        }
    }
    
    _saveBlocksToProject() {
        if (!this.projectId) return;
        
        // Get XML representation of blocks
        const xml = Blockly.Xml.workspaceToDom(this.workspace);
        const xmlText = Blockly.Xml.domToText(xml);
        
        // Generate code
        const jsCode = Blockly.JavaScript.workspaceToCode(this.workspace);
        
        // Fetch the latest project data
        const projects = this.room.collection('project').filter({ id: this.projectId }).getList();
        if (projects && projects.length > 0) {
            const project = projects[0];
            
            // Update blocks and generate JS code
            this.room.collection('project').update(this.projectId, { 
                blocks: { xml: xmlText },
                code: {
                    ...project.code,
                    js: jsCode
                }
            });
        }
    }
    
    _setupCollaboration() {
        this.collaborationEnabled = true;
        
        // Track block movements for collaboration
        this.workspace.addChangeListener((event) => {
            if (event.type === Blockly.Events.BLOCK_MOVE ||
                event.type === Blockly.Events.BLOCK_CREATE ||
                event.type === Blockly.Events.BLOCK_DELETE ||
                event.type === Blockly.Events.BLOCK_CHANGE) {
                
                // Send block event to collaborators
                this.room.send({
                    type: "blockly-event",
                    event: event.toJson()
                });
            }
        });
        
        // Handle incoming blockly events
        this.room.onmessage = (message) => {
            const data = message.data;
            if (data.type === "blockly-event") {
                this._applyExternalBlocklyEvent(data.event);
            }
        };
        
        // Subscribe to presence changes to show collaborator cursors
        this.room.party.subscribePresence((presence) => {
            this._updateCollaboratorCursors(presence);
        });
    }
    
    _applyExternalBlocklyEvent(eventJson) {
        // Temporarily disable event handling to prevent infinite loops
        this.workspace.setEventHandlerEnabled(false);
        
        // Create Blockly event from JSON
        const event = Blockly.Events.fromJson(eventJson, this.workspace);
        event.run(true);
        
        // Re-enable event handling
        this.workspace.setEventHandlerEnabled(true);
    }
    
    _updateCollaboratorCursors(presence) {
        // Clear existing cursors
        for (const cursorId in this.collaborators) {
            this.collaborators[cursorId].element.remove();
            delete this.collaborators[cursorId];
        }
        
        const clientId = this.room.party.client.id;
        
        // Add cursors for collaborators
        for (const peerId in presence) {
            // Skip own cursor
            if (peerId === clientId) continue;
            
            const peerPresence = presence[peerId];
            const peerInfo = this.room.party.peers[peerId];
            
            // Only show cursor if user is editing blocks
            if (peerPresence.blocklyPosition) {
                const position = peerPresence.blocklyPosition;
                this._createCollaboratorCursor(peerId, position, peerInfo.username);
            }
        }
    }
    
    _createCollaboratorCursor(peerId, position, username) {
        // Create cursor element
        const cursorElement = document.createElement('div');
        cursorElement.className = 'blockly-collaborator-cursor';
        cursorElement.style.position = 'absolute';
        cursorElement.style.width = '10px';
        cursorElement.style.height = '10px';
        cursorElement.style.borderRadius = '50%';
        cursorElement.style.backgroundColor = this._getRandomColor(peerId);
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
        this.container.appendChild(cursorElement);
        
        // Store reference to cursor
        this.collaborators[peerId] = {
            element: cursorElement,
            position: position
        };
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
            this._saveBlocksToProject();
        }, this.options.autoSaveInterval || 30000);
    }
    
    _setupCodeGeneration() {
        // Create custom blocks for web development
        if (!Blockly.Blocks['html_element']) {
            Blockly.Blocks['html_element'] = {
                init: function() {
                    this.appendValueInput('CONTENT')
                        .setCheck(null)
                        .appendField('Element')
                        .appendField(new Blockly.FieldDropdown([
                            ['div', 'div'],
                            ['span', 'span'],
                            ['p', 'p'],
                            ['h1', 'h1'],
                            ['h2', 'h2'],
                            ['button', 'button'],
                            ['input', 'input'],
                            ['a', 'a']
                        ]), 'TAG');
                    this.appendValueInput('ATTRIBUTES')
                        .setCheck('Attribute')
                        .appendField('attributes');
                    this.setOutput(true, 'HTML');
                    this.setColour(20);
                }
            };
            
            Blockly.JavaScript['html_element'] = function(block) {
                const tag = block.getFieldValue('TAG');
                const content = Blockly.JavaScript.valueToCode(block, 'CONTENT', Blockly.JavaScript.ORDER_ATOMIC) || '';
                const attributes = Blockly.JavaScript.valueToCode(block, 'ATTRIBUTES', Blockly.JavaScript.ORDER_ATOMIC) || '';
                
                return [`'<${tag}${attributes}>${content}</${tag}>'`, Blockly.JavaScript.ORDER_ATOMIC];
            };
            
            Blockly.Blocks['html_attribute'] = {
                init: function() {
                    this.appendValueInput('VALUE')
                        .setCheck(null)
                        .appendField('attribute')
                        .appendField(new Blockly.FieldTextInput('class'), 'NAME')
                        .appendField('=');
                    this.setOutput(true, 'Attribute');
                    this.setColour(20);
                }
            };
            
            Blockly.JavaScript['html_attribute'] = function(block) {
                const name = block.getFieldValue('NAME');
                const value = Blockly.JavaScript.valueToCode(block, 'VALUE', Blockly.JavaScript.ORDER_ATOMIC) || '""';
                
                return [` ${name}=${value}`, Blockly.JavaScript.ORDER_ATOMIC];
            };
            
            Blockly.Blocks['css_property'] = {
                init: function() {
                    this.appendValueInput('VALUE')
                        .setCheck(null)
                        .appendField('property')
                        .appendField(new Blockly.FieldTextInput('color'), 'NAME')
                        .appendField(':');
                    this.setPreviousStatement(true, 'CSS_PROPERTY');
                    this.setNextStatement(true, 'CSS_PROPERTY');
                    this.setColour(65);
                }
            };
            
            Blockly.JavaScript['css_property'] = function(block) {
                const name = block.getFieldValue('NAME');
                const value = Blockly.JavaScript.valueToCode(block, 'VALUE', Blockly.JavaScript.ORDER_ATOMIC) || '""';
                
                return `${name}: ${value};\n`;
            };
            
            Blockly.Blocks['css_selector'] = {
                init: function() {
                    this.appendStatementInput('PROPERTIES')
                        .setCheck('CSS_PROPERTY')
                        .appendField('selector')
                        .appendField(new Blockly.FieldTextInput('body'), 'SELECTOR')
                        .appendField('{');
                    this.setPreviousStatement(true, 'CSS_RULE');
                    this.setNextStatement(true, 'CSS_RULE');
                    this.setColour(65);
                }
            };
            
            Blockly.JavaScript['css_selector'] = function(block) {
                const selector = block.getFieldValue('SELECTOR');
                const properties = Blockly.JavaScript.statementToCode(block, 'PROPERTIES');
                
                return `${selector} {\n${properties}}\n`;
            };
        }
    }
    
    generateCode() {
        return Blockly.JavaScript.workspaceToCode(this.workspace);
    }
    
    dispose() {
        if (this.workspace) {
            this.workspace.dispose();
        }
    }
}

