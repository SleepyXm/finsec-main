

def create_project_query():
    return """
    INSERT INTO projects (project_id, user_id, name, status, access_token, created_at)
    VALUES (:project_id, :user_id, :name, 'created', :access_token, NOW())
    """

def list_projects_query():
    return """
    SELECT 
        p.project_id, 
        p.name, 
        p.status, 
        p.container_id, 
        p.created_at,
        p.last_online,
        s.name as service_name,
        s.framework as service_framework
    FROM projects p
    LEFT JOIN project_services ps ON p.project_id = ps.project_id
    LEFT JOIN services s ON s.id = ps.service_id
    WHERE p.user_id = :user_id
    ORDER BY p.last_online DESC NULLS LAST, p.created_at DESC
    """