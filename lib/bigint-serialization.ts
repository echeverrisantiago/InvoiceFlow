/**
 * Permite serializar `BigInt` con `JSON.stringify` (lo que usa
 * `NextResponse.json`).
 *
 * Ningún modelo usa hoy `BigInt`, pero devolver un registro con uno lanzaría
 * "Do not know how to serialize a BigInt". Se convierte a string como red de
 * seguridad para futuros campos.
 */
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

export {};
