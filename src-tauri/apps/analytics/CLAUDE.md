# Analytics Service

## Environment Variables

```
FRONTEND_URL=http://localhost:8080          # Customer app URL
WEB_URL=http://localhost:3000               # Web URL
ADMIN_URL=http://localhost:8082             # Admin panel URL
API_URL=http://localhost:3001               # Main API URL (for click notifications)
```

These URLs are used for CORS configuration and fire-and-forget click notifications to the main API.

## Critical Rules

- Note: Verify `.env.example` does not contain real credentials before committing. Replace any actual connection strings with placeholder values.
