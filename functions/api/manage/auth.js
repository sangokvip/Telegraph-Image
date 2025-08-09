export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const { password } = body;
        
        // 固定密码
        const ADMIN_PASSWORD = 'Sangok#3';
        
        if (password === ADMIN_PASSWORD) {
            // 设置认证cookie，有效期24小时
            const response = new Response('success', { status: 200 });
            response.headers.set('Set-Cookie', 'admin_auth=authenticated; Path=/; HttpOnly; Max-Age=86400; SameSite=Strict');
            return response;
        } else {
            return new Response('Invalid password', { status: 401 });
        }
    } catch (error) {
        console.error('Auth error:', error);
        return new Response('Invalid request', { status: 400 });
    }
}