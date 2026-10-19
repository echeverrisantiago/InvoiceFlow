/**
 * Permite serializar `BigInt` con `JSON.stringify` (lo que usa
 * `NextResponse.json`).
 *
 * Los modelos tienen campos `BigInt` (`Invoice.messageUid`,
 * `EmailAccount.lastEmailUid`). Sin esto, devolver un registro de Prisma tal cual
 * lanza: "Do not know how to serialize a BigInt". Se convierte a string.
 */
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

export {};
