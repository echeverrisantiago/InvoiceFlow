# Backlog (post-MVP)

Ideas aceptadas pero **fuera del alcance del MVP**. Se documentan aquí para no
perderlas.

## Extractos bancarios (conciliación)

**Estado:** descartado del MVP. El sistema los ignora: no son cuentas por pagar.

**Por qué no ahora**

- Un extracto (Bancolombia, Davivienda, Nu, Lulo…) es un listado de movimientos,
  no una factura por pagar.
- Suelen venir en PDF **protegido con contraseña** (cédula/NIT del titular).
- Leerlos obliga a custodiar credenciales bancarias y ampliar la política de
  privacidad.

**Qué hace hoy el sistema**

- `isBankStatementAttachment()` (`lib/email-file.ts`) descarta los adjuntos con
  nombre de extracto **antes** de llamar a la IA.
- Si alguno se cuela, el clasificador devuelve `documentType: "EXTRACTO"` y la
  factura se elimina.

**Diseño propuesto si se retoma**

1. Entidad propia `BankStatement` (nunca `Invoice`).
2. Extracción con `pdfjs` (`getDocument({ password })`) para PDFs protegidos.
3. Pedir la contraseña una vez por cuenta y guardarla **cifrada** con
   AES-256-GCM (igual que los tokens OAuth, `lib/token-crypto.ts`).
4. UI para introducir/actualizar la clave y ver el estado de la conexión.
5. Consentimiento explícito en la Política de Privacidad (subir versión y
   recalcular hash con `npm run legal:hash`).
6. Uso previsto: **conciliación** (cruzar pagos con facturas), no listarlos como
   facturas.

**Riesgos a evaluar**

- Custodia de credenciales bancarias (Ley 1581 de 2012).
- Falsos positivos al clasificar movimientos.
- Coste de IA por documento y volumen.
