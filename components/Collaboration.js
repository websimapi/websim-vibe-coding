const { useState, useEffect } = React;

export default function Collaboration({ room, project, isOpen, onToggle }) {
    const [collaborators, setCollaborators] = useState({});
    const [inviteUrl, setInviteUrl] = useState('');
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [collaborationPermissions, setCollaborationPermissions] = useState({});
    
    useEffect(() => {
        if (room && project) {
            // Generate an invite URL with the current project ID
            const baseUrl = window.location.origin + window.location.pathname;
            setInviteUrl(`${baseUrl}?project=${project.id}`);
            
            // Subscribe to peers
            const unsubscribe = room.party.subscribe((peers) => {
                setCollaborators(peers);
            });
            
            // Get collaboration permissions from the project
            const permissions = project.collaborationPermissions || {};
            setCollaborationPermissions(permissions);
            
            return () => unsubscribe();
        }
    }, [room, project]);
    
    const toggleCollaborationPermission = (clientId, permission) => {
        if (!project || !room) return;
        
        // Create updated permissions
        const updatedPermissions = { ...collaborationPermissions };
        
        if (!updatedPermissions[clientId]) {
            updatedPermissions[clientId] = { canEdit: false, canInvite: false };
        }
        
        updatedPermissions[clientId][permission] = !updatedPermissions[clientId][permission];
        
        // Update project in database
        room.collection('project').update(project.id, {
            collaborationPermissions: updatedPermissions
        });
        
        // Update local state
        setCollaborationPermissions(updatedPermissions);
    };
    
    const copyInviteLink = () => {
        navigator.clipboard.writeText(inviteUrl);
        // Show success message
        alert('Invite link copied to clipboard');
    };
    
    const hasEditPermission = (clientId) => {
        const permissions = collaborationPermissions[clientId];
        return permissions && permissions.canEdit;
    };
    
    const hasInvitePermission = (clientId) => {
        const permissions = collaborationPermissions[clientId];
        return permissions && permissions.canInvite;
    };
    
    const isProjectCreator = () => {
        return room && project && room.party.client.id === project.created_by;
    };
    
    return (
        <div className={`collaboration-panel ${isOpen ? 'open' : ''}`}>
            <div className="collaboration-toggle" onClick={onToggle}>
                <i className="mdi mdi-account-group"></i>
            </div>
            
            <div className="collaboration-header">
                <h2>Collaboration</h2>
                {(isProjectCreator() || hasInvitePermission(room?.party.client.id)) && (
                    <button 
                        className="btn btn-primary" 
                        onClick={() => setIsInviteModalOpen(true)}
                    >
                        <i className="mdi mdi-account-plus"></i> Invite
                    </button>
                )}
            </div>
            
            <div className="collaborators-list">
                <h3>Active Users</h3>
                
                {Object.keys(collaborators).length === 0 ? (
                    <p>No active collaborators</p>
                ) : (
                    Object.entries(collaborators).map(([clientId, client]) => (
                        <div className="collaborator" key={clientId}>
                            <img 
                                src={`https://images.websim.ai/avatar/${client.username}`} 
                                alt={client.username}
                            />
                            <div className="collaborator-info">
                                <div className="collaborator-name">
                                    {client.username}
                                    {clientId === room.party.client.id && ' (You)'}
                                    {clientId === project?.created_by && ' (Creator)'}
                                </div>
                                
                                {isProjectCreator() && clientId !== room.party.client.id && (
                                    <div className="collaborator-controls">
                                        <label>
                                            <input 
                                                type="checkbox" 
                                                checked={hasEditPermission(clientId)}
                                                onChange={() => toggleCollaborationPermission(clientId, 'canEdit')}
                                            />
                                            Can Edit
                                        </label>
                                        <label>
                                            <input 
                                                type="checkbox" 
                                                checked={hasInvitePermission(clientId)}
                                                onChange={() => toggleCollaborationPermission(clientId, 'canInvite')}
                                            />
                                            Can Invite
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            {/* Invite Modal */}
            {isInviteModalOpen && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>Invite Collaborators</h3>
                            <button 
                                className="btn btn-icon" 
                                onClick={() => setIsInviteModalOpen(false)}
                            >
                                <i className="mdi mdi-close"></i>
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>Share this link with others to invite them to collaborate:</p>
                            <div className="invite-link-container">
                                <input 
                                    type="text" 
                                    value={inviteUrl} 
                                    readOnly 
                                    className="invite-link-input"
                                />
                                <button 
                                    className="btn btn-primary" 
                                    onClick={copyInviteLink}
                                >
                                    <i className="mdi mdi-content-copy"></i> Copy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

