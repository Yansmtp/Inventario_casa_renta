# Guía de Despliegue - Inventario Casa Renta

Esta guía explica cómo desplegar el proyecto en producción usando:
- **Frontend**: Vercel
- **Backend**: Render
- **Base de Datos**: Neon.tech

---

## 📋 Prerrequisitos

1. Cuenta en [GitHub](https://github.com) (el proyecto ya está conectado)
2. Cuenta en [Vercel](https://vercel.com)
3. Cuenta en [Render](https://render.com)
4. Cuenta en [Neon.tech](https://neon.tech)

---

## 🗄️ Paso 1: Configurar Base de Datos en Neon.tech

### 1.1 Crear proyecto en Neon
1. Ve a [neon.tech](https://neon.tech) y crea una cuenta
2. Crea un nuevo proyecto llamado `inventario-casa-renta`
3. Selecciona el plan gratuito (Free Tier)
4. Elige la región más cercana (ej: US East)

### 1.2 Obtener connection string
1. En el dashboard de Neon, ve a **Connection Details**
2. Copia el **Connection URI** (se verá como):
   ```
   postgresql://usuario:password@ep-xxx.us-east-1.aws.neon.tech/inventario_casa_renta?sslmode=require
   ```
3. **Guarda este string** lo necesitarás para Render

### 1.3 Inicializar la base de datos
Tienes dos opciones:

**Opción A: Usar el script SQL incluido**
```bash
# Conéctate a la base de datos usando psql o cualquier cliente PostgreSQL
# Ejecuta el script:
psql "postgresql://usuario:password@host/inventario_casa_renta" < scripts/setup-database.sql
```

**Opción B: Dejar que Render ejecute las migraciones de Prisma**
- Render ejecutará automáticamente `npx prisma migrate deploy` durante el deploy

---

## 🚀 Paso 2: Desplegar Backend en Render

### 2.1 Conectar repositorio
1. Ve a [Render](https://render.com) y crea una cuenta
2. Haz clic en **"New +"** → **"Blueprint"**
3. Conecta tu cuenta de GitHub
4. Selecciona el repositorio `Inventario_casa_renta`
5. Render detectará automáticamente el archivo `render.yaml`

### 2.2 Configurar variables de entorno
En la configuración del servicio en Render:

1. **DATABASE_URL**: Pega el connection string de Neon.tech
   ```
   postgresql://usuario:password@ep-xxx.us-east-1.aws.neon.tech/inventario_casa_renta?sslmode=require
   ```

2. **FRONTEND_URL**: 
   ```
   https://inventario-casa-renta.vercel.app
   ```
   *(Actualiza esto después de desplegar el frontend)*

3. **JWT_SECRET**: Genera una clave segura (Render puede generarla automáticamente)

4. Las demás variables ya están configuradas en `render.yaml`

### 2.3 Desplegar
1. Haz clic en **"Create Web Service"**
2. Render ejecutará:
   - `npm install`
   - `npm run build`
   - `npx prisma generate`
   - `npx prisma migrate deploy` (si está configurado)
   - `npm run start:prod`

3. **Anota la URL del backend** (ej: `https://inventario-backend.onrender.com`)

### 2.4 Verificar que funciona
```bash
# Prueba la API
curl https://inventario-backend.onrender.com/api/health

# Deberías ver una respuesta JSON
```

---

## 🌐 Paso 3: Desplegar Frontend en Vercel

### 3.1 Actualizar URL del backend
Antes de desplegar, actualiza la URL del backend en `frontend/index.html`:

```javascript
// Línea 15 aproximadamente, cambia:
window.API_BASE_URL = 'https://inventario-backend.onrender.com/api';
```

**Importante**: Usa la URL real que te dio Render en el paso 2.3

### 3.2 Conectar repositorio
1. Ve a [Vercel](https://vercel.com) y crea una cuenta
2. Haz clic en **"Add New..."** → **"Project"**
3. Importa el repositorio `Inventario_casa_renta`
4. Configura el proyecto:
   - **Framework Preset**: Other
   - **Root Directory**: `frontend`
   - **Build Command**: Deja vacío (no requiere build)
   - **Output Directory**: `.`

### 3.3 Configurar variables de entorno (opcional)
Si quieres usar variables de entorno en Vercel:
1. Ve a **Settings** → **Environment Variables**
2. Agrega:
   - `API_URL` = `https://inventario-backend.onrender.com/api`

### 3.4 Desplegar
1. Haz clic en **"Deploy"**
2. Vercel desplegará el frontend en ~30 segundos
3. **Anota la URL del frontend** (ej: `https://inventario-casa-renta.vercel.app`)

---

## 🔄 Paso 4: Configurar CORS en Backend

Una vez que tengas la URL de Vercel, actualiza la variable `FRONTEND_URL` en Render:

1. Ve a tu servicio en Render
2. **Environment** → Edita `FRONTEND_URL`
3. Actualiza con la URL real de Vercel:
   ```
   https://inventario-casa-renta.vercel.app
   ```
4. Render redesplegará automáticamente

---

## ✅ Paso 5: Verificar Funcionamiento

### 5.1 Probar frontend
1. Abre `https://inventario-casa-renta.vercel.app`
2. Deberías ver la pantalla de login
3. Si hay errores CORS, revisa que `FRONTEND_URL` esté correcto en Render

### 5.2 Probar backend
```bash
# Health check
curl https://inventario-backend.onrender.com/api/health

# Login (reemplaza con credenciales reales)
curl -X POST https://inventario-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

### 5.3 Verificar base de datos
1. Ve a Neon.tech dashboard
2. Revisa que las tablas se hayan creado
3. Verifica que haya datos (si ejecutaste el script SQL)

---

## 🔧 Solución de Problemas Comunes

### Error: "Cannot connect to database"
- Verifica que `DATABASE_URL` en Render sea correcta
- Asegúrate de que la base de datos en Neon esté activa
- Revisa que el formato del connection string incluya `?sslmode=require`

### Error: CORS
- Verifica que `FRONTEND_URL` en Render coincida exactamente con la URL de Vercel
- Asegúrate de que no haya espacios extra en la variable

### Error: "Module not found" en deploy
- Verifica que `package.json` tenga todas las dependencias
- Asegúrate de que el comando de build sea correcto en `render.yaml`

### Error: "Prisma migrate fails"
- Ejecuta manualmente las migraciones:
  ```bash
  npx prisma migrate deploy
  ```
- O usa el script SQL incluido en `scripts/setup-database.sql`

### Frontend no carga archivos estáticos
- Verifica que `vercel.json` tenga las rewrites configuradas
- Asegúrate de que la ruta de archivos sea correcta

---

## 📊 Monitoreo

### Render
- Ve a tu servicio → **Logs** para ver logs en tiempo real
- **Metrics** para ver uso de CPU, memoria y requests

### Vercel
- Ve a tu proyecto → **Analytics** para ver visitas
- **Functions** para ver logs del frontend

### Neon
- Ve a tu proyecto → **Monitoring** para ver conexiones y queries

---

## 🔐 Seguridad en Producción

### Cambiar valores por defecto
1. **JWT_SECRET**: Usa una clave segura de al menos 32 caracteres
2. **Credenciales de admin**: Cambia la contraseña del admin por defecto
3. **DATABASE_URL**: Nunca la compartas públicamente

### Configurar dominio personalizado (opcional)
- **Vercel**: Settings → Domains → Agrega tu dominio
- **Render**: Settings → Custom Domains → Agrega tu dominio
- Actualiza `FRONTEND_URL` en Render con el nuevo dominio

---

## 🚨 Notas Importantes

1. **Plan Gratuito de Render**:
   - El servicio se "duerme" después de 15 minutos de inactividad
   - La primera request después de dormir tarda ~30 segundos
   - 512 MB RAM, 100 GB bandwidth/mes

2. **Plan Gratuito de Neon**:
   - 3 GB storage
   - La base de datos se "duerme" después de inactividad
   - 100 horas de compute/mes

3. **Plan Gratuito de Vercel**:
   - 100 GB bandwidth/mes
   - Dominio `*.vercel.app`
   - No tiene límite de tiempo activo

4. **Archivos subidos**:
   - En Render, los archivos se pierden al redesplegar
   - Para producción, considera usar AWS S3 o Cloudinary para almacenar logos

---

## 📝 Checklist de Despliegue

- [ ] Base de datos creada en Neon.tech
- [ ] Connection string de Neon copiada
- [ ] Backend desplegado en Render
- [ ] Variables de entorno configuradas en Render
- [ ] URL del backend anotada
- [ ] Frontend actualizado con URL del backend
- [ ] Frontend desplegado en Vercel
- [ ] URL del frontend anotada
- [ ] `FRONTEND_URL` actualizado en Render
- [ ] CORS funcionando correctamente
- [ ] Login funcionando
- [ ] CRUD de productos funcionando
- [ ] Movimientos funcionando
- [ ] Reportes funcionando

---

## 🆘 Soporte

Si tienes problemas:
1. Revisa los logs en Render y Vercel
2. Verifica las variables de entorno
3. Asegúrate de que las URLs sean correctas (sin espacios, con https)
4. Prueba localmente primero antes de desplegar

---

## 🎉 ¡Listo!

Tu aplicación debería estar funcionando en:
- **Frontend**: https://inventario-casa-renta.vercel.app
- **Backend**: https://inventario-backend.onrender.com
- **Base de datos**: Neon.tech (PostgreSQL)

Recuerda que en los planes gratuitos, los servicios pueden tardar en "despertar" después de inactividad.