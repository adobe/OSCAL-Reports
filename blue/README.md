# Blue Deployment Landing Page

This directory contains a redirect page for the **Blue** deployment of OSCAL Report Generator.

## Purpose

The `index.html` file automatically redirects users to the Blue deployment frontend.

## Configuration

### Local Development
- Redirects to: `http://localhost:8120`

### Production
Update the redirect URL in `index.html` to point to your production Blue deployment:

```html
<meta http-equiv="refresh" content="0; url=http://YOUR-SERVER-IP:8120">
```

And update the JavaScript fallback:

```javascript
window.location.href = 'http://YOUR-SERVER-IP:8120';
```

## Web Server Configuration

### Nginx Example
```nginx
server {
    listen 80;
    server_name blue.yourdomain.com;
    
    root /path/to/OSCAL-Report-Generator-Blue;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Apache Example
```apache
<VirtualHost *:80>
    ServerName blue.yourdomain.com
    DocumentRoot /path/to/OSCAL-Report-Generator-Blue/blue
    
    <Directory /path/to/OSCAL-Report-Generator-Blue/blue>
        Options Indexes FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>
</VirtualHost>
```

## HAProxy Integration

If using HAProxy, you can serve this page as a redirect entry point:

```haproxy
frontend blue_redirect
    bind *:80
    acl is_blue hdr(host) -i blue.yourdomain.com
    use_backend blue_landing if is_blue

backend blue_landing
    server blue_page 127.0.0.1:8120
```

