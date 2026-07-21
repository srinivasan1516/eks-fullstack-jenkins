# ---- Frontend Dockerfile ----
FROM nginx:1.27-alpine

# Remove default nginx site and static files
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy our static site
COPY index.html style.css app.js /usr/share/nginx/html/

# Copy our custom nginx config (handles the /api proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
