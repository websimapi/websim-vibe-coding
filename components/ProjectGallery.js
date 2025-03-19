const { useState, useEffect } = React;

export default function ProjectGallery({ room, onProjectSelect, onCreateNew }) {
    const [projects, setProjects] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'mine', 'featured'
    const [searchTerm, setSearchTerm] = useState('');
    const [creatorUsername, setCreatorUsername] = useState('');
    
    useEffect(() => {
        async function fetchCreator() {
            try {
                const creator = await window.websim.getCreatedBy();
                setCreatorUsername(creator.username);
            } catch (error) {
                console.error('Error fetching creator:', error);
            }
        }
        
        fetchCreator();
    }, []);
    
    useEffect(() => {
        if (room) {
            // Subscribe to project collection
            const unsubscribe = room.collection('project').subscribe(data => {
                setProjects(data);
                setIsLoading(false);
            });
            
            return () => unsubscribe();
        }
    }, [room]);
    
    // Filter and search projects
    const filteredProjects = projects.filter(project => {
        // Filter by ownership
        if (filter === 'mine' && project.username !== creatorUsername) {
            return false;
        }
        
        if (filter === 'featured' && !project.featured) {
            return false;
        }
        
        // Search by title and description
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            const titleMatch = project.title && project.title.toLowerCase().includes(searchLower);
            const descMatch = project.description && project.description.toLowerCase().includes(searchLower);
            const authorMatch = project.username && project.username.toLowerCase().includes(searchLower);
            const tagsMatch = project.tags && project.tags.some(tag => 
                tag.toLowerCase().includes(searchLower)
            );
            
            return titleMatch || descMatch || authorMatch || tagsMatch;
        }
        
        return true;
    });
    
    // Sort projects by created_at (newest first)
    const sortedProjects = [...filteredProjects].sort((a, b) => {
        return new Date(b.created_at) - new Date(a.created_at);
    });
    
    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading projects...</p>
            </div>
        );
    }
    
    return (
        <div className="gallery-container">
            <div className="gallery-header">
                <div className="gallery-title">
                    <h1>Project Gallery</h1>
                    <p>Explore and remix projects created by the community</p>
                </div>
                <div className="gallery-actions">
                    <button className="btn btn-primary" onClick={onCreateNew}>
                        <i className="mdi mdi-plus"></i> Create New Project
                    </button>
                </div>
            </div>
            
            <div className="gallery-filters">
                <div className="search-container">
                    <i className="mdi mdi-magnify search-icon"></i>
                    <input 
                        type="text"
                        placeholder="Search projects..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                    {searchTerm && (
                        <button 
                            className="clear-search" 
                            onClick={() => setSearchTerm('')}
                        >
                            <i className="mdi mdi-close"></i>
                        </button>
                    )}
                </div>
                
                <div className="filter-tabs">
                    <button 
                        className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All Projects
                    </button>
                    <button 
                        className={`filter-tab ${filter === 'mine' ? 'active' : ''}`}
                        onClick={() => setFilter('mine')}
                    >
                        My Projects
                    </button>
                    <button 
                        className={`filter-tab ${filter === 'featured' ? 'active' : ''}`}
                        onClick={() => setFilter('featured')}
                    >
                        Featured
                    </button>
                </div>
            </div>
            
            {sortedProjects.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">
                        <i className="mdi mdi-flask-empty-outline"></i>
                    </div>
                    <h2>No projects found</h2>
                    <p>
                        {filter === 'mine' 
                            ? "You haven't created any projects yet." 
                            : searchTerm 
                                ? `No projects match "${searchTerm}".` 
                                : "No projects available."
                        }
                    </p>
                    <button className="btn btn-primary" onClick={onCreateNew}>
                        Create Your First Project
                    </button>
                </div>
            ) : (
                <div className="gallery-grid">
                    {sortedProjects.map(project => (
                        <ProjectCard 
                            key={project.id} 
                            project={project} 
                            onSelect={onProjectSelect}
                            isCreator={project.username === creatorUsername}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ProjectCard({ project, onSelect, isCreator }) {
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString();
    };
    
    return (
        <div className="card project-card">
            <div className="project-preview">
                {/* If project has a preview image, show it */}
                {project.previewImage ? (
                    <img src={project.previewImage} alt={project.title} />
                ) : (
                    // Otherwise show a placeholder
                    <div className="preview-placeholder">
                        <i className="mdi mdi-code-braces"></i>
                    </div>
                )}
                
                {project.featured && (
                    <div className="featured-badge">
                        <i className="mdi mdi-star"></i> Featured
                    </div>
                )}
            </div>
            
            <div className="project-details">
                <h3 className="project-title">{project.title || 'Untitled Project'}</h3>
                
                <div className="project-meta">
                    <div className="project-author">
                        <img 
                            src={`https://images.websim.ai/avatar/${project.username}`} 
                            alt={project.username} 
                            className="author-avatar"
                        />
                        <span>{project.username} {isCreator ? '(You)' : ''}</span>
                    </div>
                    
                    <div className="project-date">
                        <i className="mdi mdi-calendar"></i>
                        {formatDate(project.created_at)}
                    </div>
                </div>
                
                <p className="project-description">
                    {project.description || 'No description provided'}
                </p>
                
                <div className="project-tags">
                    {project.tags && project.tags.map((tag, index) => (
                        <span className="tag" key={index}>{tag}</span>
                    ))}
                </div>
                
                <div className="project-actions">
                    <button 
                        className="btn btn-primary" 
                        onClick={() => onSelect(project.id)}
                    >
                        <i className="mdi mdi-pencil"></i> Open
                    </button>
                    
                    <button className="btn btn-icon btn-outline">
                        <i className="mdi mdi-content-duplicate"></i>
                    </button>
                </div>
            </div>
        </div>
    );
}

