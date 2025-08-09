export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    // 重定向到新的登录页面
    return Response.redirect(url.origin + "/login.html", 302);
}