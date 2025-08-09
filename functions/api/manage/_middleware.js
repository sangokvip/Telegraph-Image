async function errorHandling(context) {
    try {
      return await context.next();
    } catch (err) {
      return new Response(`${err.message}\n${err.stack}`, { status: 500 });
    }
  }

  function basicAuthentication(request) {
    const Authorization = request.headers.get('Authorization');
  
    const [scheme, encoded] = Authorization.split(' ');
  
    // The Authorization header must start with Basic, followed by a space.
    if (!encoded || scheme !== 'Basic') {
      throw new BadRequestException('Malformed authorization header.');
    }
  
    // Decodes the base64 value and performs unicode normalization.
    // @see https://datatracker.ietf.org/doc/html/rfc7613#section-3.3.2 (and #section-4.2.2)
    // @see https://dev.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
    const buffer = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(buffer).normalize();
  
    // The username & password are split by the first colon.
    //=> example: "username:password"
    const index = decoded.indexOf(':');
  
    // The user & password are split by the first colon and MUST NOT contain control characters.
    // @see https://tools.ietf.org/html/rfc5234#appendix-B.1 (=> "CTL = %x00-1F / %x7F")
    if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
      throw new BadRequestException('Invalid authorization value.');
    }
  
    return {
      user: decoded.substring(0, index),
      pass: decoded.substring(index + 1),
    };
  }
  
  function UnauthorizedException(reason) {
    return new Response(reason, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          // Disables caching by default.
          'Cache-Control': 'no-store',
          // Returns the "Content-Length" header for HTTP HEAD requests.
          'Content-Length': reason.length,
        },
      });
  }
  
  function BadRequestException(reason) {
    return new Response(reason, {
        status: 400,
        statusText: 'Bad Request',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          // Disables caching by default.
          'Cache-Control': 'no-store',
          // Returns the "Content-Length" header for HTTP HEAD requests.
          'Content-Length': reason.length,
        },
      });
  }
  
  
  function authentication(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // 检查是否禁用了仪表板
    if (typeof env.img_url == "undefined" || env.img_url == null || env.img_url == "") {
        return new Response('Dashboard is disabled. Please bind a KV namespace to use this feature.', { status: 200 });
    }

    // 跳过认证和登录相关的端点
    const skipAuth = ['/api/manage/auth', '/api/manage/login'].some(path => 
        url.pathname.endsWith(path)
    );
    
    if (skipAuth) {
        return context.next();
    }
    
    // 检查cookie认证
    const cookies = request.headers.get('Cookie') || '';
    const isAuthenticated = cookies.includes('admin_auth=authenticated');
    
    if (isAuthenticated) {
        return context.next();
    }
    
    // 如果没有cookie认证，检查是否配置了基础认证
    console.log(env.BASIC_USER)
    if(typeof env.BASIC_USER == "undefined" || env.BASIC_USER == null || env.BASIC_USER == ""){
        // 没有配置基础认证，需要cookie认证
        return UnauthorizedException('Authentication required.');
    }else{
        // 配置了基础认证，使用原有的基础认证逻辑
        if (request.headers.has('Authorization')) {
            // Throws exception when authorization fails.
            const { user, pass } = basicAuthentication(request);
            
            if (env.BASIC_USER !== user || env.BASIC_PASS !== pass) {
                return UnauthorizedException('Invalid credentials.');
            }else{
                return context.next();
            }
            
        } else {
            return new Response('You need to login.', {
                status: 401,
                headers: {
                // Prompts the user for credentials.
                'WWW-Authenticate': 'Basic realm="my scope", charset="UTF-8"',
                },
            });
        }
    }  
    
  }
  
  export const onRequest = [errorHandling, authentication];