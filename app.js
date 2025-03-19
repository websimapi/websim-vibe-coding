import { CONFIG } from './config.js';

const { useState, useEffect, useRef } = React;

// Main App Component
function App() {
    const [activeView, setActiveView] = useState('gallery');
    const [currentProject, setCurrentProject] = useState(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [showAssistant, setShowAssistant] = useState(false);
    const [showCollaborationPanel, setShowCollaborationPanel] = useState(false);
    const [editorMode, setEditorMode] = useState(CONFIG.editor.defaultMode);
    const roomRef = useRef(null);

    useEffect(() => {
        // Initialize WebSocket connection for multiplayer functionality
        roomRef.current = new WebsimSocket();
        
        // Check if we're editing a project from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');
        
        if (projectId) {
            loadProject(projectId);
        }
        
        return () => {
            // Cleanup WebSocket connection
            // WebsimSocket handles cleanup automatically
        };
    }, []);

    const loadProject = async (projectId) => {
        try {
            // Get project data from the database
            const projects = roomRef.current.collection('project').filter({ id: projectId }).getList();
            if (projects && projects.length > 0) {
                setCurrentProject(projects[0]);
                setActiveView('editor');
            } else {
                console.error('Project not found');
            }
        } catch (error) {
            console.error('Error loading project:', error);
        }
    };

    const createNewProject = async () => {
        try {
            const newProject = await roomRef.current.collection('project').create({
                title: 'Untitled Project',
                description: '',
                code: {
                    html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>My Project</title>\n</head>\n<body>\n  <h1>Hello World!</h1>\n</body>\n</html>',
                    css: 'body {\n  font-family: Arial, sans-serif;\n  background-color: #f5f5f5;\n}\n\nh1 {\n  color: #333;\n}',
                    js: 'console.log("Hello from Vibe Coding!");'
                },
                isPublic: true,
                tags: [],
                blocks: {},
                createdAt: new Date().toISOString()
            });
            
            setCurrentProject(newProject);
            setActiveView('editor');
        } catch (error) {
            console.error('Error creating project:', error);
        }
    };

    const toggleAssistant = () => {
        setShowAssistant(!showAssistant);
    };

    const toggleCollaborationPanel = () => {
        setShowCollaborationPanel(!showCollaborationPanel);
    };

    const renderActiveView = () => {
        switch (activeView) {
            case 'gallery':
                return <ProjectGallery 
                    room={roomRef.current}
                    onProjectSelect={loadProject}
                    onCreateNew={createNewProject}
                />;
            case 'editor':
                return (
                    <div className="editor-container">
                        <div className="editor-toolbar">
                            <div className="editor-actions">
                                <button 
                                    className="btn btn-outline"
                                    onClick={() => setActiveView('gallery')}
                                >
                                    <i className="mdi mdi-arrow-left"></i> Back to Gallery
                                </button>
                            </div>
                            <div className="editor-title">
                                {currentProject?.title || 'Untitled Project'}
                            </div>
                            <div className="editor-mode-toggle">
                                <button 
                                    className={`btn ${editorMode === 'code' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setEditorMode('code')}
                                >
                                    <i className="mdi mdi-code-tags"></i> Code
                                </button>
                                <button 
                                    className={`btn ${editorMode === 'blocks' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setEditorMode('blocks')}
                                >
                                    <i className="mdi mdi-puzzle"></i> Blocks
                                </button>
                                <button 
                                    className="btn btn-outline"
                                    onClick={toggleCollaborationPanel}
                                >
                                    <i className="mdi mdi-account-group"></i> Collaborate
                                </button>
                            </div>
                        </div>
                        <div className="editor-panel">
                            <div className="editor-sidebar">
                                <h3>Project Files</h3>
                                <ul className="file-list">
                                    <li className="active">index.html</li>
                                    <li>styles.css</li>
                                    <li>script.js</li>
                                </ul>
                                <h3>Assets</h3>
                                <button className="btn btn-outline btn-sm">
                                    <i className="mdi mdi-plus"></i> Add Asset
                                </button>
                            </div>
                            <div className="editor-main">
                                {editorMode === 'code' ? (
                                    <CodeEditor 
                                        project={currentProject}
                                        room={roomRef.current}
                                        projectId={currentProject?.id}
                                    />
                                ) : (
                                    <BlocklyEditor 
                                        project={currentProject}
                                        room={roomRef.current}
                                        projectId={currentProject?.id}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                );
            default:
                return <div>Page not found</div>;
        }
    };

    return (
        <>
            <header className="header">
                <div className="header-container container">
                    <div className="logo">
                        <i className="mdi mdi-code-braces"></i>
                        {CONFIG.app.name}
                    </div>
                    <nav className="nav">
                        <a 
                            className={`nav-link ${activeView === 'gallery' ? 'active' : ''}`}
                            onClick={() => setActiveView('gallery')}
                        >
                            Gallery
                        </a>
                        <a 
                            className={`nav-link ${activeView === 'myprojects' ? 'active' : ''}`}
                            onClick={() => setActiveView('myprojects')}
                        >
                            My Projects
                        </a>
                        <a 
                            className="nav-link btn btn-secondary"
                            onClick={createNewProject}
                        >
                            <i className="mdi mdi-plus"></i> New Project
                        </a>
                    </nav>
                </div>
            </header>
            
            <main className="main">
                <div className="container">
                    {renderActiveView()}
                </div>
            </main>

            <Collaboration 
                room={roomRef.current}
                project={currentProject}
                isOpen={showCollaborationPanel}
                onToggle={toggleCollaborationPanel}
            />

            <LLMAssistant 
                isOpen={showAssistant}
                onToggle={toggleAssistant}
                project={currentProject}
                editorMode={editorMode}
            />

            <div 
                className="llm-assistant" 
                onClick={toggleAssistant}
            >
                <i className="mdi mdi-robot"></i>
            </div>
        </>
    );
}

// Define Components
function ProjectGallery({ room, onProjectSelect, onCreateNew }) {
    const [projects, setProjects] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (room) {
            // Subscribe to project collection
            const unsubscribe = room.collection('project').filter({ isPublic: true }).subscribe(data => {
                setProjects(data);
                setIsLoading(false);
            });
            
            return () => unsubscribe();
        }
    }, [room]);

    if (isLoading) {
        return <div>Loading projects...</div>;
    }

    return (
        <div className="gallery-container">
            <div className="gallery-header">
                <h1>Project Gallery</h1>
                <p>Explore and remix projects created by the community</p>
                <button className="btn btn-primary" onClick={onCreateNew}>
                    <i className="mdi mdi-plus"></i> Create New Project
                </button>
            </div>
            
            {projects.length === 0 ? (
                <div className="empty-state">
                    <h2>No projects yet</h2>
                    <p>Be the first to create a project!</p>
                    <button className="btn btn-primary" onClick={onCreateNew}>Create Project</button>
                </div>
            ) : (
                <div className="gallery-grid">
                    {projects.map(project => (
                        <div className="card project-card" key={project.id}>
                            <div className="project-preview">
                                {/* Project preview would be rendered here */}
                                <div style={{ padding: '20px', textAlign: 'center' }}>
                                    <i className="mdi mdi-code-tags" style={{ fontSize: '48px' }}></i>
                                </div>
                            </div>
                            <div className="project-details">
                                <h3 className="project-title">{project.title}</h3>
                                <div className="project-author">
                                    <img src={`https://images.websim.ai/avatar/${project.username}`} alt="Avatar" />
                                    <span>{project.username}</span>
                                </div>
                                <p className="project-description">
                                    {project.description || 'No description provided'}
                                </p>
                                <div className="project-tags">
                                    {project.tags && project.tags.map((tag, index) => (
                                        <span className="tag" key={index}>{tag}</span>
                                    ))}
                                </div>
                                <button 
                                    className="btn btn-primary" 
                                    onClick={() => onProjectSelect(project.id)}
                                >
                                    Open Project
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Render the React app
ReactDOM.createRoot(document.getElementById('app')).render(<App />);