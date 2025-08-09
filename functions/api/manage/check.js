export async function onRequest(context) {
    const { request, env } = context;
    
    // 检查cookie认证
    const cookies = request.headers.get('Cookie') || '';
    const isAuthenticated = cookies.includes('admin_auth=authenticated');
    
    if (isAuthenticated) {
        return new Response('true', { status: 200 });
    }
    
    // 如果没有cookie认证，检查是否配置了基础认证
    if (typeof env.BASIC_USER == "undefined" || env.BASIC_USER == null || env.BASIC_USER == "") {
        return new Response('false', { status: 401 });
    } else {
        return new Response('true', { status: 200 });
    }
}