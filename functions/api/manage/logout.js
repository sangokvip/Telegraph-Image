export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    // 清除认证cookie并重定向到首页
    const response = Response.redirect(url.origin + "/", 302);
    response.headers.set('Set-Cookie', 'admin_auth=; Path=/; HttpOnly; Max-Age=0; SameSite=Strict');
    return response;
}