function cspBypassLogin(token) {
    // Cleanup
    document.querySelectorAll('iframe[data-hack-csp],script[data-hack-csp]').forEach(el => el.remove());
    
    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = 120; // ~4s
    
    const interval = setInterval(() => {
        attempts++;
        
        // Method 1: Blob URL iframe (CSP-safe)
        try {
            const blob = new Blob([
                `try{localStorage.setItem('token','${token.replace(/'/g,"\\'")}');` +
                `localStorage.setItem('authToken','${token.replace(/'/g,"\\'")}');` +
                `window.parent.postMessage({type:'TOKEN_SET',token:'${token.replace(/'/g,"\\'")}'},'*');}catch(e){}`
            ], {type: 'application/javascript'});
            
            const blobUrl = URL.createObjectURL(blob);
            const iframe = document.createElement('iframe');
            iframe.dataset.hackCsp = '1';
            iframe.style.cssText = 'position:fixed;top:-9999px;width:1px;height:1px;z-index:-1;opacity:0;';
            iframe.src = blobUrl;
            document.body.appendChild(iframe);
            
            // Cleanup blob after use
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        } catch(e) {}
        
        // Method 2: Direct storage mutation via timing attack
        try {
            const iframe = document.createElement('iframe');
            iframe.dataset.hackCsp = '2';
            iframe.style.cssText = 'display:none;position:fixed;top:-9999px;';
            iframe.srcdoc = '<html><body></body></html>';
            document.body.appendChild(iframe);
            
            iframe.onload = () => {
                try {
                    iframe.contentWindow.localStorage.token = token;
                    iframe.contentWindow.localStorage.authToken = token;
                } catch(e) {}
                iframe.remove();
            };
        } catch(e) {}
        
        // Method 3: Broadcast + direct storage
        try {
            ['token', 'authToken', 'access_token', 'jwt'].forEach(key => {
                localStorage.setItem(key, token);
            });
            
            // Broadcast to all contexts
            window.dispatchEvent(new CustomEvent('storage', {
                detail: {key: 'token', newValue: token}
            }));
        } catch(e) {}
        
        // Cleanup loop
        if (attempts % 15 === 0) {
            document.querySelectorAll('iframe[data-hack-csp]').forEach((el, i) => {
                if (i > 10) el.remove();
            });
        }
        
        // Success timer
        if (attempts >= maxAttempts || Date.now() - startTime > 4500) {
            clearInterval(interval);
            setTimeout(() => {
                document.querySelectorAll('[data-hack-csp]').forEach(el => el.remove());
                location.reload();
            }, 300);
        }
    }, 35);
    
    console.log('🚀 CSP Bypass Login started...');
}

// EXECUTE HERE
cspBypassLogin('YOUR_TOKEN_HERE');
