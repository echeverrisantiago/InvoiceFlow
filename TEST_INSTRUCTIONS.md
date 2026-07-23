# 🧪 Instrucciones de Prueba - FactuMeIA

## ✅ Cambios Implementados

He arreglado el problema de autenticación con los siguientes cambios:

### 1. **Configuración de Cookies del Cliente** ([lib/supabase/client.ts](lib/supabase/client.ts))
- Configurado nombre de cookie explícito
- Establecido `domain: 'localhost'` y `sameSite: 'lax'`

### 2. **Mejora en Login/Register** ([app/login/page.tsx](app/login/page.tsx), [app/register/page.tsx](app/register/page.tsx))
- Verificación de sesión después del login
- Delay de 100ms para asegurar que cookies se guarden
- Uso de `router.push()` + `router.refresh()` en lugar de `window.location.href`

### 3. **Middleware Mejorado** ([lib/supabase/middleware.ts](lib/supabase/middleware.ts))
- Prevención de loop de redirección en `/login`
- Exclusión de rutas `/_next` y `/api/auth`
- Manejo correcto de cookies en setAll()

---

## 🔧 Prueba la Aplicación

### **Paso 1: Limpiar Estado**

1. Abre Chrome (o tu navegador)
2. Abre DevTools (F12) → **Application** → **Storage**
3. Click en **"Clear site data"** para limpiar TODO
4. Cierra DevTools

### **Paso 2: Registrar Nuevo Usuario**

1. Ve a: **http://localhost:3000**
2. Click en **"Registrarse"** o ve directamente a `/register`
3. Completa el formulario:
   ```
   Nombre: Test User
   Email: test2@example.com  (usa un email diferente)
   Contraseña: test1234
   Organización: Mi Empresa Test
   ```
4. Click **"Registrarse"**
5. Deberías ser redirigido al dashboard automáticamente

### **Paso 3: Verificar Sesión**

Después de registrarte, abre DevTools (F12) → Console y ejecuta:

```javascript
fetch('/api/organization/current', { credentials: 'include' })
  .then(r => r.json())
  .then(d => console.log('✅ Resultado:', d))
```

**Resultado Esperado:**
```json
{
  "organization": {
    "id": "...",
    "name": "Mi Empresa Test",
    "role": "ADMIN"
  }
}
```

**Si sale 401**: El problema persiste, ve a la sección de depuración abajo.

### **Paso 4: Verificar Cookies**

En DevTools (F12):
1. **Application** → **Cookies** → `http://localhost:3000`
2. Deberías ver cookies como:
   - `sb-ndlhwklksbjscqdtpjnk-auth-token` (o similar)
   - `sb-ndlhwklksbjscqdtpjnk-auth-token-code-verifier`

Si NO hay cookies, continúa a la depuración.

### **Paso 5: Probar Funcionalidades**

Si todo funciona:

1. ✅ **Dashboard**: Ve los KPIs (estarán en 0)
2. ✅ **Subir Factura**: `/dashboard/invoices/upload` - prueba subir un PDF o imagen
3. ✅ **Google Drive**: `/dashboard/settings` - conecta tu cuenta (opcional)

---

## 🐛 Depuración Si Aún Falla

### **Diagnóstico 1: Verificar Sesión en Cliente**

En Console (F12):

```javascript
// Verificar localStorage
console.log('LocalStorage keys:', Object.keys(localStorage));

// Verificar si hay token
const keys = Object.keys(localStorage);
const authKey = keys.find(k => k.includes('auth-token'));
if (authKey) {
  console.log('Auth key found:', authKey);
  console.log('Value:', localStorage.getItem(authKey));
} else {
  console.log('❌ No auth key in localStorage');
}
```

### **Diagnóstico 2: Verificar en Supabase Dashboard**

1. Ve a: https://supabase.com/dashboard/project/ndlhwklksbjscqdtpjnk
2. **Authentication** → **Users**
3. Verifica que tu usuario esté ahí y que:
   - ✅ Email confirmado (confirmed_at tiene fecha)
   - ✅ Last sign in tiene fecha reciente

### **Diagnóstico 3: Verificar Terminal del Servidor**

En la terminal donde corre `npm run dev`, deberías ver logs de las peticiones.

Si ves errores como:
- `Error: Invalid JWT` → Problema con las keys de Supabase
- `Error: No user found` → Usuario no existe en la BD

### **Diagnóstico 4: Probar con Thunder Client / Postman**

```
GET http://localhost:3000/api/organization/current
```

Sin cookies dará 401 (esperado).

Pero si copias las cookies del navegador y las agregas manualmente, debería funcionar.

---

## 🔄 Resetear Todo

Si nada funciona, resetea completamente:

### En Supabase:
1. **Authentication** → **Users** → Borra todos los usuarios
2. **Table Editor** → Ejecuta en SQL Editor:
   ```sql
   TRUNCATE "User", "Organization", "OrganizationMember", "Invoice", "Subscription", "AlertLog" CASCADE;
   ```

### En el Navegador:
1. F12 → Application → Clear site data
2. Cierra todas las pestañas de localhost
3. Cierra el navegador completamente
4. Abre de nuevo

### Reinicia el Servidor:
```bash
# Detén el servidor (Ctrl+C)
# Reinicia
npm run dev
```

---

## 📞 Información de Depuración para Reportar

Si el problema persiste, proporciona esta información:

1. **Navegador y versión**: (ej: Chrome 120)
2. **¿Hay cookies?**: Sí/No (captura de Application → Cookies)
3. **¿Qué dice localStorage?**: Output del diagnóstico 1
4. **Resultado de `/api/organization/current`**: JSON completo o error
5. **Logs de la terminal del servidor**: Copia los últimos logs cuando intentas login

---

## ✨ Si Todo Funciona

¡Felicidades! Ahora puedes:

1. 📤 **Subir facturas** y ver la extracción con IA
2. ☁️ **Conectar Google Drive** para backup automático
3. 📊 **Ver analytics** de tus facturas
4. 💰 **Configurar suscripción** (Mercado Pago - requiere credenciales)

**Disfruta FactuMeIA!** 🚀
