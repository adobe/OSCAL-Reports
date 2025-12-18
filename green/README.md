# Green Deployment Landing Page

This directory contains a redirect page for the **Green** deployment of OSCAL Report Generator.

## Purpose

The `index.html` file automatically redirects users to the Green deployment frontend.

## Configuration

### Local Development
- Redirects to: `http://localhost:8121`

### Production
Update the redirect URL in `index.html` to point to your production Green deployment:

```html
<meta http-equiv="refresh" content="0; url=http://YOUR-SERVER-IP:8121">
```

And update the JavaScript fallback:

```javascript
window.location.href = 'http://YOUR-SERVER-IP:8121';
```

## Web Server Configuration

### Nginx Example
```nginx
server {
    listen 80;
    server_name green.yourdomain.com;
    
    root /path/to/OSCAL-Report-Generator-Green;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Apache Example
```apache
<VirtualHost *:80>
    ServerName green.yourdomain.com
    DocumentRoot /path/to/OSCAL-Report-Generator-Green/green
    
    <Directory /path/to/OSCAL-Report-Generator-Green/green>
        Options Indexes FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>
</VirtualHost>
```

## HAProxy Integration

If using HAProxy, you can serve this page as a redirect entry point:

```haproxy
frontend green_redirect
    bind *:80
    acl is_green hdr(host) -i green.yourdomain.com
    use_backend green_landing if is_green

backend green_landing
    server green_page 127.0.0.1:8121
```

